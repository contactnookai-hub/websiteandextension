/**
 * Side panel v6: embeds gemini.google.com (the user's own signed-in account) and adds
 * one-click screenshot buttons, site-aware answer prompts, auto-fill of the answer into the
 * page (Khan Academy first), and optional auto-copy. Commands go to gemini-content.js inside
 * the frame via postMessage; page reading/filling runs via chrome.scripting.executeScript.
 */

import { buildAnswerPrompt, buildSelectionPrompt, parseAnswers, parseExplanation } from "./site-profiles.js";

const GEMINI_ORIGIN = "https://gemini.google.com";
const GEMINI_URL = `${GEMINI_ORIGIN}/app`;
const SIGN_IN_URL = `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(GEMINI_URL)}`;
const AUTO_COPY_KEY = "autofillAnswer"; // historical name, holds the auto-copy setting
const AUTO_FILL_KEY = "autoFillPage";

const frame = document.getElementById("gemini-frame");
const statusBar = document.getElementById("status-bar");
const answerBtn = document.getElementById("answer-btn");
const screenshotBtn = document.getElementById("screenshot-btn");
const helpBtn = document.getElementById("help-btn");
const reloadBtn = document.getElementById("reload-btn");
const signinBtn = document.getElementById("signin-btn");
const autoCopyToggle = document.getElementById("autocopy-toggle");
const autoFillToggle = document.getElementById("autofill-toggle");
const answerBar = document.getElementById("answer-bar");
const answerText = document.getElementById("answer-text");
const copyAnswerBtn = document.getElementById("copy-answer-btn");
const fillAnswerBtn = document.getElementById("fill-answer-btn");
const copyLabel = copyAnswerBtn.querySelector(".answer-copy-label");

let nextRequestId = 1;
/** @type {Map<number, { resolve: (data: any) => void, reject: (err: Error) => void, timer: number }>} */
const pendingRequests = new Map();
let geminiReady = false;
let statusTimer = 0;
let copiedTimer = 0;
let autoCopyEnabled = false;
let autoFillEnabled = true;
let lastAnswer = "";
/** @type {string[]} */
let lastAnswers = [];
/** @type {number|null} tab the last answer was produced for */
let lastTabId = null;

// ——— Status ———

/**
 * @param {string} text
 * @param {"info"|"working"|"error"|"success"} [variant]
 * @param {number} [clearAfterMs]
 */
function setStatus(text, variant = "info", clearAfterMs = 0) {
  clearTimeout(statusTimer);
  statusBar.textContent = text;
  statusBar.className = `status${variant === "info" ? "" : ` ${variant}`}`;
  if (clearAfterMs) {
    statusTimer = setTimeout(() => setStatus(""), clearAfterMs);
  }
}

/**
 * @param {boolean} busy
 * @param {HTMLButtonElement} [source] the button whose action is running
 */
function setBusy(busy, source) {
  answerBtn.disabled = busy;
  screenshotBtn.disabled = busy;
  fillAnswerBtn.disabled = busy;
  answerBtn.classList.toggle("is-busy", busy && source === answerBtn);
}

// ——— Settings ———

function setAutoCopy(on) {
  autoCopyEnabled = on;
  autoCopyToggle.checked = on;
  chrome.storage.local.set({ [AUTO_COPY_KEY]: on });
}

function setAutoFill(on) {
  autoFillEnabled = on;
  autoFillToggle.checked = on;
  chrome.storage.local.set({ [AUTO_FILL_KEY]: on });
}

autoCopyToggle.addEventListener("change", () => setAutoCopy(autoCopyToggle.checked));
autoFillToggle.addEventListener("change", () => setAutoFill(autoFillToggle.checked));

// ——— Messaging with the Gemini frame ———

window.addEventListener("message", (event) => {
  if (event.origin !== GEMINI_ORIGIN || event.source !== frame.contentWindow) return;
  geminiReady = true;
  const message = event.data;
  if (message?.source !== "gv2-content" || message.type !== "result") return;

  const pending = pendingRequests.get(message.id);
  if (!pending) return;
  pendingRequests.delete(message.id);
  clearTimeout(pending.timer);
  if (message.ok) pending.resolve(message.data);
  else pending.reject(new Error(message.error ?? "Gemini command failed."));
});

/**
 * @param {object} command
 * @param {number} timeoutMs
 * @param {string} timeoutMessage
 * @returns {Promise<any>}
 */
function sendToGemini(command, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    if (!geminiReady || !frame.contentWindow) {
      reject(new Error(timeoutMessage));
      return;
    }
    const id = nextRequestId++;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    pendingRequests.set(id, { resolve, reject, timer });
    try {
      frame.contentWindow.postMessage({ source: "gv2-panel", id, ...command }, GEMINI_ORIGIN);
    } catch (err) {
      clearTimeout(timer);
      pendingRequests.delete(id);
      geminiReady = false;
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureGeminiReady() {
  const message = "Gemini isn't ready yet. Wait for it to load (press reload if it's stuck), then try again.";
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (geminiReady) {
      try {
        await sendToGemini({ action: "ping" }, 2000, message);
        return;
      } catch (err) {
        const text = err?.message ?? "";
        if (text !== message && !/not ready/i.test(text)) throw err;
        geminiReady = false;
      }
    }
    await sleep(300);
  }
  throw new Error(message);
}

// ——— The user's current tab ———

async function getCurrentTab() {
  const win = await chrome.windows.getCurrent();
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab ?? null;
}

async function captureScreenshot(windowId) {
  let id = windowId;
  if (!id) {
    const win = await chrome.windows.getCurrent();
    id = win?.id;
  }
  const response = await chrome.runtime.sendMessage({ type: "captureVisibleTab", windowId: id });
  if (!response?.ok) {
    throw new Error(response?.error ?? "Screenshot failed.");
  }
  return response.dataUrl;
}

/** The on-screen question text, math written out; "" if the page can't be read. */
async function readPageText(tab) {
  if (!tab?.id) return "";
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: globalThis.readPageText });
    return injection?.result ?? "";
  } catch {
    return "";
  }
}

/** Describes the page's answer boxes and choices; null if the page can't be read. */
async function collectPageContext(tab) {
  if (!tab?.id) return null;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: globalThis.describePage,
    });
    return injection?.result ?? { url: tab.url, title: tab.title };
  } catch {
    return { url: tab.url, title: tab.title };
  }
}

// ——— Answer handling ———

/**
 * @param {string} text
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand("copy");
    scratch.remove();
    return ok;
  }
}

function setCopied(copied) {
  clearTimeout(copiedTimer);
  answerBar.classList.toggle("is-copied", copied);
  copyLabel.textContent = copied ? "Copied" : "Copy";
  if (copied) copiedTimer = setTimeout(() => setCopied(false), 4000);
}

function showAnswer(answers, tabId = null) {
  lastAnswers = answers;
  lastAnswer = answers.join(" | ");
  lastTabId = tabId;
  answerText.textContent = lastAnswer;
  setCopied(false);
  answerBar.hidden = !lastAnswer;
}

/**
 * Puts the answers into the page's answer boxes / choices.
 * @param {number|null} tabId
 * @param {string[]} answers
 * @returns {Promise<{ filled: string[], unmatched: string[], notes: string[] }>}
 */
async function fillOnPage(tabId, answers) {
  if (!tabId) throw new Error("Couldn't find the page tab to fill.");
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: globalThis.fillAnswers,
    args: [answers],
  });
  if (!injection?.result) throw new Error("The page didn't respond to the fill request.");
  return injection.result;
}

/**
 * Fills the current answers into the page and reports in the status line. Falls back to
 * copying when nothing could be placed, so the user can still paste.
 * @param {number|null} tabId
 * @param {string[]} answers
 * @param {{ updateStatus?: boolean }} [options]
 * @returns {Promise<{ filled: string[], unmatched: string[], copied: boolean }>}
 */
async function fillAndReport(tabId, answers, { updateStatus = true } = {}) {
  const report = { filled: [], unmatched: answers, copied: false };
  if (updateStatus) setStatus("Filling in the answer…", "working");
  let outcome;
  try {
    outcome = await fillOnPage(tabId, answers);
  } catch (err) {
    console.warn("Fill failed:", err);
    const copied = await copyToClipboard(answers.join(" | "));
    setCopied(copied);
    report.copied = copied;
    if (updateStatus) {
      setStatus(
        copied
          ? "Couldn't fill this page, so the answer was copied. Press Ctrl+V in the answer box."
          : `Couldn't fill this page: ${err?.message ?? err}`,
        "error"
      );
    }
    return report;
  }

  console.debug("Fill result:", outcome);
  report.filled = outcome.filled;
  report.unmatched = outcome.unmatched;
  const total = outcome.filled.length + outcome.unmatched.length;
  if (outcome.unmatched.length === 0 && outcome.filled.length > 0) {
    if (updateStatus) {
      setStatus(
        outcome.filled.length === 1 ? "Filled in. Check it, then press Check." : `Filled in ${total} answers. Check them, then press Check.`,
        "success",
        8000
      );
    }
    return report;
  }

  const copied = await copyToClipboard(outcome.unmatched.join(" | "));
  setCopied(copied);
  report.copied = copied;
  if (updateStatus) {
    if (outcome.filled.length > 0) {
      setStatus(
        `Filled ${outcome.filled.length} of ${total}. The rest ${copied ? "was copied — press Ctrl+V" : "couldn't be copied"}.`,
        "info"
      );
    } else {
      setStatus(
        copied
          ? "Couldn't find where to put the answer, so it was copied. Press Ctrl+V in the answer box."
          : "Couldn't find where to put the answer. Click it to copy.",
        "error"
      );
    }
  }
  return report;
}

async function copyAnswer() {
  if (!lastAnswer) return;
  const copied = await copyToClipboard(lastAnswer);
  setCopied(copied);
  if (copied) {
    setStatus("Copied. Press Ctrl+V in the answer box.", "success", 5000);
  } else {
    setStatus("Couldn't copy the answer. Click it to try again.", "error", 5000);
  }
}

// ——— Answer pipeline ———

/**
 * @param {{ targetTabId?: number|null, updatePanel?: boolean, updateStatus?: boolean }} [options]
 */
async function runWhatsTheAnswer(options = {}) {
  const { targetTabId = null, windowId = null, updatePanel = true, updateStatus = true } = options;
  if (updatePanel) setBusy(true, answerBtn);
  try {
    await ensureGeminiReady();

    if (updateStatus) setStatus("Reading the page…", "working");
    const tab = targetTabId ? await chrome.tabs.get(targetTabId) : await getCurrentTab();
    const page = await collectPageContext(tab);
    const pageText = await readPageText(tab);
    const prompt = buildAnswerPrompt(page, pageText);

    if (updateStatus) setStatus("Capturing the screen…", "working");
    const dataUrl = await captureScreenshot(windowId);

    if (updateStatus) setStatus("Asking Gemini…", "working");
    const result = await sendToGemini(
      { action: "compose", dataUrl, text: prompt, send: true, waitForAnswer: true, fast: true },
      180000,
      "Gemini took too long to answer. Check the Gemini panel below."
    );

    const answers = parseAnswers(result?.replyText ?? "");
    if (!answers.length) {
      if (updatePanel) showAnswer([]);
      if (updateStatus) setStatus("Gemini answered below, but without a clear final answer line.", "info", 8000);
      return { ok: false, error: "No clear ANSWER line in Gemini's reply." };
    }

    if (updatePanel) showAnswer(answers, tab?.id ?? null);

    let fillReport = { filled: [], unmatched: answers, copied: false };
    let copiedForUser = false;
    if (autoFillEnabled) {
      if (autoCopyEnabled) copiedForUser = await copyToClipboard(lastAnswer);
      fillReport = await fillAndReport(tab?.id ?? null, answers, { updateStatus });
    } else if (autoCopyEnabled) {
      copiedForUser = await copyToClipboard(lastAnswer);
      if (updatePanel) setCopied(copiedForUser);
      if (updateStatus) {
        setStatus(
          copiedForUser ? "Copied. Press Ctrl+V in the answer box." : "Couldn't copy the answer.",
          copiedForUser ? "success" : "error",
          copiedForUser ? 5000 : 0
        );
      }
    } else if (updateStatus) {
      setStatus("");
    }

    return {
      ok: true,
      answers,
      answerText: lastAnswer,
      filled: fillReport.filled,
      unmatched: fillReport.unmatched,
      copied: copiedForUser || fillReport.copied,
    };
  } catch (err) {
    const message = err?.message ?? String(err);
    if (updateStatus) setStatus(message, "error");
    return { ok: false, error: message };
  } finally {
    if (updatePanel) setBusy(false);
  }
}

/**
 * Right-click "Ask Nook": answers highlighted text. No screenshot and no fill; the answer goes
 * back to the bubble on the page (and the answer card here).
 * @param {{ text: string, tabId?: number, page?: object }} request
 */
async function runSelectionAnswer({ text, tabId = null, page = null }) {
  setBusy(true, answerBtn);
  try {
    await ensureGeminiReady();
    setStatus("Asking Gemini about your highlight…", "working");
    const result = await sendToGemini(
      { action: "compose", text: buildSelectionPrompt(text, page), send: true, waitForAnswer: true, fast: true },
      180000,
      "Gemini took too long to answer. Check the Gemini panel below."
    );
    const reply = result?.replyText ?? "";
    const answers = parseAnswers(reply);
    // Only an ANSWER line is an answer. Anything else (e.g. "I encountered an error") must never be filled in.
    if (!answers.length) {
      setStatus("Gemini answered below, but without a clear answer.", "info", 8000);
      return { ok: false, error: "Gemini didn't give a clear answer. See the sidebar." };
    }
    showAnswer(answers, tabId);
    setStatus("Answered in the bubble on the page.", "success", 5000);
    return { ok: true, answer: answers.join(" | "), answers, why: parseExplanation(reply) };
  } catch (err) {
    const message = err?.message ?? String(err);
    setStatus(message, "error");
    return { ok: false, error: message };
  } finally {
    setBusy(false);
  }
}

async function handleWhatsTheAnswer() {
  await runWhatsTheAnswer({ updatePanel: true, updateStatus: true });
}

async function handleAddScreenshot() {
  setBusy(true, screenshotBtn);
  try {
    await ensureGeminiReady();

    setStatus("Capturing the screen…", "working");
    const dataUrl = await captureScreenshot();

    setStatus("Attaching screenshot…", "working");
    await sendToGemini(
      { action: "compose", dataUrl, send: false },
      45000,
      "Gemini took too long to take the screenshot. Check the Gemini panel below."
    );
    setStatus("Screenshot attached. Type your question in Gemini below.", "success", 4000);
  } catch (err) {
    setStatus(err?.message ?? String(err), "error");
  } finally {
    setBusy(false);
  }
}

answerBtn.addEventListener("click", handleWhatsTheAnswer);

function renderHotkey(shortcut) {
  const mac = /Mac/.test(navigator.platform);
  const parts = (shortcut || "Alt+Shift+A").split("+").filter(Boolean).map((part) => (mac && part === "Alt" ? "Option" : part));
  const keys = document.getElementById("hotkey-keys");
  keys.replaceChildren(
    ...parts.map((part) => {
      const key = document.createElement("kbd");
      key.textContent = part;
      return key;
    })
  );
  document.getElementById("hotkey-platform").hidden = !mac;
  answerBtn.title = `What's the answer? Hotkey ${parts.join("+")}`;
}

chrome.commands.getAll().then((commands) => {
  const shortcut = commands.find((command) => command.name === "whats-the-answer")?.shortcut;
  renderHotkey(shortcut);
});
screenshotBtn.addEventListener("click", handleAddScreenshot);

copyAnswerBtn.addEventListener("click", copyAnswer);
answerText.addEventListener("click", copyAnswer);

fillAnswerBtn.addEventListener("click", async () => {
  if (!lastAnswers.length) return;
  setBusy(true, fillAnswerBtn);
  try {
    // Fill whichever tab is active now; the user may have switched back to the exercise.
    const tab = await getCurrentTab();
    await fillAndReport(tab?.id ?? lastTabId, lastAnswers);
  } finally {
    setBusy(false);
  }
});

reloadBtn.addEventListener("click", () => {
  geminiReady = false;
  setStatus("");
  frame.src = GEMINI_URL;
});

signinBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: SIGN_IN_URL });
  setStatus("Sign in in the new tab, then come back and press reload.", "info", 10000);
});

// ——— Init ———

const onboarding = globalThis.createOnboarding({
  getAutoCopy: () => autoCopyEnabled,
  setAutoCopy,
  getAutoFill: () => autoFillEnabled,
  setAutoFill,
});

helpBtn.addEventListener("click", () => onboarding.open());

let answerInFlight = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "closeSidePanelNow") {
    sendResponse({ ok: true });
    setTimeout(() => window.close(), 0);
    return true;
  }
  if (message?.type === "sidePanelReady") {
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "runSelectionAnswer") {
    if (answerInFlight) {
      sendResponse({ ok: false, error: "Nook is already working on an answer. Try again in a moment." });
      return false;
    }
    answerInFlight = true;
    runSelectionAnswer(message)
      .then(sendResponse)
      .finally(() => {
        answerInFlight = false;
      });
    return true;
  }
  if (message?.type === "runQuickAnswer") {
    if (answerInFlight) {
      sendResponse({ ok: false, error: "Already working on an answer." });
      return false;
    }
    answerInFlight = true;
    runWhatsTheAnswer({
      targetTabId: message.tabId ?? null,
      windowId: message.windowId ?? null,
      updatePanel: true,
      updateStatus: true,
    })
      .then(sendResponse)
      .finally(() => {
        answerInFlight = false;
      });
    return true;
  }
  return undefined;
});

const SPLASH_KEY = "nookSplashV55";
const splashEl = document.getElementById("splash");

function startGeminiFrame() {
  if (frame.getAttribute("src") || !frame.dataset.src) return;
  frame.src = frame.dataset.src;
}

function playFirstOpen() {
  const first = !document.documentElement.classList.contains("splash-seen") && splashEl;
  if (!first) {
    requestAnimationFrame(startGeminiFrame);
    return Promise.resolve();
  }

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const minMs = reduce ? 700 : 1900;
  const maxMs = 5200;
  const started = performance.now();

  // Paint the logo first. Gemini starts on the next frame, behind the splash.
  requestAnimationFrame(() => startGeminiFrame());

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      splashEl.classList.add("is-out");
      let closed = false;
      const done = () => {
        if (closed) return;
        closed = true;
        try {
          localStorage.setItem(SPLASH_KEY, "1");
        } catch {
          /* The splash still ends. */
        }
        document.documentElement.classList.add("splash-seen");
        splashEl.setAttribute("aria-hidden", "true");
        resolve();
      };
      splashEl.addEventListener(
        "transitionend",
        (event) => {
          if (event.target === splashEl && event.propertyName === "opacity") done();
        },
        { once: true }
      );
      setTimeout(done, reduce ? 40 : 1200);
    };

    const tick = () => {
      const elapsed = performance.now() - started;
      if ((geminiReady && elapsed >= minMs) || elapsed >= maxMs) finish();
      else setTimeout(tick, 100);
    };
    setTimeout(tick, minMs);
  });
}

const firstOpen = playFirstOpen();

chrome.storage.local.get([AUTO_COPY_KEY, AUTO_FILL_KEY]).then(async (stored) => {
  autoCopyEnabled = Boolean(stored[AUTO_COPY_KEY]);
  autoCopyToggle.checked = autoCopyEnabled;
  autoFillEnabled = stored[AUTO_FILL_KEY] ?? true;
  autoFillToggle.checked = autoFillEnabled;
  await firstOpen;
  onboarding.openIfFirstRun();
});
