import * as vscode from "vscode";
import * as http from "node:http";
import { spawn } from "node:child_process";

function getConfig() {
  return vscode.workspace.getConfiguration("dsh-launcher");
}

function isDshRunning(dshUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(dshUrl, (response) => {
      response.resume();
      resolve(true);
    });

    request.on("error", () => {
      resolve(false);
    });

    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function startDsh(dshCommand: string, dshArgs: string[]): void {
  const process = spawn(dshCommand, dshArgs, {
    detached: true,
    stdio: "ignore",
  });

  process.unref();
}

async function waitForDsh(dshUrl: string): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    if (await isDshRunning(dshUrl)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

function openDshPanel(dshUrl: string) {
  const panel = vscode.window.createWebviewPanel(
    "dsh",
    "DSH",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
    },
  );

  panel.webview.html = `
    <!DOCTYPE html>
    <html>
      <body style="padding: 0; margin: 0;">
        <iframe
          src="${dshUrl}"
          style="
            width: 100vw;
            height: 100vh;
            border: none;
          "
        ></iframe>
      </body>
    </html>
  `;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "dsh-launcher" is now active.');
  const config = getConfig();
  const dshUrl = config.get<string>("url", "http://127.0.0.1:3080");
  const dshCommand = config.get<string>("command", "dsh");
  const dshArgs = config.get<string[]>("args", ["web", "--no-open"]);

  const launcher = vscode.commands.registerCommand(
    "dsh-launcher.launch",
    async () => {
      vscode.window.showInformationMessage("Launching DeepSeek Harness...");

      let running = await isDshRunning(dshUrl);

      if (!running) {
        startDsh(dshCommand, dshArgs);

        running = await waitForDsh(dshUrl);

        if (!running) {
          vscode.window.showErrorMessage(
            "DSH failed to start on http://127.0.0.1:3080",
          );
          return;
        }
      }

      openDshPanel(dshUrl);
    },
  );

  context.subscriptions.push(launcher);
}

export function deactivate() {}
