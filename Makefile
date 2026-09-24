package:
	npm run compile
	npm run package

install: package
	code --install-extension $$(ls dsh-launcher-*.vsix | tail -1) --force
	$(MAKE) install-plugin

# Install the DSH clipboard-bridge client plugin into the DSH web profile.
# The plugin intercepts copy operations inside the DSH iframe and forwards
# them to the VS Code extension host, which writes to the system clipboard
# via `vscode.env.clipboard.writeText()`.
install-plugin:
	dsh plugin --profile web add "file:$(PWD)/resources/dsh-vscode-clipboard"