import * as http from "node:http";
import { spawn, ChildProcess } from "node:child_process";

/**
 * Shared service responsible for the DSH process / server lifecycle.
 *
 * Both the sidebar and editor views depend on this single instance
 * so the server is never started twice.
 */
export class DshService {
  private readonly url: string;
  private readonly command: string;
  private readonly args: string[];
  private process: ChildProcess | undefined;

  constructor(url: string, command: string, args: string[]) {
    this.url = url;
    this.command = command;
    this.args = args;
  }

  /** URL the DSH server is expected to serve on. */
  get serverUrl(): string {
    return this.url;
  }

  /**
   * Check whether the DSH HTTP server is already responding.
   * This is the source-of-truth — we don't rely purely on tracking a
   * child process because another instance may already be running.
   */
  async isRunning(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const request = http.get(this.url, (response) => {
        response.resume();
        resolve(true);
      });

      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Start the DSH process detached from the parent so it survives
   * VS Code closing (consistent with the current behaviour).
   */
  start(): void {
    if (this.process) {
      return; // already started locally
    }

    const child = spawn(this.command, this.args, {
      detached: true,
      stdio: "ignore",
    });

    child.unref();
    this.process = child;
  }

  /**
   * Poll the DSH HTTP server up to ~15 seconds (30 × 500 ms).
   * Returns `true` if the server became available, `false` otherwise.
   */
  async waitForReady(): Promise<boolean> {
    for (let i = 0; i < 30; i++) {
      if (await this.isRunning()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }

  /**
   * One-shot helper: check if DSH is running, start it if not, then
   * wait for it to become available.
   *
   * Views call this single entry point rather than orchestrating the
   * three steps themselves.
   */
  async ensureRunning(): Promise<boolean> {
    if (await this.isRunning()) {
      return true;
    }
    this.start();
    return this.waitForReady();
  }
}