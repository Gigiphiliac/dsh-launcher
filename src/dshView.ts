import * as vscode from "vscode";
import { DshService } from "./dsh";
import { createDshHtml, LOADING_HTML, ERROR_HTML } from "./dshHtml";

/**
 * WebviewViewProvider for the DSH Activity Bar sidebar view.
 *
 * Registered via `registerWebviewViewProvider` in `extension.ts`.
 * The view type must match the view id declared in `package.json`.
 */
export class DshViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "dsh-launcher.view";

  constructor(private readonly dshService: DshService) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = { enableScripts: true };

    // Show a loading indicator immediately so the sidebar feels responsive.
    webviewView.webview.html = LOADING_HTML;

    // Ensure DSH is running, then swap in the real UI.
    this.dshService.ensureRunning().then(
      (running) => {
        if (running) {
          webviewView.webview.html = createDshHtml(this.dshService.serverUrl);
        } else {
          webviewView.webview.html = ERROR_HTML;
          vscode.window.showErrorMessage(
            `DSH failed to start on ${this.dshService.serverUrl}`,
          );
        }
      },
      (err) => {
        console.error("dsh-launcher: ensureRunning error:", err);
        webviewView.webview.html = ERROR_HTML;
        vscode.window.showErrorMessage(
          `DSH error: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    );
  }
}