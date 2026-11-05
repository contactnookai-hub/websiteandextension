/**
 * Option+Shift+A / Alt+Shift+A on the page. Chrome often leaves the manifest
 * shortcut unset when another copy of the extension already claimed it.
 * Also strips a leftover page bubble from an older build.
 */
document.addEventListener(
  "keydown",
  (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey) return;
    if (!event.altKey || !event.shiftKey || event.code !== "KeyA") return;
    event.preventDefault();
    chrome.runtime.sendMessage({ type: "answerHotkey" });
  },
  true
);

if (window === window.top) {
  const BUBBLE_HOSTS = ["gv3-page-bubble-root", "nook-page-bubble-root"];
  const stripBubble = () => {
    for (const id of BUBBLE_HOSTS) document.getElementById(id)?.remove();
  };
  const watch = new MutationObserver(stripBubble);
  const start = () => {
    const parent = document.body || document.documentElement;
    if (!parent) return;
    stripBubble();
    watch.observe(parent, { childList: true });
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
