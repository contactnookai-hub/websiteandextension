/**
 * Injected into the user's current tab with chrome.scripting.executeScript to describe the
 * page's visible answer boxes and choices, so the prompt can ask for the right answer format.
 * Read-only: it never changes the page. Must stay self-contained because Chrome serializes
 * this one function, so helpers live inside it.
 */
function describePage() {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };

  const isNotAnswerBox = (el) => {
    const hint = [el.type, el.getAttribute("role"), el.getAttribute("aria-label"), el.placeholder, el.name, el.id]
      .join(" ")
      .toLowerCase();
    return /search|combobox|email|password|login|user ?name|comment|chat/.test(hint);
  };

  const fields = [
    ...document.querySelectorAll(
      'input:not([type]), input[type="text"], input[type="number"], input[type="tel"], textarea, [contenteditable="true"], .mq-editable-field'
    ),
  ].filter((el) => {
    const insideMath = el.closest(".mq-editable-field");
    if (insideMath && insideMath !== el) return false;
    return !el.disabled && !el.readOnly && isVisible(el) && !isNotAnswerBox(el);
  });
  const answerBoxes = fields.filter((el) => !fields.some((other) => other !== el && other.contains(el)));

  const seen = new Set();
  const choices = [];
  for (const el of document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]')) {
    const box =
      el.closest("label") ||
      (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
      el.closest('[role="radio"], [role="checkbox"], li') ||
      el.parentElement;
    if (!box || seen.has(box) || !isVisible(box)) continue;
    const text = (box.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    seen.add(box);
    choices.push(text.slice(0, 100));
  }

  return {
    url: location.href,
    title: document.title,
    textFieldCount: answerBoxes.filter((el) => !el.matches(".mq-editable-field")).length,
    mathFieldCount: answerBoxes.filter((el) => el.matches(".mq-editable-field")).length,
    choices: choices.slice(0, 12),
  };
}

/**
 * The question text the user can see right now (what a screenshot would show), with math as its
 * TeX source (copied math text is garbled). v7 sends this to Gemini when Gemini won't take the
 * screenshot. Only on-screen, visible text counts, so preloaded or hidden problems are left out.
 * Self-contained, like describePage.
 */
function readPageText() {
  const MATH = ".katex, mjx-container, math";
  const SKIP = 'script, style, noscript, svg, nav, footer, [aria-hidden="true"], #nook-answer-bubble, #nook-engine';
  const vh = window.innerHeight, vw = window.innerWidth;
  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return false;
    return el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
  };

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
  const texOf = (m) => {
    const tex = m.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent ||
      m.getAttribute("alttext") || m.querySelector?.("math")?.getAttribute("alttext");
    if (tex) return tex;
    const math = m.localName === "math" ? m : m.querySelector?.("math");
    return math ? mathmlToText(math).replace(/\s+/g, " ") : m.getAttribute("aria-label") || m.textContent;
  };
  // Read the area around the first answer box on screen (the question, its choices), not the
  // whole page: menus, lesson lists and cookie banners only confuse the answer.
  const BOX = 'input:not([type="hidden"]):not([type="search"]):not([type="password"]):not([type="email"]), textarea, select, [contenteditable="true"], .mq-editable-field, [role="radio"], [role="checkbox"]';
  let root = document.body;
  const firstBox = [...document.querySelectorAll(BOX)].find((el) => !el.closest("#nook-answer-bubble, #nook-engine") && onScreen(el.closest("label") || el));
  if (firstBox) {
    for (let node = firstBox.parentElement; node && node !== document.body; node = node.parentElement) {
      const len = (node.innerText || "").trim().length;
      if (len > 5000) break;
      root = node;
      if (len >= 220) break;
    }
  }
  const parts = [];
  let lastBlock = null;
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.replace(/\s+/g, " ");
        if (!text.trim() || !onScreen(child.parentElement)) continue;
        const block = child.parentElement.closest("p, li, h1, h2, h3, h4, h5, h6, td, label, div");
        if (block !== lastBlock) { parts.push("\n"); lastBlock = block; }
        parts.push(text);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.matches(MATH)) {
          if (onScreen(child)) parts.push(` ${texOf(child).trim()} `);
        } else if (!child.matches(SKIP)) {
          walk(child);
        }
      }
    }
  };
  walk(root);
  if (root !== document.body && parts.join("").trim().length < 40) walk(document.body);
  return parts.join("").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").slice(0, 6000);
}
