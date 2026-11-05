/**
 * Per-site answer formatting rules, so the answer Gemini gives can be typed or selected
 * as-is on the site the user is on. Add new sites to SITE_PROFILES.
 */

const SITE_PROFILES = [
  {
    name: "Khan Academy",
    matches: (host) => host.endsWith("khanacademy.org"),
    format:
      "Khan Academy answer boxes take plain numbers (-5, 0.75), simplified fractions with no spaces (3/4, -7/2), " +
      "mixed numbers as improper fractions unless the question says otherwise, and pi written as pi. " +
      "For expressions, use ^ for exponents with parentheses around multi-part exponents (x^(n+1)), " +
      "* for multiplication, sqrt(...) for square roots, and parentheses around multi-part numerators or denominators ((x+1)/(x-2)). " +
      'Do not include units, "x =", "F\'(x) =", or extra words. For multiple choice, give the exact text of the correct choice.',
  },
  {
    name: "IXL",
    matches: (host) => host.endsWith("ixl.com"),
    format:
      "IXL answer boxes take numbers without commas, fractions as a/b, mixed numbers as \"2 1/3\", and decimals " +
      "rounded only if the question says so. No units unless the box needs them. For multiple choice, give the exact choice text.",
  },
  {
    name: "DeltaMath",
    matches: (host) => host.endsWith("deltamath.com"),
    format:
      "DeltaMath takes exact simplified answers: fractions as a/b, exponents with ^ (x^2), roots as sqrt(x), " +
      "and decimals only when the question asks for rounding.",
  },
  {
    name: "MathXL / Pearson",
    matches: (host) => /mathxl|pearson|mylab/.test(host),
    format:
      "MathXL takes exact simplified answers: fractions as a/b, exponents with ^, roots as sqrt(x). " +
      "Round only when the question specifies, and match any requested form (e.g. slope-intercept).",
  },
  {
    name: "Google Forms",
    matches: (host, path) => host === "docs.google.com" && path.startsWith("/forms"),
    format:
      "For multiple choice or checkboxes, give the exact option text. For short answer, give only the concise answer text.",
  },
  {
    name: "Canvas quiz",
    matches: (host) => host.endsWith("instructure.com") || host.includes("canvas"),
    format:
      "For multiple choice, give the exact option text. For numeric answers, give a plain number. " +
      "For fill-in-the-blank, give only the word or phrase for each blank.",
  },
  {
    name: "Quizlet",
    matches: (host) => host.endsWith("quizlet.com"),
    format: "Give the exact term or definition text as it would be typed, matching the card's wording.",
  },
  {
    name: "Quizizz / Kahoot / Blooket",
    matches: (host) => /quizizz|wayground|kahoot|blooket|gimkit/.test(host),
    format: "These are multiple choice: give the exact text of the correct option.",
  },
];

const DEFAULT_FORMAT =
  "Match the format the page's answer box expects. Look at the screenshot for hints like \"enter a fraction\", " +
  "\"round to the nearest tenth\", or \"select all that apply\". For multiple choice, give the exact option text.";

/**
 * @param {string} url
 */
export function findSiteProfile(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    return SITE_PROFILES.find((profile) => profile.matches(host, pathname)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Builds the "What's the answer?" prompt for the page the user is on.
 * @param {{ url?: string, title?: string, textFieldCount?: number, mathFieldCount?: number, choices?: string[] } | null} page
 */
/**
 * @param {object} page what describePage() found
 * @param {string} [pageText] the on-screen text around the answer box, math written out (readPageText()).
 *   Sent with the screenshot so Gemini doesn't have to read small or rendered math from the image alone.
 */
export function buildAnswerPrompt(page, pageText = "") {
  const profile = page?.url ? findSiteProfile(page.url) : null;
  const lines = [];

  if (page?.url) {
    const host = new URL(page.url).hostname.replace(/^www\./, "");
    lines.push(`The screenshot shows my current web page${page.title ? ` "${page.title}"` : ""} on ${profile?.name ?? host}.`);
  }
  lines.push("Solve the question or problem shown in the screenshot.");
  if (pageText) {
    lines.push("");
    lines.push("Here is the same question's text copied from the page, with the math written out, to help you read it:");
    lines.push(`"""\n${pageText.slice(0, 4000)}\n"""`);
  }
  lines.push("");
  lines.push(`Answer format for this site: ${profile?.format ?? DEFAULT_FORMAT}`);

  const boxes = (page?.textFieldCount ?? 0) + (page?.mathFieldCount ?? 0);
  if (boxes > 0) {
    lines.push(`The page has ${boxes} answer box${boxes === 1 ? "" : "es"} to fill in.`);
  }
  if (page?.choices?.length) {
    lines.push(
      `The page's answer choices are: ${page.choices.map((c) => `"${c}"`).join(", ")}. ` +
        "If the answer is one of these, copy that choice's text exactly as written here."
    );
  }

  lines.push("");
  lines.push("Reply in exactly this structure:");
  lines.push("ANSWER: <only the final answer, formatted exactly as it should be typed or selected on this site>");
  lines.push("(blank line)");
  lines.push("One or two sentences explaining why.");
  lines.push('If there are several answer boxes or questions, put all answers on the ANSWER line in order, separated by " | ".');
  lines.push("Do not use LaTeX or $ math notation.");

  return lines.join("\n");
}

/**
 * Prompt for text the user highlighted and sent with right-click "Ask Nook".
 * @param {string} selection
 * @param {{ url?: string, title?: string } | null} page
 */
export function buildSelectionPrompt(selection, page) {
  const profile = page?.url ? findSiteProfile(page.url) : null;
  let where = "";
  try {
    if (page?.url) where = ` on ${profile?.name ?? new URL(page.url).hostname.replace(/^www\./, "")}`;
  } catch {
    /* not a normal web page */
  }
  const lines = [
    `I highlighted this text on a web page${where}${page?.title ? ` ("${page.title}")` : ""}:`,
    '"""',
    selection.slice(0, 6000),
    '"""',
    "",
    "If it is a question or problem, solve it. If it is not a question, give a short, direct explanation of it instead.",
    "Math is written in TeX between $ signs. If any math still looks garbled (for example x4 for x^4), read it the way the problem intends.",
  ];
  if (profile) lines.push(`Answer format for this site: ${profile.format}`);
  const kind = page?.kind;
  const choices = page?.choices ?? [];
  if ((kind === "choices" || kind === "checkboxes") && choices.length) {
    lines.push(
      `Right after this question the page has these ${kind === "checkboxes" ? "checkboxes (select all that apply)" : "answer choices"}: ` +
        choices.map((c) => `"${c}"`).join(", ") +
        `. Give the correct choice${kind === "checkboxes" ? 's, separated by " | "' : ""}, copying the choice text exactly as written here.`
    );
  } else if (kind === "select" && choices.length) {
    lines.push(`The answer goes in a dropdown with these options: ${choices.map((c) => `"${c}"`).join(", ")}. Give the matching option exactly as written.`);
  } else if (kind === "math") {
    lines.push(
      "The answer goes in a math input box, typed as plain text: use ^ for exponents with parentheses around multi-part exponents (x^(n+1)), " +
        "* only where needed, sqrt(...) for roots, a/b for fractions with parentheses around multi-part parts ((x+1)/(x-2)), pi for π. " +
        'No LaTeX, no units, and no "x =" or "F\'(x) =" prefix.'
    );
  } else if (kind === "number") {
    lines.push("The answer goes in a number box: give only the number, no units or words.");
  } else if (kind === "text") {
    lines.push("The answer goes in a short text box: give only what should be typed into it, with no extra words.");
  } else if (kind === "longtext") {
    lines.push("The answer goes in a larger text box: the ANSWER line may be a full sentence or short paragraph, ready to paste.");
  }
  lines.push(
    "",
    "Reply in exactly this structure:",
    "ANSWER: <only the final answer, exactly as it should be typed or selected, on one line>",
    "(blank line)",
    "One or two sentences explaining why.",
    "Do not use LaTeX or $ math notation."
  );
  return lines.join("\n");
}

/**
 * The short explanation after the ANSWER line, trimmed for the bubble.
 * @param {string} replyText
 */
export function parseExplanation(replyText) {
  const rest = replyText.replace(/^[\s\S]*?ANSWER\s*[:：][^\n]*\n?/i, "").replace(/\*\*/g, "").trim();
  const flat = rest.replace(/\s+/g, " ");
  if (!flat) return "";
  const sentences = flat.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [flat];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).length > 260) break;
    out += sentence;
  }
  return (out || flat.slice(0, 257) + "…").trim();
}

/**
 * Pulls the answer(s) out of Gemini's reply.
 * @param {string} replyText
 * @returns {string[]}
 */
export function parseAnswers(replyText) {
  const match = replyText.match(/ANSWER\s*[:：]\s*(.+)/i);
  if (!match) return [];
  return match[1]
    .replace(/\*\*/g, "")
    .split(/\s+\|\s+/)
    .map((part) => part.trim().replace(/^[`"']+|[`"'.]+$/g, "").trim())
    .filter(Boolean);
}
