/**
 * Shared function for generating the iframe HTML used by both
 * the sidebar (WebviewView) and editor (WebviewPanel) views.
 *
 * Keeps the markup in one place so neither UI module duplicates it.
 */

export function createDshHtml(dshUrl: string): string {
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
      content="default-src 'none'; frame-src ${dshUrl}; style-src 'unsafe-inline';"
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
    <iframe src="${dshUrl}" title="DeepSeek Harness"></iframe>
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