/* Site stats, on every page: a page view on load, a ping every 30s while the tab is visible (the live
   "on the site now" count, by page), and window.nookTrack("click", where) for buttons.
   Our own Cloudflare function; no cookies, nothing personal: a random id that lives only in this tab. */
(() => {
  if (!/^https:$/.test(location.protocol)) return;
  let tabId;
  try {
    tabId = sessionStorage.getItem("nookTab");
    if (!tabId) sessionStorage.setItem("nookTab", (tabId = crypto.randomUUID()));
  } catch {
    tabId = crypto.randomUUID();
  }
  const path = location.pathname;
  const send = (kind, label) => {
    try {
      navigator.sendBeacon(`/api/event?kind=${kind}&label=${encodeURIComponent(label)}&id=${tabId}&path=${encodeURIComponent(path)}`);
    } catch {
      /* counting is best-effort */
    }
  };
  window.nookTrack = (kind, label = "") => send(kind, label || path);
  send("view", path);
  setInterval(() => { if (document.visibilityState === "visible") send("ping", path); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") send("ping", path); });
  // Closing the tab or leaving the page drops this visitor from the live count right away.
  addEventListener("pagehide", () => send("leave", path));
})();
