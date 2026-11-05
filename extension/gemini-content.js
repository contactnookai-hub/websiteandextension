/**
 * Runs inside gemini.google.com. When Gemini is embedded in our side panel, this script
 * receives commands from the panel (attach screenshot, type text, send) and drives
 * Gemini's own message box. Gemini's page structure can change, so selectors have fallbacks.
 */

(() => {
  const EXTENSION_ORIGIN = `chrome-extension://${chrome.runtime.id}`;
  const parentOrigin = location.ancestorOrigins?.[0] || "";
  const referrer = document.referrer || "";
  const embedded =
    window.top !== window &&
    (parentOrigin === EXTENSION_ORIGIN || referrer.startsWith(EXTENSION_ORIGIN));

  // Only the Gemini frame embedded by this extension. A normal Gemini tab is left alone.
  if (!embedded) return;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Gemini draws each formula twice (visible HTML + hidden MathML). Hide the MathML copy so the
  // reply's innerText has each formula once. Only in Nook's embedded frame; it isn't seen anyway.
  const dedupeMath = document.createElement("style");
  dedupeMath.textContent = ".katex-mathml { display: none !important; }";
  (document.head || document.documentElement).appendChild(dedupeMath);

  function reply(payload) {
    try {
      window.parent.postMessage({ source: "gv2-content", ...payload }, EXTENSION_ORIGIN);
    } catch {
      /* Parent isn't our side panel; nothing to reply to. */
    }
  }

  function findEditor() {
    return (
      document.querySelector('.ql-editor[contenteditable="true"]') ||
      document.querySelector('rich-textarea [contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]')
    );
  }

  function findSendButton() {
    return (
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector("button.send-button") ||
      document.querySelector('button[aria-label*="Send" i]')
    );
  }

  /** Smallest ancestor of the editor that also contains the send/upload controls. */
  function findInputArea(editor) {
    let node = editor;
    while (node && node !== document.body) {
      if (node.querySelector('button[aria-label*="Upload" i], button[aria-label*="Send" i]')) {
        return node;
      }
      node = node.parentElement;
    }
    return document.body;
  }

  function deepQuery(selector, root = document) {
    const found = [];
    const visit = (node) => {
      if (!node?.querySelectorAll) return;
      found.push(...node.querySelectorAll(selector));
      for (const el of node.querySelectorAll("*")) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(root);
    return found;
  }

  function countAttachments() {
    const editor = findEditor();
    const root = editor ? findInputArea(editor) : document.body;
    const inComposer = deepQuery(
      'uploader-file-preview, [class*="file-preview" i], [class*="image-preview" i], [data-test-id*="preview" i], img[src^="blob:"], img[src^="data:"]',
      root
    ).length;
    const removeButtons = deepQuery('[aria-label*="Remove file" i], [aria-label*="Remove image" i]').length;
    return inComposer + removeButtons;
  }

  function fileInputs() {
    return deepQuery('input[type="file"]').filter((input) => !input.disabled);
  }

  function setInputFiles(input, file) {
    const transfer = makeTransfer(file);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
    if (setter) setter.call(input, transfer.files);
    else input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function waitFor(check, timeoutMs, intervalMs = 200) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (check()) return true;
      await sleep(intervalMs);
    }
    return false;
  }

  async function dataUrlToFile(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new File([blob], `screenshot-${stamp}.jpg`, { type: "image/jpeg" });
  }

  function makeTransfer(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  }

  function pasteIntoEditor(file, editor) {
    editor.focus();
    editor.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: makeTransfer(file), bubbles: true, cancelable: true })
    );
  }

  function dropOnUploader(file, editor) {
    const zone = document.querySelector(".xap-uploader-dropzone") || findInputArea(editor);
    const transfer = makeTransfer(file);
    for (const type of ["dragenter", "dragover", "drop"]) {
      zone.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }
  }

  async function revealUploader() {
    const controls = deepQuery("button, [role='button'], [role='menuitem']").filter((el) => {
      const label = `${el.getAttribute("aria-label") || ""} ${el.innerText || ""}`.toLowerCase();
      return /upload|attach/.test(label);
    });
    const opener =
      controls.find((el) => /menu|tool/.test((el.getAttribute("aria-label") || "").toLowerCase())) || controls[0];
    opener?.click();
    await sleep(200);
    for (const el of controls) {
      if (/upload file/.test((el.innerText || "").toLowerCase())) el.click();
    }
  }

  async function attachImage(dataUrl) {
    const editor = await waitForEditor();
    const file = await dataUrlToFile(dataUrl);
    await revealUploader();
    const before = countAttachments();
    const strategies = [
      () => {
        const input = fileInputs()[0];
        if (input) setInputFiles(input, file);
      },
      () => pasteIntoEditor(file, editor),
      () => dropOnUploader(file, editor),
    ];

    for (let tryNumber = 0; tryNumber < 3; tryNumber += 1) {
      for (const strategy of strategies) {
        strategy();
        if (await waitFor(() => countAttachments() > before, 1200)) return;
      }
      await revealUploader();
    }

    throw new Error(
      "Gemini didn't take the screenshot. Wait until Gemini has finished loading, then try again."
    );
  }

  async function waitForEditor() {
    const ready = await waitFor(() => findEditor(), 20000);
    if (!ready) {
      throw new Error("Couldn't find Gemini's message box. Make sure Gemini has finished loading and you're signed in.");
    }
    return findEditor();
  }

  const editorText = (editor) => (editor.innerText || "").replace(/\s+/g, " ").trim();

  async function insertText(text) {
    const editor = await waitForEditor();
    editor.focus();
    const selection = window.getSelection();
    selection.selectAllChildren(editor);
    selection.collapseToEnd();
    try {
      document.execCommand("insertText", false, text);
    } catch {
      /* falls through to the direct write below */
    }
    const probe = text.replace(/\s+/g, " ").trim().slice(0, 24);
    if (editorText(editor).includes(probe)) return;
    // A frame that doesn't have focus (Nook's in-page engine) can ignore execCommand. Gemini's
    // editor (Quill) watches its DOM, so write the paragraphs directly and announce the input.
    const lines = text.split("\n").map((line) => {
      const p = document.createElement("p");
      if (line) p.textContent = line;
      else p.appendChild(document.createElement("br"));
      return p;
    });
    editor.replaceChildren(...lines);
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    await sleep(150);
    if (!editorText(editor).includes(probe)) {
      throw new Error("Couldn't type the question into Gemini.");
    }
  }

  async function clickSendWhenReady() {
    const editor = findEditor();
    const area = editor ? findInputArea(editor) : document.body;

    const ready = await waitFor(() => {
      const button = findSendButton();
      const uploading = area.querySelector('[role="progressbar"], mat-progress-spinner, mat-spinner');
      return (
        button &&
        !button.disabled &&
        button.getAttribute("aria-disabled") !== "true" &&
        !uploading
      );
    }, 30000, 250);

    if (!ready) {
      throw new Error("Gemini's Send button never became available. Try pressing Send in Gemini yourself.");
    }
    await sleep(80);
    findSendButton().click();
  }

  function getResponses() {
    return document.querySelectorAll("model-response");
  }

  function responseText(el) {
    return (el.querySelector(".markdown") || el.querySelector("message-content") || el).innerText.trim();
  }

  /** The ANSWER line is done and at least one sentence of explanation follows it. */
  const answerReady = (text) => /ANSWER\s*[:：]\s*\S[^\n]*\n[\s\S]*?[.!?](\s|$)/i.test(text);

  /**
   * Waits for a new Gemini reply to appear and finish streaming, then returns its text.
   * With `fast` (Nook's bubble), returns as soon as the ANSWER line and one sentence are in.
   */
  async function waitForReply(countBefore, fast = false) {
    const started = await waitFor(() => getResponses().length > countBefore, 30000, fast ? 100 : 250);
    if (!started) {
      throw new Error("Gemini didn't start answering. Check the Gemini panel below.");
    }

    let lastText = "";
    let stableSince = Date.now();
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      await sleep(fast ? 150 : 400);
      const list = getResponses();
      const text = responseText(list[list.length - 1]);
      const generating = !!document.querySelector('button[aria-label*="Stop" i]');
      if (fast && answerReady(text)) return text;
      if (text !== lastText) {
        lastText = text;
        stableSince = Date.now();
      } else if (text && !generating && Date.now() - stableSince > (fast ? 500 : 1200)) {
        return text;
      }
    }
    if (lastText) return lastText;
    throw new Error("Gemini's answer took too long.");
  }

  async function handleCommand({ action, dataUrl, text, send, waitForAnswer, fast }) {
    if (action === "ping") return null;
    if (action !== "compose") {
      throw new Error(`Unknown action: ${action}`);
    }
    if (dataUrl) await attachImage(dataUrl);
    if (text) await insertText(text);
    if (!send) {
      findEditor()?.focus();
      return null;
    }
    const countBefore = getResponses().length;
    await clickSendWhenReady();
    return waitForAnswer ? { replyText: await waitForReply(countBefore, !!fast) } : null;
  }

  window.addEventListener("message", async (event) => {
    if (event.origin !== EXTENSION_ORIGIN) return;
    const message = event.data;
    if (message?.source !== "gv2-panel") return;

    try {
      const data = await handleCommand(message);
      reply({ type: "result", id: message.id, ok: true, data });
    } catch (err) {
      reply({ type: "result", id: message.id, ok: false, error: err?.message ?? String(err) });
    }
  });

  // Keep announcing until the extension actually talks to us. A single ready
  // message is easy to miss if this frame finished loading first.
  const readyTimer = setInterval(() => reply({ type: "ready" }), 400);
  window.addEventListener("message", (event) => {
    if (event.origin === EXTENSION_ORIGIN && event.data?.source === "gv2-panel") {
      clearInterval(readyTimer);
    }
  });
  reply({ type: "ready" });
})();
