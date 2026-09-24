import * as vscode from "vscode";
import { DshService } from "./dsh";
import { DshViewProvider } from "./dshView";
import { DshPanel } from "./dshPanel";

function getConfig() {
  return vscode.workspace.getConfiguration("dsh-launcher");
}

export function activate(context: vscode.ExtensionContext) {
  const config = getConfig();
  const dshUrl = config.get<string>("url", "http://127.0.0.1:3080");
  const dshCommand = config.get<string>("command", "dsh");
  const dshArgs = config.get<string[]>("args", ["web", "--no-open"]);

  const dshService = new DshService(dshUrl, dshCommand, dshArgs);

  // --- Activity Bar sidebar view ----------------------------------------

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DshViewProvider.viewType,
      new DshViewProvider(dshService),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // --- Commands -----------------------------------------------------------

  // DSH Launcher: Launch — reveal the DSH Activity Bar container.
  context.subscriptions.push(
    vscode.commands.registerCommand("dsh-launcher.launch", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.dsh-launcher",
      );
    }),
  );

  // DSH Launcher: Open in Sidebar — reveal the DSH Activity Bar view.
  context.subscriptions.push(
    vscode.commands.registerCommand("dsh-launcher.openSidebar", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.dsh-launcher",
      );
    }),
  );

  // DSH Launcher: Open in Editor — open DSH in an editor tab.
  context.subscriptions.push(
    vscode.commands.registerCommand("dsh-launcher.openEditor", async () => {
      await DshPanel.openOrReveal(dshService);
    }),
  );

  // Push the service as a disposable so it is cleaned up on deactivation.
  context.subscriptions.push({
    dispose: () => dshService.close(),
  });
}

export function deactivate() {
  // DSH child process is not detached — it will be killed when the
  // extension host shuts down.  The proxy server is closed via the
  // subscription registered in activate().
}