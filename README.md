# DSH Launcher

A lightweight VS Code extension for launching and opening a local [DeepSeek Harness (DSH)](https://github.com/DeepSeek-AI/DeepSeek-Harness) instance directly inside VS Code.

DSH remains responsible for its own workspace and project management. **DSH Launcher simply handles starting the local web server when necessary and displaying its web interface inside VS Code.**

## Features

* Launch DSH directly from the VS Code Command Palette or Activity Bar
* Open DSH in the **Activity Bar sidebar** or an **editor tab** — or both, simultaneously
* Detect whether DSH is already running before starting it
* Automatically wait for DSH to become available
* Reuse an existing DSH instance — no duplicate processes
* Configure the DSH command, arguments, and server URL
* **Clipboard integration** — copy text and code from DSH into any application

## Commands

| Command                         | Description                                   |
| ------------------------------- | --------------------------------------------- |
| `DSH Launcher: Launch`          | Open DSH in the Activity Bar sidebar (default)|
| `DSH Launcher: Open in Sidebar` | Reveal the DSH Activity Bar sidebar           |
| `DSH Launcher: Open in Editor`  | Open DSH as an editor tab                     |

All commands are available from the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).

The DSH icon also appears in the VS Code Activity Bar. Click it to open the sidebar view.

### Open in Sidebar

Opens DSH in a collapsible sidebar panel within the Activity Bar. The sidebar can be resized and collapsed using normal VS Code behavior.

### Open in Editor

Opens DSH in a regular editor tab, providing the full main-editor area. Calling this command multiple times reveals the existing tab instead of creating duplicates.

Both views share the same DSH server and configuration. Opening one while the other is already open will not start a second DSH process.

## Configuration

The extension provides the following settings:

| Setting                | Default                 | Description                     |
| ---------------------- | ----------------------- | ------------------------------- |
| `dsh-launcher.command` | `dsh`                   | Executable used to start DSH    |
| `dsh-launcher.args`    | `["web", "--no-open"]`  | Arguments passed to DSH         |
| `dsh-launcher.url`     | `http://127.0.0.1:3080` | URL of the local DSH web server |

For example, the default configuration starts:

```bash
dsh web --no-open
```

and expects the web interface to be available at:

```text
http://127.0.0.1:3080
```

## Clipboard Integration

Copying text and code from DSH normally uses the browser Clipboard API
(`navigator.clipboard.writeText` or the `copy` event's `clipboardData`).
VS Code's webview sandbox blocks these APIs, so copy operations fail when
DSH is embedded in the Activity Bar sidebar or editor tab.

DSH Launcher solves this with a **clipboard bridge**: DSH forwards
clipboard requests to the VS Code extension host through a `postMessage`
channel, and the extension host writes to the real system clipboard using
`vscode.env.clipboard.writeText`.

### How it works

```text
DSH web app
    │
    │ window.parent.postMessage({ type: "dsh:clipboard-write", text })
    ▼
Outer VS Code webview (bridge script)
    │
    │ vscode.postMessage({ type: "clipboard-write", text })
    ▼
Extension host
    │
    │ vscode.env.clipboard.writeText(text)
    ▼
System clipboard
```

### Setup

The clipboard bridge requires a small **DSH client plugin** to be installed
into your DSH profile. The plugin intercepts `copy` events and
`navigator.clipboard.writeText()` calls inside DSH and redirects them
through the bridge.

Install it with:

```bash
make install-plugin
```

or manually:

```bash
dsh plugin --profile web add "file:$(pwd)/resources/dsh-vscode-clipboard"
```

After installation, reload DSH (`dsh web` or restart the extension).

The plugin works automatically — both keyboard copy (`Cmd+C`)
and programmatic copy (DSH's copy buttons) are forwarded to the clipboard.

The plugin is a no-op in a normal browser outside VS Code.

## Architecture

DSH Launcher uses a shared `DshService` that manages the DSH server lifecycle. Both the sidebar panel and the editor tab depend on this single instance, ensuring DSH is never started twice.

```text
                        VS Code
                           │
                    ┌──────┴──────┐
                    │             │
              Activity Bar      Command
                    │             │
                    ▼             ▼
              DSH Sidebar    Open in Editor
                    │             │
                    ▼             ▼
              WebviewView     WebviewPanel
                    │             │
                    └──────┬──────┘
                           │
                           ▼
                     DSH Web UI
                           │
                           ▼
                  localhost:3080
                           ▲
                           │
                     DshService
                           │
                           ▼
              `dsh web --no-open`
```

## Quick Install (Makefile)

The easiest way to build, install, and configure everything is with the included Makefile:

```bash
make install
```

This single command compiles the extension, packages it as a VSIX, installs
it into VS Code (overwriting any previous version), and installs the DSH
clipboard-bridge plugin into your DSH web profile.

It is equivalent to running:

```bash
make package
code --install-extension dsh-launcher-<version>.vsix --force
make install-plugin
```

## Development

Install dependencies:

```bash
pnpm install
```

Compile the extension:

```bash
pnpm run compile
```

Run the linter:

```bash
pnpm run lint
```

Run tests:

```bash
pnpm test
```

### Extension Development Host

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

This is the preferred way to test changes while developing.

### Package the Extension

Create a VSIX package:

```bash
pnpm run package
```

or with the Makefile:

```bash
make package
```

Both produce a file similar to:

```text
dsh-launcher-0.0.1.vsix
```

Install the packaged extension locally with:

```bash
code --install-extension dsh-launcher-0.0.1.vsix
```

or all at once using the Makefile (see [Quick Install](#quick-install-makefile)).

## Requirements

* VS Code
* DSH installed and available as the configured command
* DSH's web interface available on the configured URL
* The DSH clipboard-bridge plugin installed (`make install-plugin` or `make install`)

The default setup assumes:

```bash
dsh web --no-open
```

serves:

```text
http://127.0.0.1:3080
```

## Scope

DSH Launcher is deliberately small.

It does not attempt to:

* replace the DSH web interface
* manage DSH workspaces
* provide an alternative AI interface
* modify DSH configuration
* expose DSH over the network

Its purpose is simply to make a locally running DSH web interface more convenient to use alongside VS Code.

## License

This is a personal VS Code extension intended for local use.
