/**
 * Injected into the user's current tab with chrome.scripting.executeScript to put Gemini's
 * answers into the page: select the matching choice, type into text/number boxes, and write
 * into MathQuill expression fields. Nothing is submitted; the user still presses Check.
 *
 * Built against Khan Academy (Perseus widgets) first. Must stay self-contained because Chrome
 * serializes this one function, so every helper lives inside it.
 *
 * @param {string[]} answers answers in page order, one per answer box or choice
 * @param {{ nearSelection?: boolean }} [options] nearSelection: aim at the box or choices right after
 *   the element marked data-nook-anchor (set by selection-bubble.js on the highlighted question)
 * @returns {Promise<{ filled: string[], unmatched: string[], notes: string[] }>}
 */
async function fillAnswers(answers, options = {}) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const result = { filled: [], unmatched: [], notes: [] };

  // ——— Page scanning (mirrors describePage in page-agent.js) ———

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };

  const isNotAnswerBox = (el) => {
    const hint = [el.type, el.getAttribute("role"), el.getAttribute("aria-label"), el.placeholder, el.name, el.id]
      .join(" ")
      .toLowerCase();
    return /search|combobox|email|password|login|user ?name|comment|chat/.test(hint);
  };

  function collectAnswerBoxes() {
    const roots = isKhanAcademy()
      ? [...document.querySelectorAll(EXERCISE_ROOT)].filter((root) => isVisible(root))
      : [document];
    const rootList = roots.length ? roots : [document];
    const fields = [];
    for (const root of rootList) {
      fields.push(
        ...root.querySelectorAll(
          'input:not([type]), input[type="text"], input[type="number"], input[type="tel"], input[inputmode="decimal"], input[inputmode="numeric"], textarea, select, [contenteditable="true"], .mq-editable-field'
        )
      );
    }
    const filtered = fields.filter((el) => {
      if (el.closest(".mq-editable-field") && !el.matches(".mq-editable-field")) return false;
      if (!isInExercise(el)) return false;
      return !el.disabled && !el.readOnly && isVisible(el) && !isNotAnswerBox(el);
    });
    return filtered.filter((el) => !filtered.some((other) => other !== el && other.contains(el)));
  }

  /** Reads the TeX source KaTeX/MathJax leave in the DOM, so math choices can be compared as text. */
  function texToPlain(tex) {
    let s = tex;
    for (let i = 0; i < 4; i++) {
      s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
      s = s.replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)");
    }
    s = s.replace(/\\(?:left|right|,|;|!|displaystyle|text|mathrm|operatorname)\b/g, "");
    s = s.replace(/\\cdot|\\times/g, "*");
    s = s.replace(/\\([A-Za-z]+)/g, "$1");
    s = s.replace(/\^\{([^{}]*)\}/g, "^($1)");
    return s.replace(/[{}]/g, "").replace(/\s+/g, "");
  }

  function textOf(el) {
    const clone = el.cloneNode(true);
    // KaTeX renders math twice (MathML for screen readers + HTML); keep one copy.
    clone.querySelectorAll(".katex-html, [aria-hidden='true']").forEach((n) => n.remove());
    clone.querySelectorAll(".katex-mathml").forEach((n) => {
      const annotation = n.querySelector("annotation");
      n.replaceWith(document.createTextNode(annotation ? ` ${texToPlain(annotation.textContent)} ` : n.textContent));
    });
    return (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  const OPTION_HOST =
    ".perseus-radio-option, .perseus-widget-radio-option, [class*='RadioOption'], [class*='radio-option'], [class*='choice-option']";
  const EXERCISE_ROOT =
    ".framework-perseus, .perseus-renderer, [class*='perseus-renderer'], [data-testid*='exercise'], [data-testid*='question-set'], article";

  const isKhanAcademy = () => /(^|\.)khanacademy\.org$/i.test(location.hostname.replace(/^www\./, ""));

  function isExerciseChrome(el) {
    return !!el.closest(
      '[role="dialog"], [class*="donation"], [class*="cookie"], [class*="banner"], nav, header, footer, [aria-label*="Donate" i]'
    );
  }

  function isInExercise(el) {
    if (!isKhanAcademy()) return true;
    return !!el.closest(EXERCISE_ROOT) && !isExerciseChrome(el);
  }

  function choiceLabel(text) {
    return normalize(text)
      .replace(/^choice\s*[a-e]\s*[:.)-]?\s*/i, "")
      .replace(/^[([{]?\s*[a-e]\s*[)\]}]\s*[:.)-]?\s*/i, "")
      .trim();
  }

  function collectChoices() {
    const seen = new Set();
    const choices = [];

    const addChoice = (el, box) => {
      if (!el || !box || seen.has(box) || seen.has(el)) return;
      if (!isInExercise(el)) return;
      if (!isVisible(box) && !isVisible(el)) return;
      const text = textOf(box).replace(/\(?choice [a-z]\)?/gi, " ").replace(/\s+/g, " ").trim();
      if (!text || text.length > 240) return;
      if (/^(check|try again|next question|hint|show calculator|report|skip|one time|recurring|monthly|yearly|other|give now)/i.test(text)) {
        return;
      }
      seen.add(box);
      seen.add(el);
      choices.push({ el, box, text, index: choices.length });
    };

    const roots = isKhanAcademy()
      ? [...document.querySelectorAll(EXERCISE_ROOT)].filter((root) => isVisible(root))
      : [document];
    const rootList = roots.length ? roots : [document];

    for (const root of rootList) {
      for (const el of root.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]'
      )) {
        const labeled =
          el.id && root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        const box =
          el.closest(OPTION_HOST) ||
          labeled ||
          el.closest("label") ||
          el.closest('[role="radio"], [role="checkbox"], li') ||
          el.parentElement;
        addChoice(el, labeled && labeled.contains(el) ? labeled : box);
      }

      for (const box of root.querySelectorAll(OPTION_HOST)) {
        const el =
          box.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]') ||
          box.querySelector("label, button, [tabindex='0']") ||
          box;
        addChoice(el, box);
      }
    }

    return choices;
  }

  // ——— Matching answers to choices ———

  const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!]+$/g, "").trim();
  /** Ignores spacing, grouping parens, and quotes, but keeps operators so 3/4 != (3, -4). */
  const squash = (s) => normalize(s).replace(/[\s()"'`]/g, "").replace(/^\$/, "");
  const asNumber = (s) => {
    const n = Number(String(s).replace(/,/g, "").replace(/[^0-9.\-/]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  function matchChoice(choices, answer) {
    const wanted = normalize(answer);
    const wantedKey = choiceLabel(answer);
    if (!wanted) return null;

    const exact = choices.find((c) => normalize(c.text) === wanted || choiceLabel(c.text) === wantedKey);
    if (exact) return exact;

    const loose = choices.find((c) => {
      const key = choiceLabel(c.text);
      return (squash(c.text) && squash(c.text) === squash(answer)) || (key && squash(key) === squash(wantedKey));
    });
    if (loose) return loose;

    const number = asNumber(answer);
    if (number !== null && /^[-\d.,/\s]+$/.test(answer.trim())) {
      const numeric = choices.find((c) => asNumber(c.text) === number && /^[-\d.,/\s]+$/.test(c.text.trim()));
      if (numeric) return numeric;
    }

    const letter = /^\(?([a-e])\)?$/i.exec(answer.trim());
    if (letter) {
      const index = letter[1].toLowerCase().charCodeAt(0) - 97;
      if (choices[index]) return choices[index];
    }

    const contains = choices.filter((c) => {
      const label = normalize(c.text);
      return label.length > 2 && (label.includes(wanted) || wanted.includes(label));
    });
    return contains.length === 1 ? contains[0] : null;
  }

  function choiceInput(choice) {
    const { el, box } = choice;
    if (el.matches?.('input[type="radio"], input[type="checkbox"]')) return el;
    return box.querySelector('input[type="radio"], input[type="checkbox"]');
  }

  function isChoiceSelected(choice) {
    const input = choiceInput(choice);
    const { el, box } = choice;
    if (input?.checked === true) return true;
    const ariaChecked = [input, el, box]
      .filter(Boolean)
      .some((node) => node.getAttribute?.("aria-checked") === "true" || node.getAttribute?.("aria-pressed") === "true");
    if (ariaChecked) return true;
    const classHint = `${box.className} ${el.className} ${input?.className ?? ""}`;
    if (/checked|selected|chosen|active/i.test(classHint)) return true;
    if (isKhanAcademy() && box.querySelector?.("[class*='selected'], [class*='checked'], [data-selected='true']")) {
      return true;
    }
    return false;
  }

  async function clickLikeUser(el) {
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = el.getBoundingClientRect();
    const clientX = rect.left + Math.max(4, rect.width / 2);
    const clientY = rect.top + Math.max(4, rect.height / 2);
    const base = { bubbles: true, cancelable: true, clientX, clientY, view: window };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, base));
      await sleep(12);
    }
    if (typeof el.click === "function") el.click();
  }

  async function selectChoice(choice) {
    if (isChoiceSelected(choice)) return true;

    const input = choiceInput(choice);
    const label =
      (input?.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) ||
      choice.box.querySelector("label");
    const clickTarget =
      label ||
      choice.box.querySelector("[role='radio'], [role='checkbox'], button, [tabindex='0']") ||
      choice.box;

    await clickLikeUser(clickTarget);
    await sleep(isKhanAcademy() ? 120 : 60);
    if (isChoiceSelected(choice)) return true;

    if (clickTarget !== choice.box) {
      await clickLikeUser(choice.box);
      await sleep(isKhanAcademy() ? 120 : 60);
    }
    if (isChoiceSelected(choice)) return true;

    if (input && !input.disabled) {
      await clickLikeUser(input);
      await sleep(60);
    }

    return isChoiceSelected(choice);
  }

  // ——— Plain inputs ———

  function setNativeValue(input, value) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    input.focus();
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillSelect(select, value) {
    const options = [...select.options];
    const option =
      options.find((o) => normalize(o.textContent) === normalize(value)) ||
      options.find((o) => squash(o.textContent) === squash(value)) ||
      options.find((o) => normalize(o.value) === normalize(value));
    if (!option) return false;
    select.focus();
    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function fillContentEditable(el, value) {
    el.focus();
    const selection = window.getSelection();
    selection.selectAllChildren(el);
    document.execCommand("insertText", false, value);
    return (el.innerText || "").trim() === value.trim();
  }

  // ——— Math expression parsing (typed format -> small AST) ———
  //
  // Gemini answers in the format a person types on Khan Academy: 3/4, x^(n+1), sqrt(2)*pi,
  // (x+1)/(x-2), 4x^3cos(x^4). The AST lets us emit either LaTeX (pasted into MathQuill) or
  // keystrokes (typed into MathQuill), whichever the field accepts.

  const FUNCTIONS = new Set([
    "sin", "cos", "tan", "sec", "csc", "cot",
    "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
    "ln", "log", "exp", "abs",
  ]);
  const GREEK = new Set(["pi", "theta", "phi", "alpha", "beta", "gamma", "delta", "lambda", "mu", "sigma", "omega"]);
  const OPERATORS = new Set(["+", "-", "=", "<", ">", ",", "≤", "≥", "≠", "±"]);
  const CLOSERS = { "(": ")", "[": "]", "{": "}", "|": "|" };

  function tokenize(text) {
    const tokens = [];
    const re = /\d+\.\d+|\.\d+|\d+|[A-Za-z]+|\s+|./gsu;
    for (const match of text.replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/").matchAll(re)) {
      const v = match[0];
      if (/^\s+$/.test(v)) continue;
      if (/^\d/.test(v) || /^\.\d/.test(v)) tokens.push({ kind: "num", v });
      else if (/^[A-Za-z]+$/.test(v)) tokens.push({ kind: "word", v });
      else tokens.push({ kind: "sym", v });
    }
    return tokens;
  }

  function parseMath(text) {
    const tokens = tokenize(text);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const peekSym = () => (peek()?.kind === "sym" ? peek().v : null);

    function parseExpr(stop) {
      const nodes = [];
      while (peek() && !(peek().kind === "sym" && peek().v === stop)) {
        const sym = peekSym();
        if (sym && OPERATORS.has(sym)) {
          next();
          nodes.push({ t: "op", v: sym });
        } else if (sym === "*") {
          next();
          nodes.push({ t: "mul" });
        } else {
          const before = pos;
          nodes.push(parseFraction());
          if (pos === before) {
            nodes.pop();
            nodes.push({ t: "sym", v: next().v });
          }
        }
      }
      return nodes;
    }

    const unwrap = (node) => (node?.t === "group" && node.open === "(" ? node.body : node ? [node] : []);

    function parseFraction() {
      let left = parsePower();
      while (peekSym() === "/") {
        next();
        const right = parsePower();
        left = { t: "frac", num: unwrap(left), den: unwrap(right) };
      }
      return left;
    }

    function parsePower() {
      let base = parseAtom();
      while (base && (peekSym() === "^" || peekSym() === "_")) {
        const kind = next().v === "^" ? "pow" : "sub";
        base = { t: kind, base, exp: unwrap(parseAtom()) };
      }
      return base;
    }

    function parseAtom() {
      const tok = peek();
      if (!tok) return null;
      if (tok.kind === "num") {
        next();
        return { t: "num", v: tok.v };
      }
      if (tok.kind === "word") {
        next();
        const word = tok.v;
        const lower = word.toLowerCase();
        if ((lower === "sqrt" || lower === "cbrt") && peekSym() === "(") {
          next();
          const body = parseExpr(")");
          if (peekSym() === ")") next();
          return { t: "root", index: lower === "cbrt" ? "3" : "", body };
        }
        if (FUNCTIONS.has(lower) && peekSym() === "(") {
          next();
          const arg = parseExpr(")");
          if (peekSym() === ")") next();
          return { t: "func", name: lower, arg };
        }
        if (GREEK.has(lower)) return { t: "greek", v: lower };
        if (word.length === 1) return { t: "id", v: word };
        return { t: "seq", body: [...word].map((ch) => ({ t: "id", v: ch })) };
      }
      if (tok.v in CLOSERS) {
        next();
        const close = CLOSERS[tok.v];
        const body = parseExpr(close);
        if (peekSym() === close) next();
        return { t: "group", open: tok.v === "{" ? "(" : tok.v, body };
      }
      if (tok.v === "-" || tok.v === "+") {
        next();
        const operand = parseAtom();
        return { t: "seq", body: [{ t: "op", v: tok.v }, ...(operand ? [operand] : [])] };
      }
      if (tok.v === ")" || tok.v === "]") return null;
      next();
      return { t: "sym", v: tok.v };
    }

    return parseExpr(null);
  }

  // ——— Emitters ———

  function toLatex(nodes) {
    return nodes.map(nodeToLatex).join("");
  }

  function nodeToLatex(node) {
    switch (node.t) {
      case "num":
      case "id":
        return node.v;
      case "greek":
        return `\\${node.v} `;
      case "op":
        return { "≤": "\\le ", "≥": "\\ge ", "≠": "\\ne ", "±": "\\pm " }[node.v] ?? node.v;
      case "mul":
        return "\\cdot ";
      case "sym":
        return { "%": "\\%", "°": "^\\circ ", "∞": "\\infty " }[node.v] ?? node.v;
      case "seq":
        return toLatex(node.body);
      case "group": {
        const close = CLOSERS[node.open];
        return `\\left${node.open}${toLatex(node.body)}\\right${close}`;
      }
      case "func":
        if (node.name === "abs") return `\\left|${toLatex(node.arg)}\\right|`;
        return `\\${node.name}\\left(${toLatex(node.arg)}\\right)`;
      case "root":
        return node.index ? `\\sqrt[${node.index}]{${toLatex(node.body)}}` : `\\sqrt{${toLatex(node.body)}}`;
      case "frac":
        return `\\frac{${toLatex(node.num)}}{${toLatex(node.den)}}`;
      case "pow":
        return `${nodeToLatex(node.base)}^{${toLatex(node.exp)}}`;
      case "sub":
        return `${nodeToLatex(node.base)}_{${toLatex(node.exp)}}`;
      default:
        return "";
    }
  }

  /**
   * Keystroke plan for typing into MathQuill the way a person would: "sqrt" and "pi" trigger
   * Khan Academy's auto-commands, "/" builds a fraction from what's to its left, "^" opens an
   * exponent, and Right arrow steps out of a block.
   * @returns {Array<{ text?: string, key?: string }>}
   */
  function toKeystrokes(nodes) {
    const steps = [];
    const text = (v) => steps.push({ text: v });
    const key = (v) => steps.push({ key: v });
    const isSimple = (list) => list.length === 1 && ["num", "id", "greek"].includes(list[0].t);
    // "/" in MathQuill takes everything to its left back to the previous operator as the
    // numerator, so parens are only needed when the numerator itself has an operator.
    const hasOperator = (list) => list.some((n) => n.t === "op" || n.t === "mul");

    const emitAll = (list) => list.forEach(emit);
    function emit(node) {
      switch (node.t) {
        case "num":
        case "id":
        case "greek":
        case "op":
        case "sym":
          text(node.v);
          break;
        case "mul":
          text("*");
          break;
        case "seq":
          emitAll(node.body);
          break;
        case "group":
          text(node.open);
          emitAll(node.body);
          text(CLOSERS[node.open]);
          break;
        case "func":
          text(node.name === "abs" ? "|" : `${node.name}(`);
          emitAll(node.arg);
          text(node.name === "abs" ? "|" : ")");
          break;
        case "root":
          if (node.index) {
            text("nthroot");
            text(node.index);
            key("Right");
          } else {
            text("sqrt");
          }
          emitAll(node.body);
          key("Right");
          break;
        case "frac":
          if (!hasOperator(node.num)) emitAll(node.num);
          else {
            text("(");
            emitAll(node.num);
            text(")");
          }
          text("/");
          emitAll(node.den);
          key("Right");
          break;
        case "pow":
        case "sub":
          emit(node.base);
          text(node.t === "pow" ? "^" : "_");
          if (isSimple(node.exp)) emitAll(node.exp);
          else {
            text("(");
            emitAll(node.exp);
            text(")");
          }
          key("Right");
          break;
      }
    }
    emitAll(nodes);
    return steps;
  }

  // ——— MathQuill fields ———

  const KEY_CODES = { Right: 39, Left: 37, Backspace: 8, a: 65 };

  function pressKey(textarea, name, init = {}) {
    const keyCode = KEY_CODES[name] ?? 0;
    const eventInit = { key: name === "Right" ? "ArrowRight" : name, keyCode, which: keyCode, bubbles: true, cancelable: true, ...init };
    textarea.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    textarea.dispatchEvent(new KeyboardEvent("keyup", eventInit));
  }

  const mathRoot = (field) => field.querySelector(".mq-root-block");
  /** Ignores MathQuill's cursor, which is a zero-width space that trim() doesn't remove. */
  const mathIsEmpty = (field) => {
    const root = mathRoot(field);
    if (!root) return true;
    const clone = root.cloneNode(true);
    clone.querySelectorAll(".mq-cursor").forEach((n) => n.remove());
    return !(clone.textContent ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  };

  async function clearMathField(field, textarea) {
    if (mathIsEmpty(field)) return;
    textarea.focus();
    pressKey(textarea, "a", { key: "a", ctrlKey: true });
    await sleep(30);
    pressKey(textarea, "Backspace");
    await sleep(30);
    if (!mathIsEmpty(field)) {
      // Fall back to deleting from the right end, one node at a time.
      pressKey(textarea, "a", { key: "a", metaKey: true });
      await sleep(30);
      pressKey(textarea, "Backspace");
      await sleep(30);
    }
  }

  async function pasteLatexInto(textarea, latex) {
    textarea.focus();
    textarea.value = latex;
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", latex);
    textarea.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    await sleep(80);
  }

  async function typeInto(textarea, steps) {
    for (const step of steps) {
      if (step.key) {
        pressKey(textarea, step.key);
        await sleep(25);
        continue;
      }
      for (const ch of step.text) {
        textarea.focus();
        const code = ch.charCodeAt(0);
        // MathQuill treats a keypress without a fresh keydown as a key repeat and re-fires the
        // previous keydown (e.g. our Right arrow), so send a neutral keydown first. keyCode 0
        // stringifies to a key MathQuill ignores.
        textarea.dispatchEvent(new KeyboardEvent("keydown", { key: ch, keyCode: 0, which: 0, bubbles: true, cancelable: true }));
        textarea.value = ch;
        textarea.dispatchEvent(
          new KeyboardEvent("keypress", { key: ch, charCode: code, keyCode: code, which: code, bubbles: true, cancelable: true })
        );
        textarea.dispatchEvent(new KeyboardEvent("keyup", { key: ch, keyCode: 0, which: 0, bubbles: true, cancelable: true }));
        await sleep(25);
      }
    }
  }

  async function fillMathField(field, value) {
    const textarea = field.querySelector("textarea");
    if (!textarea) return false;
    field.scrollIntoView({ block: "nearest" });
    field.click();
    textarea.focus();
    const ast = parseMath(value);

    await clearMathField(field, textarea);
    await pasteLatexInto(textarea, toLatex(ast));
    if (!mathIsEmpty(field)) return true;

    await typeInto(textarea, toKeystrokes(ast));
    await sleep(60);
    return !mathIsEmpty(field);
  }

  // ——— Dispatch ———

  async function fillBox(box, value) {
    if (box.matches(".mq-editable-field")) return fillMathField(box, value);
    if (box instanceof HTMLSelectElement) return fillSelect(box, value);
    if (box.isContentEditable) return fillContentEditable(box, value);
    box.scrollIntoView({ block: "nearest" });
    setNativeValue(box, value);
    return box.value === value;
  }

  const describeBox = (box) =>
    box.matches(".mq-editable-field") ? "math box" : box instanceof HTMLSelectElement ? "dropdown" : "answer box";

  let choices = collectChoices();
  let boxes = collectAnswerBoxes();
  let boxIndex = 0;
  let preferChoices = choices.length > 0 && (choices.length >= boxes.length || boxes.length === 0);

  // Highlighted question: use whatever comes right after it (a box, or one group of choices),
  // so a page with many questions gets the answer in the right place.
  const anchor = options.nearSelection ? document.querySelector("[data-nook-anchor]") : null;
  if (anchor) {
    const isAfter = (el) => {
      const pos = anchor.compareDocumentPosition(el);
      return !!(pos & Node.DOCUMENT_POSITION_FOLLOWING || pos & Node.DOCUMENT_POSITION_CONTAINED_BY);
    };
    const nearFirst = (list, elOf) => [
      ...list.filter((item) => isAfter(elOf(item))),
      ...list.filter((item) => !isAfter(elOf(item))).reverse(),
    ];
    const groupOf = (choice) => {
      const { el, box } = choice;
      if (el.name && el.matches?.('input[type="radio"], input[type="checkbox"]')) return `name:${el.name}`;
      return el.closest('[role="radiogroup"], [role="group"], [role="listbox"], fieldset, ul, ol') ?? box.parentElement;
    };
    boxes = nearFirst(boxes, (box) => box);
    choices = nearFirst(choices, (choice) => choice.box);
    const firstBox = boxes[0];
    const firstChoice = choices[0];
    const choiceAfter = !!firstChoice && isAfter(firstChoice.box);
    const boxAfter = !!firstBox && isAfter(firstBox);
    const choiceBeforeBox =
      !!firstChoice && !!firstBox && !!(firstChoice.box.compareDocumentPosition(firstBox) & Node.DOCUMENT_POSITION_FOLLOWING);
    const choiceComesFirst = choiceAfter
      ? !boxAfter || choiceBeforeBox
      : !boxAfter && !!firstChoice && !firstBox;
    if (choiceComesFirst) {
      const group = groupOf(firstChoice);
      choices = choices.filter((choice) => groupOf(choice) === group);
      preferChoices = true;
    } else {
      preferChoices = false;
    }
  }

  for (const raw of answers) {
    const answer = String(raw ?? "").trim();
    if (!answer) continue;

    const choice = preferChoices && choices.length ? matchChoice(choices, answer) : null;
    if (choice) {
      choices = choices.filter((c) => c !== choice && c.box !== choice.box);
      if (await selectChoice(choice)) {
        result.filled.push(answer);
        result.notes.push(`Selected "${choice.text.slice(0, 60)}"`);
      } else {
        result.unmatched.push(answer);
        result.notes.push(`Found the choice "${choice.text.slice(0, 60)}" but couldn't select it`);
      }
      continue;
    }

    const box = boxes[boxIndex];
    if (!box) {
      result.unmatched.push(answer);
      result.notes.push(
        choices.length ? `No choice matches "${answer}"` : `No answer box left for "${answer}"`
      );
      continue;
    }
    boxIndex++;

    let ok = false;
    try {
      ok = await fillBox(box, answer);
    } catch (err) {
      result.notes.push(`Error filling ${describeBox(box)}: ${err?.message ?? err}`);
    }
    if (ok) {
      result.filled.push(answer);
      result.notes.push(`Typed "${answer}" into the ${describeBox(box)}`);
    } else {
      result.unmatched.push(answer);
      result.notes.push(`Couldn't type "${answer}" into the ${describeBox(box)}`);
    }
  }

  return result;
}
