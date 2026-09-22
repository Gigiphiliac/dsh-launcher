import * as vscode from "vscode";
import { DshService } from "./dsh";
import { createDshHtml } from "./dshHtml";

/**
 * Editor-based DSH view using a WebviewPanel.
 *
 * Uses a static Map keyed by viewType to prevent duplicate DSH
 * editor tabs — the official VS Code extension sample pattern.
 */
export class DshPanel {
  public static readonly viewType = "dsh-launcher.editor";

  private static readonly panels = new Map<string, vscode.WebviewPanel>();

  private constructor() {
    // All methods are static; no instances needed.
  }

  /**
   * Open or reveal the DSH editor panel.
   *
   * If a panel with this viewType already exists and is not disposed
   * it is revealed and focused. Otherwise a new panel is created.
   */
  static async openOrReveal(dshService: DshService): Promise<void> {
    // Ensure DSH is running before creating or revealing the panel.
    const running = await dshService.ensureRunning();
    if (!running) {
      vscode.window.showErrorMessage(
        `DSH failed to start on ${dshService.serverUrl}`,
      );
      return;
    }

    const existing = DshPanel.panels.get(DshPanel.viewType);
    if (existing) {
      existing.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DshPanel.viewType,
      "DSH",
      vscode.ViewColumn.One,
      { enableScripts: true },
    );

    panel.webview.html = createDshHtml(dshService.serverUrl);

    // Clean up the map entry when the panel is closed.
    panel.onDidDispose(() => {
      DshPanel.panels.delete(DshPanel.viewType);
    });

    DshPanel.panels.set(DshPanel.viewType, panel);
  }
}