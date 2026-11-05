/**
 * Answer bubble for highlighted text. Injected into the page (the frame that had the selection),
 * after page-fill.js, by background.js when the user picks "Ask Nook" from the right-click menu.
 *
 * - Reads the highlight with math intact (KaTeX / MathJax / MathML source instead of the garbled
 *   copied text) and describes what answer the page wants right after it (choices, math box,
 *   dropdown, text box), so Gemini formats the answer for this exact spot.
 * - Shows a loading state right away, then the answer, and fills it into the box or choice right
 *   after the highlight with fillAnswers() (Auto fill setting), or on the Fill button.
 * Lives in a shadow root so the page's CSS can't touch it. Safe to inject more than once.
 */
(() => {
  if (window.__nookBubble) return;

  const HOST_ID = "nook-answer-bubble";
  const GAP = 10;
  const MARGIN = 12;

  const STYLES = `
:host { all: initial; }
.bubble {
  position: absolute; left: 0; top: 0; width: 340px; max-width: calc(100vw - 24px);
  box-sizing: border-box; padding: 12px 14px 14px; border-radius: 12px;
  background: #15171c; color: #eceef2; border: 1px solid #272b34;
  box-shadow: 0 12px 32px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.25);
  font: 13px/1.45 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased; text-align: left; letter-spacing: normal;
  opacity: 0; transform: translateY(4px) scale(0.97); transform-origin: var(--origin, top left);
  transition: opacity 180ms cubic-bezier(0.2,0.8,0.2,1), transform 220ms cubic-bezier(0.2,0.8,0.2,1);
}
.bubble.in { opacity: 1; transform: none; }
.bubble.out { opacity: 0; transform: translateY(2px) scale(0.98); transition-duration: 140ms; }
.head { display: flex; align-items: center; gap: 8px; height: 20px; margin-bottom: 10px; }
.mark { width: 7px; height: 7px; border-radius: 2px; background: #8ab4f8; flex: none; }
.name { font-weight: 600; font-size: 12.5px; }
.state { color: #8a91a0; font-size: 12px; }
.x {
  margin-left: auto; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 6px;
  border: 0; background: transparent; color: #8a91a0; cursor: pointer; padding: 0;
}
.x:hover { background: #1d2027; color: #eceef2; }
svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

/* loading */
.loading { display: flex; flex-direction: column; gap: 10px; }
.loading .row { display: flex; align-items: center; gap: 10px; color: #8a91a0; }
.spark { width: 16px; height: 16px; color: #8ab4f8; animation: spin 1.6s cubic-bezier(0.45,0,0.55,1) infinite; }
.spark svg { width: 16px; height: 16px; fill: currentColor; stroke: none; }
.dots { display: inline-flex; gap: 3px; margin-left: 2px; }
.dots i { width: 4px; height: 4px; border-radius: 50%; background: #8a91a0; animation: dot 1.1s ease-in-out infinite; }
.dots i:nth-child(2) { animation-delay: 0.15s; }
.dots i:nth-child(3) { animation-delay: 0.3s; }
.bar { height: 9px; border-radius: 5px; background: #1d2027; position: relative; overflow: hidden; }
.bar::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(236,238,242,0.07), transparent);
  animation: sweep 1.3s ease-in-out infinite;
}
@keyframes spin { 0% { transform: rotate(0) scale(1); } 50% { transform: rotate(180deg) scale(0.82); } 100% { transform: rotate(360deg) scale(1); } }
@keyframes dot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.45; } 30% { transform: translateY(-3px); opacity: 1; } }
@keyframes sweep { to { transform: translateX(100%); } }

/* answer */
.label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6270; margin-bottom: 5px; }
.value {
  font: 500 15px/1.4 ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace; color: #eceef2;
  background: #0e0f12; border: 1px solid #272b34; border-radius: 8px; padding: 8px 10px;
  word-break: break-word; white-space: pre-wrap; animation: rise 260ms cubic-bezier(0.2,0.8,0.2,1);
}
.why { color: #8a91a0; margin-top: 9px; animation: rise 320ms cubic-bezier(0.2,0.8,0.2,1); }
.actions { display: flex; gap: 8px; margin-top: 12px; }
.btn {
  height: 30px; padding: 0 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 7px;
  font: 600 12.5px/1 Inter, system-ui, sans-serif; cursor: pointer; border: 1px solid #272b34;
  background: #1d2027; color: #eceef2;
}
.btn.primary { background: #eceef2; color: #0e0f12; border-color: #eceef2; }
.btn.primary.done { background: #1d2027; color: #6dd3a0; border-color: #272b34; }
.btn:hover { filter: brightness(1.06); }
.btn.done { color: #6dd3a0; }
.note { margin-top: 10px; font-size: 12px; color: #8a91a0; display: flex; gap: 7px; align-items: baseline; }
.note::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #8ab4f8; flex: none; transform: translateY(-1px); }
.note.ok { color: #c9eedb; }
.note.ok::before { background: #6dd3a0; }
.note.warn::before { background: #f28b82; }
.err { color: #f28b82; }
.hint { color: #8a91a0; margin-top: 6px; }
@keyframes rise { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .bubble, .value, .why { transition: none; animation: none; }
  .spark, .dots i, .bar::after { animation: none; }
}
`;

  const ICON_SPARK = `<svg viewBox="0 0 24 24"><path d="M12 3c.7 4.6 3.4 7.3 8 8-4.6.7-7.3 3.4-8 8-.7-4.6-3.4-7.3-8-8 4.6-.7 7.3-3.4 8-8z"/></svg>`;
  const ICON_X = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
  const ICON_COPY = `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>`;
  const ICON_FILL = `<svg viewBox="0 0 24 24"><path d="M4 17h16"/><path d="M9 13V8.5a3 3 0 0 1 6 0V13"/><path d="M12 3v3"/><path d="M7 20h10"/></svg>`;
  const ICON_CHECK = `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

  let host = null;
  let root = null;
  let bubble = null;
  let range = null;
  let current = 0; // request id the bubble is showing

  // ——— Reading the highlight ———

  const MATH = ".katex, mjx-container, .MathJax, .MathJax_Display, math";

  /** MathML (MathJax's hidden copy, or plain <math>) as typed math: x^(2), (a)/(b), sqrt(x), ∫_(1)^(x). */
  function mathmlToText(node) {
    const kids = () => [...node.children].map(mathmlToText);
    const wrap = (raw) => { const s = raw.trim(); return /^[\w.]+$/.test(s) || /^\(.*\)$/.test(s) ? s : `(${s})`; };
    const tag = node.localName;
    const k = node.children;
    switch (tag) {
      case "mi": case "mn": case "mo": case "mtext": case "ms": return node.textContent.trim();
      case "mspace": return " ";
      case "msup": {
        const sup = mathmlToText(k[1]).trim();
        return /^[′″‴']+$/.test(sup) ? `${mathmlToText(k[0]).trim()}${sup}` : `${mathmlToText(k[0])}^${wrap(sup)}`;
      }
      case "msub": return `${mathmlToText(k[0])}_${wrap(mathmlToText(k[1]))}`;
      case "msubsup": case "munderover": return `${mathmlToText(k[0]).trim()}_(${mathmlToText(k[1]).trim()})^(${mathmlToText(k[2]).trim()}) `;
      case "munder": return `${mathmlToText(k[0])}_${wrap(mathmlToText(k[1]))}`;
      case "mover": return `${mathmlToText(k[0])}^${wrap(mathmlToText(k[1]))}`;
      case "mfrac": return `(${mathmlToText(k[0])})/(${mathmlToText(k[1])})`;
      case "msqrt": return `sqrt(${kids().join("")})`;
      case "mroot": return `root(${mathmlToText(k[0])}, ${mathmlToText(k[1])})`;
      case "mtr": return kids().join(" , ");
      case "mtable": return kids().join(" ; ");
      case "annotation": case "annotation-xml": return "";
      default: return kids().join("");
    }
  }

  function texOf(el) {
    const tex =
      el.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent ||
      el.getAttribute?.("alttext") ||
      el.querySelector?.("math")?.getAttribute("alttext") ||
      (el.nextElementSibling?.matches?.('script[type^="math/tex"]') ? el.nextElementSibling.textContent : "");
    if (tex) return tex.trim();
    // MathJax 3 keeps no TeX, only a hidden MathML copy: read that as typed math.
    const math = el.localName === "math" ? el : el.querySelector?.("math");
    if (math) return mathmlToText(math).replace(/\s+/g, " ").trim();
    return (el.getAttribute?.("aria-label") || "").trim();
  }

  /** The highlighted text, with each formula as its TeX source in $…$ (one copy, not three). */
  function readSelection(r) {
    const full = r.cloneRange();
    const startMath = (full.startContainer.nodeType === 1 ? full.startContainer : full.startContainer.parentElement)?.closest(MATH);
    const endMath = (full.endContainer.nodeType === 1 ? full.endContainer : full.endContainer.parentElement)?.closest(MATH);
    if (startMath) full.setStartBefore(outerMath(startMath));
    if (endMath) full.setEndAfter(outerMath(endMath));
    const frag = full.cloneContents();
    for (const el of [...frag.querySelectorAll(MATH)].filter((m) => !m.parentElement?.closest(MATH))) {
      const tex = texOf(el);
      el.replaceWith(document.createTextNode(tex ? ` $${tex}$ ` : ` ${el.textContent} `));
    }
    frag.querySelectorAll('script, style, .sr-only, [class*="visually-hidden"]').forEach((n) => n.remove());
    const wrap = document.createElement("div");
    wrap.append(frag);
    return wrap.textContent.replace(/\s+/g, " ").trim();
  }

  function outerMath(el) {
    let top = el;
    for (let p = el.parentElement?.closest(MATH); p; p = p.parentElement?.closest(MATH)) top = p;
    return top;
  }

  /** Marks where the highlight ends, so fillAnswers() can aim at the next box or choices. */
  function markAnchor(r) {
    document.querySelectorAll("[data-nook-anchor]").forEach((el) => el.removeAttribute("data-nook-anchor"));
    let el = r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement;
    if (el?.closest(MATH)) el = outerMath(el.closest(MATH)).parentElement ?? el;
    el?.setAttribute("data-nook-anchor", "1");
    return el;
  }

  // Same TeX flattening page-fill.js uses for choices, so Gemini's answer matches what it compares.
  function texToPlain(tex) {
    let t = tex;
    for (let i = 0; i < 4; i++) {
      t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
      t = t.replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)");
    }
    t = t.replace(/\\(?:left|right|,|;|!|displaystyle|text|mathrm|operatorname)\b/g, "");
    t = t.replace(/\\cdot|\\times/g, "*");
    t = t.replace(/\\([A-Za-z]+)/g, "$1");
    t = t.replace(/\^\{([^{}]*)\}/g, "^($1)");
    return t.replace(/[{}]/g, "").replace(/\s+/g, "");
  }

  function plainText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(MATH).forEach((m) => {
      if (!m.isConnected && !clone.contains(m)) return;
      const tex = texOf(m);
      m.replaceWith(document.createTextNode(tex ? ` ${texToPlain(tex)} ` : ` ${m.textContent} `));
    });
    return (clone.textContent || "").replace(/\(?choice [a-z]\)?/gi, " ").replace(/\s+/g, " ").trim();
  }

  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };

  /** What answer the page wants right after the highlight: a group of choices, or one box. */
  function describeNear(anchor) {
    const page = { url: location.href, title: document.title };
    if (!anchor) return page;
    const after = (el) => {
      const pos = anchor.compareDocumentPosition(el);
      return !!(pos & Node.DOCUMENT_POSITION_FOLLOWING || pos & Node.DOCUMENT_POSITION_CONTAINED_BY);
    };
    const boxes = [...document.querySelectorAll(
      'input:not([type]), input[type="text"], input[type="number"], input[type="tel"], input[inputmode="decimal"], input[inputmode="numeric"], textarea, select, [contenteditable="true"], .mq-editable-field'
    )].filter((el) => {
      if (el.closest(".mq-editable-field") && !el.matches(".mq-editable-field")) return false;
      if (el.closest("#" + HOST_ID)) return false;
      const hint = [el.type, el.getAttribute("role"), el.getAttribute("aria-label"), el.placeholder, el.name, el.id].join(" ").toLowerCase();
      return !el.disabled && !el.readOnly && isVisible(el) && !/search|combobox|email|password|login|user ?name|comment|chat/.test(hint);
    });
    const inputs = [...document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], .perseus-radio-option, [class*="RadioOption"]')];
    const box = boxes.find(after);
    const firstChoice = inputs.find((el) => after(el) && isVisible(el.closest("label") || el));
    const choiceFirst = firstChoice && (!box || firstChoice.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING);

    if (choiceFirst) {
      const group =
        (firstChoice.name && `[name="${CSS.escape(firstChoice.name)}"]`) ||
        null;
      const scope = group ? null : firstChoice.closest('[role="radiogroup"], [role="group"], fieldset, ul, ol') || firstChoice.parentElement?.parentElement;
      const members = group ? [...document.querySelectorAll(group)] : inputs.filter((el) => scope?.contains(el));
      const seen = new Set();
      const choices = [];
      for (const el of members) {
        const label =
          el.closest(".perseus-radio-option, [class*='RadioOption'], label") ||
          (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
          el.closest('[role="radio"], [role="checkbox"], li') ||
          el.parentElement;
        if (!label || seen.has(label)) continue;
        seen.add(label);
        const text = plainText(label) || el.getAttribute("aria-label") || "";
        if (text) choices.push(text.slice(0, 160));
      }
      const multi = members.some((el) => el.type === "checkbox" || el.getAttribute("role") === "checkbox");
      return { ...page, kind: multi ? "checkboxes" : "choices", choices: choices.slice(0, 12) };
    }
    if (box) {
      if (box.matches(".mq-editable-field")) return { ...page, kind: "math" };
      if (box instanceof HTMLSelectElement) {
        return { ...page, kind: "select", choices: [...box.options].map((o) => o.text.trim()).filter(Boolean).slice(0, 20) };
      }
      return { ...page, kind: box.matches("textarea, [contenteditable='true']") ? "longtext" : box.type === "number" ? "number" : "text" };
    }
    return { ...page, kind: "none" };
  }

  // ——— Placement ———

  function anchorRect() {
    try {
      const rects = range ? [...range.getClientRects()] : [];
      if (rects.length) {
        const first = rects[0];
        const last = rects[rects.length - 1];
        const r = range.getBoundingClientRect();
        return { left: r.left, right: r.right, top: first.top, bottom: last.bottom, lastLeft: last.left, lastBottom: last.bottom };
      }
    } catch {
      /* the range can go stale if the page rewrote that text */
    }
    return null;
  }

  function place() {
    if (!bubble) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const a = anchorRect() ?? { left: vw / 2 - w / 2, right: vw / 2, top: 80, bottom: 80, lastLeft: vw / 2 - w / 2, lastBottom: 80 };

    // Answer boxes usually sit below the question, so keep them visible: above the highlight
    // first, then beside it, and only below it when there is no other room.
    let left = Math.min(Math.max(a.left, MARGIN), vw - w - MARGIN);
    let top;
    let origin;
    if (a.top - GAP - h >= MARGIN) {
      top = a.top - GAP - h;
      origin = "bottom left";
    } else if (a.right + GAP + w <= vw - MARGIN) {
      left = a.right + GAP;
      top = a.top;
      origin = "top left";
    } else {
      top = a.bottom + GAP;
      origin = "top left";
    }
    top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));
    bubble.style.left = `${left + window.scrollX}px`;
    bubble.style.top = `${top + window.scrollY}px`;
    bubble.style.setProperty("--origin", origin);
  }

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;";
    root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.setAttribute("role", "dialog");
    bubble.setAttribute("aria-label", "Nook answer");
    root.append(style, bubble);
    document.documentElement.appendChild(host);
    requestAnimationFrame(() => requestAnimationFrame(() => bubble.classList.add("in")));
  }

  function close() {
    if (!host) return;
    current = -1;
    const h = host;
    bubble.classList.remove("in");
    bubble.classList.add("out");
    setTimeout(() => h.remove(), 160);
    host = root = bubble = null;
  }

  function head(stateText) {
    return `<div class="head"><span class="mark"></span><span class="name">Nook</span>` +
      (stateText ? `<span class="state">${stateText}</span>` : "") +
      `<button class="x" type="button" aria-label="Close">${ICON_X}</button></div>`;
  }

  function wire() {
    bubble.querySelector(".x")?.addEventListener("click", close);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;left:-9999px;top:0";
      document.documentElement.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function showLoading(id) {
    const sel = window.getSelection();
    range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : range;
    let text = "";
    let page = { url: location.href, title: document.title };
    if (range) {
      try {
        text = readSelection(range);
        page = describeNear(markAnchor(range));
      } catch (err) {
        console.warn("Nook couldn't read the highlight:", err);
      }
    }
    ensureHost();
    current = id;
    bubble.innerHTML = head("") +
      `<div class="loading"><div class="row"><span class="spark">${ICON_SPARK}</span><span>Solving</span><span class="dots"><i></i><i></i><i></i></span></div>` +
      `<div class="bar" style="width:100%"></div><div class="bar" style="width:72%"></div></div>`;
    wire();
    place();
    return { text, page };
  }

  function setNote(text, kind = "") {
    if (!bubble) return;
    let note = bubble.querySelector(".note");
    if (!note) {
      note = document.createElement("div");
      bubble.appendChild(note);
    }
    note.className = `note ${kind}`;
    note.textContent = text;
    place();
  }

  async function fillNow(answers, fillBtn, auto) {
    if (typeof fillAnswers !== "function") {
      setNote("Filling isn't available on this page. Use Copy.", "warn");
      return;
    }
    fillBtn.disabled = true;
    setNote("Filling in…");
    let out;
    try {
      out = await fillAnswers(answers, { nearSelection: true });
    } catch (err) {
      out = { filled: [], unmatched: answers, notes: [String(err?.message ?? err)] };
    }
    fillBtn.disabled = false;
    if (!bubble) return;
    if (out.filled.length && !out.unmatched.length) {
      fillBtn.classList.add("done");
      fillBtn.innerHTML = `${ICON_CHECK}<span>Filled</span>`;
      setNote("Filled in. Check it, then submit.", "ok");
    } else if (out.filled.length) {
      setNote(`Filled ${out.filled.length} of ${answers.length}. Copy the rest.`, "warn");
    } else {
      setNote(auto ? "No answer box right after this question. Use Copy to paste it." : "Couldn't find where to put it. Use Copy.", auto ? "" : "warn");
    }
  }

  function showAnswer(id, answers, why) {
    if (id !== current || !bubble) return;
    const answer = answers.join(" | ");
    bubble.innerHTML = head("") +
      `<div class="label">Answer</div><div class="value">${esc(answer)}</div>` +
      (why ? `<div class="why">${esc(why)}</div>` : "") +
      `<div class="actions"><button class="btn primary fill" type="button">${ICON_FILL}<span>Fill</span></button>` +
      `<button class="btn copy" type="button">${ICON_COPY}<span>Copy</span></button></div>`;
    wire();
    const fillBtn = bubble.querySelector(".fill");
    const copyBtn = bubble.querySelector(".copy");
    fillBtn.addEventListener("click", () => fillNow(answers, fillBtn, false));
    copyBtn.addEventListener("click", async () => {
      const ok = await copy(answer);
      copyBtn.classList.toggle("done", ok);
      copyBtn.innerHTML = ok ? `${ICON_CHECK}<span>Copied</span>` : `${ICON_COPY}<span>Copy failed</span>`;
    });
    place();
    chrome.storage.local.get("autoFillPage").then(
      (stored) => {
        if ((stored.autoFillPage ?? true) && id === current) fillNow(answers, fillBtn, true);
      },
      () => {}
    );
  }

  function showError(id, message) {
    if (id !== current || !bubble) return;
    bubble.innerHTML = head("") +
      `<div class="err">${esc(message)}</div>` +
      `<div class="hint">The Nook sidebar has the details. If Gemini asks you to sign in, sign in there and try again.</div>`;
    wire();
    place();
  }

  document.addEventListener("mousedown", (event) => {
    // Only real clicks; fillAnswers() dispatches synthetic mouse events while it fills.
    if (event.isTrusted && host && !event.composedPath().includes(host)) close();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.isTrusted && host && event.key === "Escape") close();
  }, true);
  // The sidebar opening narrows the page, so the selection moves. Follow it.
  window.addEventListener("resize", () => requestAnimationFrame(place));

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "nookBubble") return undefined;
    let data = {};
    if (message.state === "loading") data = showLoading(message.id);
    else if (message.state === "answer") showAnswer(message.id, message.answers?.length ? message.answers : [message.answer], message.why);
    else if (message.state === "error") showError(message.id, message.error);
    sendResponse({ ok: true, ...data });
    return false;
  });

  window.__nookBubble = true;
})();
