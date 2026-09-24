/**
 * Browser half of the VS Code clipboard bridge plugin.
 *
 * DSH runs inside a cross-origin iframe hosted by the VS Code webview.
 * VS Code's webview sandbox blocks `navigator.clipboard`, so copy
 * operations fail. This module intercepts clipboard operations inside
 * DSH and forwards them to the outer VS Code webview via
 * `window.parent.postMessage`, which then writes to the real system
 * clipboard using `vscode.env.clipboard.writeText`.
 *
 * This module is loaded automatically by DSH's client-module system
 * (declared via the `dsh.client` key in package.json) and is a no-op
 * in a normal browser outside VS Code — the iframe has no parent to
 * post to, so `navigator.clipboard` is left untouched as a fallback.
 */
(function () {
  "use strict";

  var BRIDGE_MESSAGE = "dsh:clipboard-write";

  /** True when running as a nested iframe with a parent we can message. */
  function hasParent() {
    try {
      return (
        typeof window.parent !== "undefined" &&
        window.parent !== window &&
        // Same-origin check: inside the VS Code webview the parent is a
        // different origin, so this throws and we know we're embedded.
        (function () {
          try {
            void window.parent.location;
            return false; // same-origin parent — not the VS Code bridge
          } catch (_) {
            return true; // cross-origin parent — this is the VS Code webview
          }
        })()
      );
    } catch (_) {
      return false;
    }
  }

  /** Forward a clipboard write to the outer VS Code webview. */
  function bridgeWrite(text) {
    if (!text) return;
    try {
      window.parent.postMessage({ type: BRIDGE_MESSAGE, text: text }, "*");
    } catch (_) {
      // Fall back to the normal browser API if postMessage fails.
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        void navigator.clipboard.writeText(text);
      }
    }
  }

  // Only install the bridge when embedded in the VS Code webview.
  if (!hasParent()) {
    return;
  }

  // --- 1. Keyboard copy (Cmd+C / Ctrl+C on selected text) ----------------
  // The `copy` event belongs to the nested DSH document, so only DSH can
  // observe it. Prevent the default (which the sandbox blocks) and forward
  // the selection to the host instead.
  document.addEventListener("copy", function (event) {
    var text = window.getSelection() ? window.getSelection().toString() : "";
    if (!text) return; // nothing selected — let normal behaviour proceed
    event.preventDefault();
    event.stopPropagation();
    bridgeWrite(text);
  });

  // --- 2. Programmatic copy (navigator.clipboard.writeText) --------------
  // Wrap the Clipboard API so existing DSH copy buttons that call
  // `navigator.clipboard.writeText(text)` are redirected through the
  // bridge when hosted by VS Code.
  if (navigator && navigator.clipboard) {
    var originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
      bridgeWrite(text);
      // Resolve so callers that await the promise don't hang.
      return Promise.resolve();
    };
    // Keep a reference for the fallback path above.
    navigator.clipboard.writeText.__orig = originalWriteText;
  }
})();
