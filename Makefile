package:
	npm run compile
	npm run package

install: package
	code --install-extension $$(ls dsh-launcher-*.vsix | tail -1) --force
