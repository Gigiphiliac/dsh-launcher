import * as http from "node:http";
import { spawn, ChildProcess } from "node:child_process";
import * as vscode from "vscode";
import { createProxy } from "./dshProxy";

// ── Server Info ─────────────────────────────────────────────────────────

/**
 * Parsed DSH origin (host + port) so the proxy and CSP can reference it.
 */
interface DshOrigin {
  readonly host: string;
  readonly port: number;
}

function parseOrigin(url: string): DshOrigin | undefined {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: Number(u.port) || 80 };
  } catch {
    return undefined;
  }
}

// ── Service ─────────────────────────────────────────────────────────────

/**
 * Shared service responsible for the DSH process / proxy lifecycle.
 *
 * Both the sidebar and editor views depend on this single instance so the
 * server is never started twice.
 *
 * DSH 0.1.5+ requires **token-based authentication**.  The extension starts
 * DSH, captures its one-time auth URL from stdout, performs the token
 * exchange via Node.js (outside the browser's SameSite sandbox), captures
 * the session cookie, and starts a local HTTP proxy that injects the cookie
 * into every forwarded request.  The iframe in the VS Code webview loads
 * the proxy URL instead of DSH directly.
 */
export class DshService {
  private readonly baseUrl: string;
  private readonly command: string;
  private readonly args: string[];
  private process: ChildProcess | undefined;

  /** Accumulated stdout buffer; consumed once the auth URL is found. */
  private stdoutBuffer = "";

  /**
   * The authenticated DSH URL (with `?token=...` query parameter),
   * extracted from DSH's stdout on startup.  `undefined` when DSH was
   * started externally or hasn't printed the URL yet.
   */
  private authUrl: string | undefined;

  /** Resolved when the auth URL is captured from stdout. */
  private resolveAuthUrl!: (url: string) => void;
  private authUrlPromise: Promise<string>;

  // ── Proxy fields ──────────────────────────────────────────────────────

  private proxyServer: http.Server | undefined;
  private proxyUrl: string | undefined;

  constructor(baseUrl: string, command: string, args: string[]) {
    this.baseUrl = baseUrl;
    this.command = command;
    this.args = args;
    this.authUrlPromise = new Promise((resolve) => {
      this.resolveAuthUrl = resolve;
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * URL the VS Code webview should load (either the proxy URL when the
   * token exchange succeeded, the embedded-token URL, or the raw base URL
   * for older DSH versions that don't require auth).
   */
  get serverUrl(): string {
    const result = this.proxyUrl ?? this.authUrl ?? this.baseUrl;
    console.log("dsh-launcher: serverUrl →", result);
    return result;
  }

  /**
   * The origin (scheme + host + port) used in `frame-src` CSP.
   */
  get serverOrigin(): string {
    try {
      const parsed = new URL(this.serverUrl);
      const result = `${parsed.protocol}//${parsed.host}`;
      console.log("dsh-launcher: serverOrigin →", result);
      return result;
    } catch {
      return this.baseUrl;
    }
  }

  /**
   * Check whether the DSH HTTP server is already responding.
   * Any HTTP response (including 401) counts as "running".
   */
  async isRunning(): Promise<boolean> {
    const checkUrl = this.authUrl ?? this.baseUrl;
    const status = await this.httpGetStatus(checkUrl);
    return status !== false;
  }

  /**
   * One-shot helper: ensure DSH is running and the proxy is ready.
   *
   * 1. If we already have a proxy URL → return true immediately.
   * 2. If DSH is running and returns 200/303 (old DSH, no auth) →
   *    return true using the base URL.
   * 3. If DSH is running and returns 401 (needs auth but no captured
   *    token) → show a notification with the kill command, return false.
   * 4. Otherwise, start a fresh DSH process, wait for the auth URL from
   *    stdout, perform the token exchange, and start the local proxy.
   */
  async ensureRunning(): Promise<boolean> {
    if (this.proxyUrl) {
      return true;
    }

    const status = await this.httpGetStatus(this.baseUrl);

    if (status === 200 || status === 303) {
      // Responding and clearly not asking for auth — old DSH version.
      return true;
    }

    if (status === 401) {
      // DSH is running with auth but we didn't capture the token / proxy.
      vscode.window.showWarningMessage(
        `DSH ${
          this.baseUrl
        } requires authentication. Kill the stale process and try again:\n` +
        `  kill $(lsof -ti:${new URL(this.baseUrl).port || "3080"})`,
      );
      return false;
    }

    // No DSH running, or in a transient state.  Start fresh.
    this.start();
    return this.waitForReady();
  }

  /**
   * Tear down the proxy server when the extension deactivates.
   */
  close(): void {
    if (this.proxyServer) {
      this.proxyServer.close();
      this.proxyServer = undefined;
      this.proxyUrl = undefined;
    }
  }

  // ── Process lifecycle ────────────────────────────────────────────────────

  /**
   * Spawn a fresh DSH process and pipe stdout so we can extract the
   * authentication token URL.
   */
  start(): void {
    if (this.process) {
      return;
    }

    const child = spawn(this.command, this.args, {
      stdio: ["ignore", "pipe", "inherit"],
    });

    this.stdoutBuffer = "";
    child.stdout?.on("data", (data: Buffer) => {
      this.stdoutBuffer += data.toString();
      console.log(
        "dsh-launcher: stdout chunk:",
        data.toString().trim().substring(0, 120),
      );
      this.tryExtractAuthUrl();
    });

    child.on("spawn", () => {
      console.log("dsh-launcher: DSH process spawned");
    });

    child.on("error", (err) => {
      console.error("dsh-launcher: DSH process error:", err.message);
      this.process = undefined;
    });

    child.on("exit", (code, signal) => {
      console.log(
        `dsh-launcher: DSH process exited (code=${code}, signal=${signal})`,
      );
      this.process = undefined;
      this.close(); // tear down the proxy
    });

    this.process = child;
  }

  /**
   * Wait for the auth URL from stdout, perform the token exchange, start
   * the local proxy, and verify the server is reachable through it.
   */
  private async waitForReady(): Promise<boolean> {
    // Phase 1 — wait for stdout to yield the auth URL.
    let url: string;
    try {
      url = await Promise.race([
        this.authUrlPromise,
        this.delayThenThrow(15_000),
      ]);
    } catch {
      console.warn("dsh-launcher: timed out waiting for DSH auth URL from stdout");
      return false;
    }
    if (!url) return false;

    // Phase 2 — verify the DSH server responds (303 = token exchange OK).
    let dshAlive = false;
    for (let i = 0; i < 10; i++) {
      const status = await this.httpGetStatus(url);
      if (status !== false) { dshAlive = true; break; }
      await this.delay(500);
    }
    if (!dshAlive) return false;

    // Phase 3 — token exchange from Node.js; start the proxy.
    const ok = await this.setupProxy(url);
    if (!ok) {
      console.warn("dsh-launcher: failed to set up proxy — falling back to direct URL");
      return true; // Continue without proxy — view will show 401.
    }

    // Phase 4 — verify the proxy is serving.
    for (let i = 0; i < 6; i++) {
      const status = await this.httpGetStatus(this.proxyUrl!);
      if (status === 200) return true;
      if (status !== false) {
        // Got a response (might be 401 or 303) — proxy is alive.
        return true;
      }
      await this.delay(300);
    }

    console.warn("dsh-launcher: proxy never responded — falling back");
    return true;
  }

  // ── Token exchange & proxy setup ──────────────────────────────────────

  /**
   * Perform the token exchange from Node.js and start the local proxy.
   *
   * 1. Makes a Node.js HTTP GET to the auth URL (`/?token=X`).  The 303
   *    redirect is *not* followed automatically because
   *    `http.get({ maxRedirects: 0 })` lets us capture the `Set-Cookie`
   *    header from the 303 response.
   * 2. Extracts the session cookie (`name=value` part).
   * 3. Starts a local HTTP proxy that injects this cookie and rewrites the
   *    Host header on every forwarded request.
   */
  private async setupProxy(authUrl: string): Promise<boolean> {
    try {
      const origin = parseOrigin(authUrl);
      if (!origin) {
        console.warn("dsh-launcher: setupProxy — cannot parse auth URL", authUrl);
        return false;
      }

      // Get the session cookie via Node.js (no SameSite restrictions).
      const cookie = await this.exchangeToken(authUrl);
      if (!cookie) {
        console.warn("dsh-launcher: setupProxy — token exchange returned no cookie");
        return false;
      }

      // Start the proxy.
      const { server, port } = await createProxy(origin.host, origin.port, cookie);
      this.proxyServer = server;
      this.proxyUrl = `http://127.0.0.1:${port}`;
      console.log("dsh-launcher: setupProxy — proxy ready at", this.proxyUrl);
      return true;
    } catch (err) {
      console.warn(
        "dsh-launcher: setupProxy — error:",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  /**
   * Make a GET to the auth URL without following redirects, capture the
   * session cookie from the 303 `Set-Cookie` response header.
   *
   * Returns the `name=value` portion of the first cookie, or `undefined`
   * when the token exchange fails.
   */
  private exchangeToken(authUrl: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      // Parse the auth URL to reuse its components.
      const u = new URL(authUrl);
      const options: http.RequestOptions = {
        hostname: u.hostname,
        port: Number(u.port) || 80,
        path: u.pathname + u.search,
        method: "GET",
        // Don't follow redirects — we need the 303 to capture Set-Cookie.
      };

      const req = http.request(options, (res) => {
        const status = res.statusCode ?? 0;
        const rawCookies = res.headers["set-cookie"];
        res.resume(); // drain

        if (status === 303 && rawCookies && rawCookies.length > 0) {
          // `rawCookies` is `string | string[]`.  Take the first cookie
          // and extract only the `name=value` portion.
          const first = Array.isArray(rawCookies) ? rawCookies[0] : rawCookies;
          const sessionCookie = first.split(";")[0].trim();
          console.log("dsh-launcher: exchangeToken — captured session cookie");
          resolve(sessionCookie);
        } else {
          console.warn(
            `dsh-launcher: exchangeToken — unexpected response (status=${status}, cookies=${rawCookies?.length ?? 0})`,
          );
          resolve(undefined);
        }
      });

      req.on("error", (err) => {
        console.warn("dsh-launcher: exchangeToken — error:", err.message);
        resolve(undefined);
      });

      req.setTimeout(3000, () => {
        req.destroy();
        console.warn("dsh-launcher: exchangeToken — timeout");
        resolve(undefined);
      });

      req.end();
    });
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  /** Scan the accumulated stdout for the authenticated URL. */
  private tryExtractAuthUrl(): void {
    const match = this.stdoutBuffer.match(/https?:\/\/[^\s]+/);
    if (match && !this.authUrl) {
      this.authUrl = match[0];
      this.resolveAuthUrl(this.authUrl);
    }
  }

  private httpGetStatus(checkUrl: string): Promise<number | false> {
    return new Promise((resolve) => {
      const request = http.get(checkUrl, (response) => {
        response.resume();
        resolve(response.statusCode ?? false);
      });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private delayThenThrow(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    );
  }
}

// ── Clipboard bridge (unchanged) ─────────────────────────────────────────

export interface ClipboardWriteMessage {
  readonly type: "clipboard-write";
  readonly text: string;
}

export async function handleClipboardMessage(message: unknown): Promise<boolean> {
  if (
    typeof message !== "object" ||
    message === null ||
    (message as Record<string, unknown>).type !== "clipboard-write" ||
    typeof (message as Record<string, unknown>).text !== "string"
  ) {
    return false;
  }

  const msg = message as ClipboardWriteMessage;
  await vscode.env.clipboard.writeText(msg.text);
  return true;
}