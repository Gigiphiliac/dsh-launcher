# DSH Launcher

A lightweight VS Code extension for launching and opening a local [DeepSeek Harness (DSH)](https://github.com/DeepSeek-AI/DeepSeek-Harness) instance directly inside VS Code.

DSH remains responsible for its own workspace and project management. **DSH Launcher simply handles starting the local web server when necessary and displaying its web interface inside VS Code.**

## Features

* Launch DSH directly from the VS Code Command Palette
* Detect whether DSH is already running before starting it
* Automatically wait for DSH to become available
* Display the DSH web interface inside a VS Code panel
* Configure the DSH command, arguments, and server URL
* Reuse an existing DSH instance instead of starting another one

## Usage

Open the Command Palette:

```text
Cmd+Shift+P
```

Then run:

```text
DSH Launcher: Launch
```

The extension will:

1. Check whether DSH is already available at the configured URL.
2. Start DSH with the configured command if it isn't running.
3. Wait for the server to become available.
4. Open the DSH interface in a VS Code panel.

If DSH is already running, no new process is started.

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

## Architecture

DSH Launcher intentionally does not attempt to manage DSH workspaces or reproduce any DSH functionality.

The extension acts as a small bridge between VS Code and the existing DSH web application:

```text
┌──────────────────────────┐
│        VS Code           │
│                          │
│     DSH Launcher         │
│           │              │
│           │ spawn        │
│           ▼              │
│       dsh web            │
│           │              │
│           │ HTTP         │
│           ▼              │
│    ┌───────────────┐     │
│    │ DSH Web UI    │     │
│    │   :3080        │     │
│    └───────────────┘     │
│           │              │
│           ▼              │
│       Webview            │
└──────────────────────────┘
```

If DSH is already running, the extension simply connects to the existing instance.

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

This produces a file similar to:

```text
dsh-launcher-0.0.1.vsix
```

Install the packaged extension locally with:

```bash
code --install-extension dsh-launcher-0.0.1.vsix
```

## Requirements

* VS Code
* DSH installed and available as the configured command
* DSH's web interface available on the configured URL

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
