/**
 * Shared function for generating the iframe HTML used by both
 * the sidebar (WebviewView) and editor (WebviewPanel) views.
 *
 * Keeps the markup in one place so neither UI module duplicates it.
 *
 * @param dshUrl - The full URL for the iframe `src` (with `?token=...`).
 * @param cspOrigin - The origin-only URL used in `frame-src` CSP so that
 *                    DSH's 303 redirect to `/` is not blocked.
 */
export function createDshHtml(dshUrl: string, cspOrigin?: string): string {
  const frameSrc = cspOrigin ?? dshUrl;
  // VS Code's webview enforces CSP on all content including iframes, so we
  // must allow both HTTP (fetch/XHR) and WebSocket (ws:) connections to the
  // proxy origin for the DSH API transport.
  const wsOrigin = frameSrc.replace(/^http:/, "ws:");
  const contentSecurity = [
    `default-src 'none'`,
    `frame-src ${frameSrc}`,
    `connect-src ${frameSrc} ${wsOrigin}`,
    `style-src 'unsafe-inline'`,
    `script-src 'unsafe-inline'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0"
    />
    <meta
      http-equiv="Content-Security-Policy"
      content="${contentSecurity}"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; }
      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: none;
      }
    </style>
    <title>DSH</title>
  </head>
  <body>
    <iframe id="dsh-iframe" src="${dshUrl}" title="DeepSeek Harness"></iframe>
    <script>
      (function() {
        const vscode = acquireVsCodeApi();
        const iframe = document.getElementById("dsh-iframe");

        window.addEventListener("message", function (event) {
          // Only accept messages from the DSH iframe.
          if (event.source !== iframe.contentWindow) return;

          if (
            !event.data ||
            event.data.type !== "dsh:clipboard-write" ||
            typeof event.data.text !== "string"
          ) return;

          vscode.postMessage({
            type: "clipboard-write",
            text: event.data.text,
          });
        });
      }());
    </script>
  </body>
</html>`;
}

export const LOADING_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--vscode-sideBar-background, #1e1e1e); color: var(--vscode-sideBar-foreground, #cccccc); font-family: var(--vscode-font-family, sans-serif); font-size: 13px; }
      .container { text-align: center; }
      .spinner { width: 24px; height: 24px; border: 3px solid var(--vscode-progressBar-background, #0e639c); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <title>Starting DSH…</title>
  </head>
  <body>
    <div class="container">
      <div class="spinner"></div>
      <div>Starting DeepSeek Harness…</div>
    </div>
  </body>
</html>`;

export const ERROR_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--vscode-sideBar-background, #1e1e1e); color: var(--vscode-sideBar-foreground, #cccccc); font-family: var(--vscode-font-family, sans-serif); font-size: 13px; }
      .container { text-align: center; max-width: 280px; }
      .icon { font-size: 24px; margin-bottom: 8px; }
      .detail { margin-top: 8px; font-size: 12px; opacity: 0.7; }
    </style>
    <title>DSH Error</title>
  </head>
  <body>
    <div class="container">
      <div class="icon">⚠</div>
      <div>Failed to start DeepSeek Harness</div>
      <div class="detail">Check that DSH is installed and the configured command is correct.</div>
    </div>
  </body>
</html>`;