/**
 * Background service worker — side panel, screenshots, and the What's the answer? hotkey.
 */

const ASK_MENU_ID = "nook-ask-selection";

// When Nook is uninstalled, Chrome opens this page: it asks why, with a one-tap reason and a submit button.
chrome.runtime.setUninstallURL(`https://trynook.org/uninstalled/?v=${chrome.runtime.getManifest().version}`).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: ASK_MENU_ID,
      title: "Ask Nook about “%s”",
      contexts: ["selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.error("Failed to set side panel behavior:", err);
  });
  closeLeftoverHelperTab().catch(() => {});
  armOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  closeLeftoverHelperTab().catch(() => {});
  armOpenTabs();
});

/** Tabs that were open before Nook loaded don't have hotkey.js yet, so Option+Shift+A did nothing there. */
async function armOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }).catch(() => []);
  for (const tab of tabs) {
    if (isRestrictedTabUrl(tab.url ?? "")) continue;
    chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["hotkey.js"] }).catch(() => {});
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
  console.error("Failed to set side panel behavior:", err);
});

const ANSWER_SHORTCUT = "whats-the-answer";
let shortcutTab = null;
let shortcutBusy = false;

function rememberShortcutTab(tab) {
  if (!tab?.id) return;
  shortcutTab = tab;
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(rememberShortcutTab).catch(() => {});
});
chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => rememberShortcutTab(tab));

function beginAnswer(tab) {
  if (shortcutBusy || !tab?.id) return;
  if (tab.url && isRestrictedTabUrl(tab.url)) return;
  shortcutBusy = true;
  // open() has to run in this turn. An await first drops the keypress and Chrome rejects it.
  chrome.sidePanel.open({ tabId: tab.id }).then(
    () => askOpenPanel(tab),
    (err) => {
      shortcutBusy = false;
      console.error("Couldn't open the side panel from the shortcut:", err);
    }
  );
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== ANSWER_SHORTCUT) return;
  beginAnswer(tab?.id ? tab : shortcutTab);
});

async function askOpenPanel(tab) {
  try {
    let ready = false;
    for (let attempt = 0; attempt < 25 && !ready; attempt++) {
      try {
        const response = await chrome.runtime.sendMessage({ type: "sidePanelReady" });
        ready = response?.ok === true;
      } catch {
        ready = false;
      }
      if (!ready) await sleep(200);
    }
    if (!ready) return;
    await chrome.runtime.sendMessage({
      type: "runQuickAnswer",
      tabId: tab.id,
      windowId: tab.windowId,
    });
  } catch {
    // The panel already has the one request. A closed reply channel must not send it again.
  } finally {
    shortcutBusy = false;
  }
}

// ——— Right-click "Ask Nook" on highlighted text ———

let selectionRequest = 0;

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== ASK_MENU_ID || !tab?.id) return;
  const text = (info.selectionText ?? "").trim();
  if (!text) return;
  const id = ++selectionRequest;
  const frameId = info.frameId ?? 0;
  // Gemini lives in the sidebar. open() has to run in this turn, before any await.
  const panelOpening = chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
    console.error("Couldn't open the side panel from the menu:", err);
  });
  runSelectionAnswer({ id, tab, frameId, text, panelOpening });
});

async function sendBubble(tabId, frameId, message) {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: "nookBubble", ...message }, { frameId })) ?? { ok: true };
  } catch {
    return null;
  }
}

async function runSelectionAnswer({ id, tab, frameId, text: selectionText, panelOpening }) {
  let text = selectionText;
  let bubble = false;
  let page = { url: tab.url, title: tab.title };
  try {
    // page-fill.js first: the bubble calls its fillAnswers() to put the answer in the page.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [frameId] },
      files: ["page-fill.js", "selection-bubble.js"],
    });
    const seen = await sendBubble(tab.id, frameId, { state: "loading", id });
    bubble = !!seen;
    // The bubble reads math as TeX instead of the garbled copied text, and says what answer box follows.
    if (seen?.text) text = seen.text;
    if (seen?.page) page = { ...page, ...seen.page };
  } catch (err) {
    // Some pages (PDF viewer, other extensions) can't take the bubble; the answer still shows in the sidebar.
    console.warn("Couldn't show the answer bubble on this page:", err);
  }

  await panelOpening;
  const ready = await waitForPanel();
  if (!ready) {
    if (bubble) await sendBubble(tab.id, frameId, { state: "error", id, error: "The Nook sidebar didn't open. Click the Nook icon, then try again." });
    return;
  }

  let result;
  try {
    result = await chrome.runtime.sendMessage({
      type: "runSelectionAnswer",
      text,
      tabId: tab.id,
      page,
    });
  } catch (err) {
    result = { ok: false, error: err?.message ?? String(err) };
  }
  if (!bubble) return;
  if (result?.ok) {
    await sendBubble(tab.id, frameId, { state: "answer", id, answer: result.answer, answers: result.answers, why: result.why });
  } else {
    await sendBubble(tab.id, frameId, { state: "error", id, error: result?.error ?? "Gemini didn't answer." });
  }
}

async function waitForPanel() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "sidePanelReady" });
      if (response?.ok === true) return true;
    } catch {
      /* panel not listening yet */
    }
    await sleep(200);
  }
  return false;
}

function isRestrictedTabUrl(url) {
  return (
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.includes("chromewebstore.google.com")
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function closeLeftoverHelperTab() {
  const stored = await chrome.storage.session.get("helperGeminiTabId");
  const id = stored.helperGeminiTabId;
  if (!id) return;
  await chrome.storage.session.remove("helperGeminiTabId");
  await chrome.tabs.remove(id).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "answerHotkey") {
    beginAnswer(sender.tab);
    return false;
  }

  if (message?.type === "captureVisibleTab") {
    (async () => {
      try {
        let windowId = message.windowId;
        if (!windowId) {
          const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
          windowId = win?.id;
        }
        if (!windowId) {
          sendResponse({ ok: false, error: "No browser window found." });
          return;
        }

        const [tab] = await chrome.tabs.query({ active: true, windowId });
        if (!tab?.id) {
          sendResponse({ ok: false, error: "Click the webpage tab, then try again." });
          return;
        }
        if (isRestrictedTabUrl(tab.url ?? "")) {
          sendResponse({
            ok: false,
            error: "This page can't be screenshotted (Chrome system pages and the Web Store are blocked).",
          });
          return;
        }

        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: "jpeg",
          quality: 80,
        });
        sendResponse({ ok: true, dataUrl });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message ?? String(err) });
      }
    })();
    return true;
  }

  return undefined;
});

closeLeftoverHelperTab().catch(() => {});
