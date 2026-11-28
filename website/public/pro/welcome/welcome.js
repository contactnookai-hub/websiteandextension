// After Stripe checkout: confirm the payment, show the Pro key, and hand it to the Nook extension if it's installed.
(async () => {
  const API = "https://api.trynook.org";
  const $ = (id) => document.getElementById(id);
  const show = (id) => ["loading", "done", "error"].forEach((s) => ($(s).hidden = s !== id));
  const sessionId = new URLSearchParams(location.search).get("session_id");
  if (!sessionId) {
    $("error-msg").textContent = "This page is opened after checkout.";
    return show("error");
  }

  // Stripe can take a few seconds to finish the subscription, so retry briefly.
  let data = null, reached = false;
  for (let i = 0; i < 6 && !data?.key; i++) {
    try {
      const res = await fetch(`${API}/v1/activate?session_id=${encodeURIComponent(sessionId)}`);
      reached = true;
      data = await res.json();
      if (!res.ok && res.status !== 402) break;
    } catch {
      /* network: retry */
    }
    if (!data?.key) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!data?.key) {
    $("error-msg").textContent = data?.error || (reached ? "The payment hasn't come through yet." : "We couldn't reach Nook's server. Check your connection and reload this page.");
    return show("error");
  }

  // Holiday sale: $1 first month until midnight Jan 1 (Pacific), same moment as the homepage and the extension.
  // After it, the $1 line would be wrong; "renews at $9.99" is true for everyone.
  if (Date.now() >= Date.parse("2027-01-01T00:00:00-08:00")) $("price").textContent = "Nook Pro renews at $9.99/month.";

  $("key").textContent = data.key;
  show("done");
  $("copy").addEventListener("click", async () => {
    const ok = await navigator.clipboard.writeText(data.key).then(() => true, () => false);
    if (!ok) getSelection().selectAllChildren($("key")); // no clipboard access: select it so ⌘C / Ctrl+C works
    $("copy").textContent = ok ? "Copied" : "Selected";
    setTimeout(() => ($("copy").textContent = "Copy"), 1500);
  });

  // The extension listens on this page and saves the key itself (claude-bubble.js).
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.source !== "nook-ext") return;
    if (e.data.type === "proKeySaved") {
      $("auto").classList.add("on");
      $("manual").hidden = true;
    }
  });
  window.postMessage({ source: "nook-site", type: "proKey", key: data.key }, location.origin);
})();
