// Builds the Claude Design canvas artboards (static .dc.html snapshots of the landing page) from index.html + styles.css.
// The live site animates its demos with site.js; a canvas artboard can't run that, so each demo is frozen at its
// most telling frame. Run: node tools/canvas.mjs <outRoot> <assetMap.json>
//   outRoot/project/Main.dc.html, Mobile.dc.html, canvas.json  (+ outRoot/preview.html with local paths, for measuring)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const [outRoot, mapFile, hDesk = "9000", hMob = "12000"] = process.argv.slice(2);
const BLOB = JSON.parse(readFileSync(mapFile, "utf8")); // { "assets/scene/far.svg": "/_blob/..", ... }
const STORE = "https://chromewebstore.google.com/detail/nook-ai-answering-sidebar/fpoojjlpjldmeamnjhbmkkokjlfhdelc";

let html = readFileSync(join(SITE, "index.html"), "utf8");
let css = readFileSync(join(SITE, "styles.css"), "utf8");

const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("<script src=\"https://cdn.jsdelivr.net/npm/lenis"));
let b = body;
// the first-open intro is a live-site effect; the snapshot starts on the hero
b = b.replace(/<div class="intro" id="intro"[\s\S]*?(?=<nav class="nav")/, "");
const sub = (a, c) => { if (!b.includes(a)) throw new Error("missing: " + a.slice(0, 60)); b = b.replace(a, c); };

// ——— static frames of the demos ———
const PAGE = (typed, done) => `
    <div class="pg-top"><i></i>Practice<span>AP Calculus · Unit 3</span></div>
    <div class="pg-body">
      <div class="pg-eb">CHAIN RULE</div>
      <div class="pg-h">Derivatives of composite functions</div>
      <div class="pg-q">Let <i>F</i>(<i>x</i>) = sin(<i>x</i><sup>4</sup>). Find <i>F</i>′(<i>x</i>).</div>
      <div class="pg-row"><span><i>F</i>′(<i>x</i>) =</span><div class="pg-in"${typed ? ' style="border-color:#1865f2;box-shadow:0 0 0 3px rgba(24,101,242,0.18)"' : ""}><span class="typed">${typed}</span></div></div>
      <div class="pg-hint">Stuck? <b>Use a hint.</b></div>
    </div>
    <div class="pg-foot"${done ? ' style="background:#e7f6ed"' : ""}><i class="d f"></i><i class="d f"></i><i class="d${done ? " f" : ""}"></i><i class="d"></i><span class="t">Do 4 problems</span>
      <div class="pg-good"${done ? ' style="opacity:1"' : ""}><i><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg></i>Nice work!</div>
      <div class="pg-check"${done ? ' style="background:#1fab54"' : ""}><span class="c0"${done ? ' style="opacity:0"' : ""}>Check</span><span class="c1" style="opacity:${done ? 1 : 0}">Next</span></div>
    </div>`;
const ANSWER = "4x^3cos(x^4)";
const RESP = "Chain rule: sin(u)′ = cos(u)·u′, and here u′ = 4x³.";
const CUR = `<svg viewBox="0 0 24 24"><path d="M5 3l14 8.2-6.3 1.4L9.6 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"></path></svg>`;
const THUMB = `<div class="th"><div class="pg" style="top:0;width:620px;height:580px;transform:scale(0.2484);transform-origin:0 0">${PAGE("", false)}</div></div>`;
const GEM_ANSWER = (ub, sp, resp) => `
          <div class="gem-head"><div class="bars"></div><span>Gemini</span><span class="m">Flash ▾</span><div class="av"></div></div>
          <div class="ubub" style="top:${ub}px;opacity:1">${THUMB}<p>What's the answer? Format it for this site.</p></div>
          <svg class="gsp" viewBox="0 0 24 24" style="top:${sp}px"><use href="#i-spark" fill="url(#gemgrad)"></use></svg>
          <div class="resp" style="top:${resp}px">${RESP}<div class="ans">ANSWER: <code><b style="right:0"></b><span>${ANSWER}</span></code></div></div>
          <div class="ginput">+&nbsp;&nbsp;&nbsp;Ask Gemini</div>`;

const HERO_STAGE = `
    <div class="win" style="left:70px;top:34px;width:980px;height:620px">
      <div class="chrome"><div class="lights"><i></i><i></i><i></i></div><div class="url">practice.example<b>/calculus/chain-rule</b></div><div class="ext"><svg viewBox="0 0 120 120"><use href="#logo"></use></svg></div></div>
      <div class="pg" style="width:620px">${PAGE(ANSWER, true)}</div>
      <div class="panel" style="width:360px">
        <div class="tb">
          <div class="tb-top"><div class="wm"><i></i>Nook</div><div class="tb-icons"><svg class="ic"><use href="#i-help"></use></svg><svg class="ic"><use href="#i-reload"></use></svg><svg class="ic"><use href="#i-user"></use></svg></div></div>
          <div class="pbtn"><svg class="ic"><use href="#i-spark"></use></svg><span>What's the answer?</span></div>
          <div class="hk">Hotkey <span class="k">⌥⇧A</span> Alt+Shift+A on Windows</div>
          <div class="pills"><div class="pl"><svg class="ic"><use href="#i-camera"></use></svg>Screenshot</div><div class="pl">Auto fill<span class="sw on"><i></i></span></div><div class="pl dim">Auto copy<span class="sw"><i></i></span></div></div>
          <div class="status ok"><i></i><span class="s1">Filled in. Check it, then press Check.</span></div>
        </div>
        <div class="acard" style="height:40px;opacity:1"><span class="v">${ANSWER}</span><span class="a"><svg class="ic"><use href="#i-fill"></use></svg>Fill</span><span class="a"><svg class="ic"><use href="#i-copy"></use></svg>Copy</span></div>
        <div class="gem" style="top:236px">${GEM_ANSWER(52, 192, 190)}</div>
      </div>
    </div>
    <div class="cur" style="transform:translate(612px,618px)">${CUR}</div>`;

const MINI = `
    <div class="scene-s on">
      <div class="panel" style="left:150px;top:40px;width:320px;height:390px;border-radius:16px;border:1px solid rgba(0,0,0,0.2);box-shadow:0 30px 70px rgba(20,25,45,.35);background:#131314">
        <div class="gem" style="top:0">${GEM_ANSWER(56, 196, 194).replace('class="resp"', 'class="resp" style="left:40px"').replace('style="left:40px" style="top:194px"', 'style="top:194px;left:40px"')}</div>
      </div>
    </div>`;

const Q = "What is the slope of the line through (2, 3) and (6, 11)?";
const HL = `
    <div class="win" style="left:24px;top:44px;width:652px;height:440px">
      <div class="chrome"><div class="lights"><i></i><i></i><i></i></div><div class="url">quiz.example<b>/algebra</b></div></div>
      <div class="qz" style="left:0;top:40px;right:0;bottom:0;padding:26px 28px"><div style="width:350px">
        <div class="pg-eb" style="color:#6b4fd8">QUESTION 3 OF 10</div>
        <div class="qz-q" style="margin-top:12px"><span style="background:#b4d5fe">${Q}</span></div>
        <div style="margin-top:16px">${["1/2", "2", "4", "8"].map((c, i) => i === 1
          ? `<div class="qz-ch" style="border-color:#6b4fd8;background:#f3f0fd"><i style="border-color:#6b4fd8"><b style="transform:scale(1)"></b></i>${c}</div>`
          : `<div class="qz-ch"><i><b></b></i>${c}</div>`).join("")}</div></div>
      </div>
    </div>
    <div class="nb" style="left:420px;top:112px;width:236px;opacity:1">
      <div class="nb-head"><i></i>Nook<svg class="ic x"><use href="#i-x"></use></svg></div>
      <div class="nb-body">
        <div class="nb-an" style="position:relative"><div class="nb-label">Answer</div><div class="nb-value">2</div><div class="nb-why">Slope = (11 − 3) ÷ (6 − 2) = 8 ÷ 4 = 2.</div><div class="nb-actions"><span class="nb-btn done"><svg class="ic"><use href="#i-check"></use></svg><span>Filled</span></span><span class="nb-btn"><svg class="ic"><use href="#i-copy"></use></svg>Copy</span></div><div class="nb-note">Filled in. Check it, then submit.</div></div>
      </div>
    </div>`;

const SITES_A = [["Khan Academy", "4x^3cos(x^4)"], ["IXL", "12/5"], ["DeltaMath", "x=-3"], ["MathXL", "sqrt(2)"], ["Google Forms", "B) 3"], ["Canvas", "True"]];
const SITES_B = [["Quizlet", "mitochondria"], ["Quizizz", "C"], ["Kahoot!", "Blue"], ["Blooket", "1945"], ["Any website", "copied"], ["Your worksheet", "x = 7"]];
// same brand lockups as site.js
const LOGO = {
  "Khan Academy": ["khan-academy.svg"], IXL: ["ixl.svg", 1], DeltaMath: ["deltamath.svg"], MathXL: ["pearson.svg"],
  "Google Forms": ["google-forms.svg"], Canvas: ["canvas.svg"], Quizlet: ["quizlet.svg"], Quizizz: ["quizizz.png", 1],
  "Kahoot!": ["kahoot.svg"], Blooket: ["blooket.svg", 1],
};
const GENERIC = {
  "Any website": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"></path></svg>',
  "Your worksheet": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4M9 12h6M9 16h6"></path></svg>',
};
const lockup = (name) => {
  const l = LOGO[name];
  if (!l) return `<span class="lg lg-generic">${GENERIC[name] || ""}${name}</span>`;
  const slug = l[0].split(".")[0];
  return l[1] ? `<span class="lg lg-word lg-${slug}"><img src="assets/logos/${l[0]}" alt="${name}" /></span>`
    : `<span class="lg lg-${slug}"><img src="assets/logos/${l[0]}" alt="" />${name}</span>`;
};
const track = (list) => { const h = list.map(([n, v]) => `<div class="site">${lockup(n)}<code>${v}</code></div>`).join(""); return h + h; };

sub('<div class="stage" id="hero-stage"></div>', `<div class="stage" id="hero-stage">${HERO_STAGE}</div>`);
b = b.replace(/<div class="ss"><b>0(\d)<\/b>/g, (m, n) => `<div class="ss${n === "4" ? " on" : ""}"><b>0${n}</b>`).replace(/<i class="bar"><\/i>/g, '<i class="bar" style="transform:scaleX(1)"></i>');
sub('<div class="mini" id="mini"></div>', `<div class="mini" id="mini">${MINI}</div>`);
sub('<button class="step on">', '<button class="step">');
sub('<button class="step"><i class="prog"></i><span class="n">2</span>', '<button class="step on"><i class="prog" style="transform:scaleX(0.6)"></i><span class="n">2</span>');
sub('<div class="mini" id="hl-mini"></div>', `<div class="mini" id="hl-mini">${HL}</div>`);
sub('<div class="track" id="track-a"></div>', `<div class="track" id="track-a">${track(SITES_A)}</div>`);
sub('<div class="track rev" id="track-b"></div>', `<div class="track rev" id="track-b">${track(SITES_B)}</div>`);
sub('<div class="fmt-top" id="fmt-tabs"></div>', `<div class="fmt-top" id="fmt-tabs">${["Khan Academy", "Google Forms", "IXL", "Quizlet"].map((n, i) => { const l = LOGO[n]; return `<span class="tab${i ? "" : " on"}">${l[1] ? `<img src="assets/logos/${l[0]}" alt="${n}" />` : `<img src="assets/logos/${l[0]}" alt="" />${n}`}</span>`; }).join("")}</div>`);
sub('<span class="val" id="fmt-val"><span></span></span>', `<span class="val" id="fmt-val"><span>${ANSWER}</span></span>`);
sub('<video id="tour" preload="none" playsinline poster="assets/nook-tour-poster-v2.jpg" src="assets/nook-tour.mp4"></video>', '<img src="assets/nook-tour-poster-v2.jpg" alt="Watch Nook in 38 seconds" style="width:100%;height:100%;object-fit:cover" />');
sub('<div class="fv-copy">', '<div class="fv-copy go">');
sub('<div class="v-copy" id="vcopy">', '<div class="v-copy go" id="vcopy">');
sub('<div class="qa"><button>Is Nook really free?<span class="pm"></span></button><div class="ans">', '<div class="qa open"><button aria-expanded="true">Is Nook really free?<span class="pm"></span></button><div class="ans" style="height:auto">');
// the canvas element becomes a fixed set of twinkling stars (no script on an artboard)
let stars = "";
for (let i = 0; i < 34; i++) {
  const x = ((i * 37.7) % 97) + 1.5, y = 8 + ((i * 23.3) % 84), s = 2 + (i % 4);
  stars += `<i class="spk${i % 5 === 0 ? " big" : ""}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:${s}px;height:${s}px;animation-delay:-${((i * 0.73) % 4).toFixed(2)}s"></i>`;
}
sub('<canvas class="sparkles" id="sparkles"></canvas>', `<div class="sparkles" aria-hidden="true">${stars}</div>`);
// links, reveal markers, data attributes
b = b.replace(/ data-store href="#"/g, ` href="${STORE}" target="_blank" rel="noopener"`)
  .replace(/ data-(hero|reveal)/g, "")
  .replace(/ style="--d:\d+ms"/g, "")
  .replace(/style="margin-top:6px;--d:\d+ms"/g, 'style="margin-top:6px"')
  .replace(/ data-depth="[\d.]+"/g, "").replace(/ data-mx="[\d.]+"/g, "")
  .replace(/<!--[\s\S]*?-->/g, "");
// void elements closed for the dc parser
b = b.replace(/<(img|br)([^>]*?)\s*\/?>/g, (m, t, a) => `<${t}${a} />`);

// ——— CSS for the snapshot ———
css = css.replace(/\.sky::after \{[\s\S]*?\n\}\n/, "") // grain used a data: URI
  .replace(/\[data-hero\], \[data-reveal\] \{[^\n]*\n\[data-hero\]\.in, \[data-reveal\]\.in \{[^\n]*\n/, "")
  .replace(/^html \{[^\n]*\n/m, "")
  .replace(/^body \{\n[\s\S]*?\n\}\n/m, "");
css += `
/* ——— canvas snapshot: fixed scales for the 1440 and 390 artboards, stars in place of the canvas ——— */
.page { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 var(--font); -webkit-font-smoothing: antialiased; overflow-x: hidden; }
.page .nav { position: absolute; }
.page .tilt { transform: none; }
.page .intro { display: none; }
.page .track { animation: marquee 50s linear infinite; }
.page .track.rev { animation-direction: reverse; animation-duration: 58s; }
.page .stage { transform: scale(1.0339); }
.page .how-vis .mini { transform: scale(1.0424); }
.page .hl-vis .mini { transform: scale(0.9566); }
.resp { white-space: normal; }
.spk { position: absolute; border-radius: 50%; background: #fff; box-shadow: 0 0 6px 2px rgba(255,255,255,0.7); animation: twinkle 3.6s ease-in-out infinite; }
.spk.big { border-radius: 1px; transform: rotate(45deg); }
@keyframes twinkle { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
@media (max-width: 1239px) and (min-width: 761px) { .page .stage { transform: scale(0.8); } .page .how-vis .mini, .page .hl-vis .mini { transform: scale(0.8); } }
@media (max-width: 760px) {
  .page .stage { transform: scale(0.6071) translate(-520px, -30px); }
  .page .how-vis .mini { transform: scale(0.571); }
  .page .hl-vis .mini { transform: scale(0.5057); }
}
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet" />`;
const pageMarkup = (bb) => `<div class="page" style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0c1a30; background: #f5f9fe">${bb}</div>`;

const withBlobs = (s) => {
  for (const [k, v] of Object.entries(BLOB)) s = s.split(`"${k}"`).join(`"${v}"`);
  return s;
};

const dc = (title, w, h) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${FONTS}
<style>
body{margin:0}
a{color:inherit;text-decoration:none}a:hover{color:inherit}
${css}
</style>
</helmet>
${withBlobs(pageMarkup(b))}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
`;

mkdirSync(join(outRoot, "project"), { recursive: true });
writeFileSync(join(outRoot, "project", "Main.dc.html"), dc("Nook website, desktop", 1440, +hDesk));
writeFileSync(join(outRoot, "project", "Mobile.dc.html"), dc("Nook website, mobile", 390, +hMob));
// local preview with the site's own asset paths, for measuring page height
writeFileSync(join(outRoot, "preview.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="file://${SITE.replace(/ /g, "%20")}/">${FONTS}<style>body{margin:0}a{color:inherit;text-decoration:none}\n${css}</style></head><body>${pageMarkup(b)}</body></html>`);
const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
writeFileSync(join(outRoot, "project", "canvas.json"), JSON.stringify({
  v: 3, createdOnFiles: { v: 1, at: now }, title: "Nook website", launch: { view: "canvas" }, pages: [],
  boards: {
    "Main.dc.html": { x: 0, y: 0, w: 1440, h: +hDesk, title: "Landing page, desktop 1440", expand: "fill" },
    "Mobile.dc.html": { x: 1520, y: 0, w: 390, h: +hMob, title: "Landing page, mobile 390", expand: "fill" },
  },
  order: ["Main.dc.html", "Mobile.dc.html"], notes: {}, designSystems: [],
}, null, 2));
console.log("built", outRoot);
