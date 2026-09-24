/**
 * Transparent HTTP proxy for the DSH web UI.
 *
 * DSH's token-based auth issues a session cookie on a 303 redirect.
 * In the VS Code webview iframe the browser cannot handle this
 * correctly (SameSite restrictions, cookie isolation).  This proxy
 * performs the token exchange from Node.js (outside the browser's
 * sandbox), captures the signed session cookie, and injects it into
 * every forwarded request.
 *
 * Additionally, the proxy injects a clipboard bridge into HTML
 * responses so that copy operations inside the DSH iframe are
 * forwarded to the VS Code extension host.
 */

import * as http from "node:http";
import { connect } from "node:net";

function originFor(authority: string): string {
  return `http://${authority}`;
}

// ── Clipboard bridge script ─────────────────────────────────────────────

/**
 * JavaScript injected into every HTML page served through the proxy.
 * It intercepts clipboard copy operations inside the DSH iframe and
 * forwards them to the outer VS Code webview via postMessage.
 */
const CLIPBOARD_BRIDGE_SCRIPT = `\n<script>
(function(){
  if (typeof window === "undefined" || !window.parent || window.parent === window) return;
  try { void window.parent.location; return; } catch(e) {}
  var BRIDGE = "dsh:clipboard-write";
  function bridgeWrite(text) {
    if (!text) return;
    try { window.parent.postMessage({ type: BRIDGE, text: text }, "*"); }
    catch(_) {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(text);
    }
  }
  document.addEventListener("copy", function(e) {
    var text = window.getSelection() ? window.getSelection().toString() : "";
    if (!text) return;
    e.preventDefault();
    e.stopPropagation();
    bridgeWrite(text);
  });
  document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      var text = window.getSelection() ? window.getSelection().toString() : "";
      if (!text) return;
      e.preventDefault();
      e.stopPropagation();
      bridgeWrite(text);
    }
  });
  if (navigator) {
    navigator.clipboard = navigator.clipboard || {};
    navigator.clipboard.writeText = function(text) {
      bridgeWrite(text);
      return Promise.resolve();
    };
  }
})();\n<\/script>\n</body>`;

// ── Proxy ──────────────────────────────────────────────────────────────

/**
 * Build the forwarded headers for a proxied request.
 *
 * Strips connection-specific headers and the browser's original Origin
 * (which would have the proxy's port), then adds the rewritten Host,
 * injected Cookie, and corrected Origin matching the DSH target.
 */
function buildForwardHeaders(
  original: http.IncomingHttpHeaders,
  targetAuthority: string,
  sessionCookie: string,
): http.OutgoingHttpHeaders {
  const out: Record<string, string | string[]> = {};
  for (const [key, val] of Object.entries(original)) {
    if (val === undefined) continue;
    const lk = key.toLowerCase();
    if (lk === "connection" || lk === "proxy-connection" || lk === "host" || lk === "cookie" || lk === "origin") continue;
    out[key] = val;
  }
  out.Host = targetAuthority;
  out.Cookie = sessionCookie;
  out.Origin = originFor(targetAuthority);
  return out;
}

/**
 * Replace the closing </body> tag in an HTML response to inject the
 * clipboard bridge script. Returns the modified body as a Buffer.
 */
function injectClipboardBridge(body: Buffer): Buffer {
  const idx = body.lastIndexOf("</body>");
  if (idx === -1) return body;
  const before = body.subarray(0, idx);
  const after = body.subarray(idx + 7); // skip "</body>"
  return Buffer.concat([before, Buffer.from(CLIPBOARD_BRIDGE_SCRIPT, "utf8"), after]);
}

/**
 * A minimal HTTP proxy that forwards requests to a target DSH server.
 *
 * For every request the proxy:
 * 1. Rewrites `Host` to the target authority so the session cookie name
 *    matches.
 * 2. Injects the `Cookie` header with the pre-captured session cookie.
 * 3. Rewrites `Origin` to match the target (bypasses DSH's trust fence).
 * 4. Injects the clipboard bridge script into HTML responses.
 * 5. Forwards the modified request and pipes the response back.
 *
 * WebSocket connections are passed through so DSH's transport layer
 * (WebSocket /api/remote.mux) works.
 *
 * @param targetHost - DSH server hostname (e.g. `"127.0.0.1"`).
 * @param targetPort - DSH server port.
 * @param sessionCookie - the captured `name=value` session cookie.
 * @returns the proxy `{ server, port }` (listening on `127.0.0.1` with
 *          the OS-assigned port).
 */
export function createProxy(
  targetHost: string,
  targetPort: number,
  sessionCookie: string,
): Promise<{ server: http.Server; port: number }> {
  const targetAuthority = `${targetHost}:${targetPort}`;

  const server = http.createServer((clientReq, clientRes) => {
    // Forward to DSH via a second HTTP request.
    const dshReq = http.request({
      hostname: targetHost,
      port: targetPort,
      path: clientReq.url,
      method: clientReq.method,
      headers: buildForwardHeaders(clientReq.headers, targetAuthority, sessionCookie),
    }, (dshRes) => {
      // Check whether this is an HTML response we should inject into.
      const contentType = (dshRes.headers["content-type"] ?? "") as string;
      const isHtml = contentType.includes("text/html");

      if (!isHtml) {
        // Pass through untouched.
        clientRes.writeHead(dshRes.statusCode!, dshRes.headers);
        dshRes.pipe(clientRes);
        return;
      }

      // Collect the body, inject clipboard bridge, then write.
      const chunks: Buffer[] = [];
      dshRes.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      dshRes.on("end", () => {
        const body = Buffer.concat(chunks);
        const patched = injectClipboardBridge(body);
        // Fix Content-Length if present.
        const headers = { ...dshRes.headers };
        delete headers["content-length"];
        clientRes.writeHead(dshRes.statusCode!, headers);
        clientRes.end(patched);
      });
    });

    dshReq.on("error", () => {
      clientRes.writeHead(502);
      clientRes.end("Proxy error");
    });

    clientReq.pipe(dshReq);
  });

  // WebSocket upgrade forwarding via raw TCP to DSH.
  server.on("upgrade", (clientReq, clientSocket, head) => {
    const dshSocket = connect(targetPort, targetHost, () => {
      const path = clientReq.url ?? "/";
      let raw = `GET ${path} HTTP/1.1\r\n`;
      for (let i = 0; i < clientReq.rawHeaders.length; i += 2) {
        const key = clientReq.rawHeaders[i];
        const val = clientReq.rawHeaders[i + 1];
        const lk = key.toLowerCase();
        if (lk === "proxy-connection" || lk === "cookie" || lk === "host" || lk === "origin") continue;
        raw += `${key}: ${val}\r\n`;
      }
      raw += `Host: ${targetAuthority}\r\n`;
      raw += `Cookie: ${sessionCookie}\r\n`;
      raw += `Origin: ${originFor(targetAuthority)}\r\n`;
      raw += "\r\n";
      dshSocket.write(Buffer.from(raw, "utf8"));
      if (head.length > 0) dshSocket.write(head);
      clientSocket.pipe(dshSocket);
      dshSocket.pipe(clientSocket);
    });

    clientSocket.on("error", () => dshSocket.destroy());
    dshSocket.on("error", () => clientSocket.destroy());
  });

  // Start on a random port.
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as import("net").AddressInfo).port;
      resolve({ server, port });
    });
  });
}