/**
 * Host half of the VS Code clipboard bridge plugin.
 *
 * The clipboard integration is entirely browser-side (see `./client.js`),
 * so the host half is a no-op.  It exists so the package has a valid
 * `main` entry that Node resolves without error.
 */
export {};