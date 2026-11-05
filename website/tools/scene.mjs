// Draws the hero landscape layers (original art, no source images) into assets/scene/*.svg.
// Run: node tools/scene.mjs   (from the repo root)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "scene");
mkdirSync(OUT, { recursive: true });
const W = 1600, H = 700;

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = (n) => Math.round(n * 10) / 10;
const lerpI = (a, b, k) => a + (b - a) * k;
const pts = (a) => a.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

/** Jagged line between two points by midpoint displacement. */
function jag(a, b, rough, r, depth = 5) {
  if (depth === 0) return [a, b];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const m = [(a[0] + b[0]) / 2 + (r() - 0.5) * len * rough * 0.3, (a[1] + b[1]) / 2 + (r() - 0.5) * len * rough * 0.6];
  const L = jag(a, m, rough * 0.8, r, depth - 1), R = jag(m, b, rough * 0.8, r, depth - 1);
  return [...L.slice(0, -1), ...R];
}

/**
 * A range of peaks. keys = [[x, y], ...] alternating valley, peak, valley, ...
 * Lit from the upper left: each peak's right flank gets a shade facet bounded by a crease.
 */
function range({ keys, base, rough, seed, lit, shade, crease, snow, mist, id }) {
  const r = rng(seed);
  let ridge = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const seg = jag(keys[i], keys[i + 1], rough, r);
    ridge = ridge.concat(i ? seg.slice(1) : seg);
  }
  const silhouette = [[keys[0][0], base], ...ridge, [keys[keys.length - 1][0], base]];
  let facets = "", snows = "";
  for (let i = 1; i < keys.length - 1; i += 2) {
    const P = keys[i], VR = keys[i + 1], VL = keys[i - 1];
    const iP = ridge.findIndex((p) => p[0] === P[0] && p[1] === P[1]);
    const iV = ridge.findIndex((p) => p[0] === VR[0] && p[1] === VR[1]);
    const flank = ridge.slice(iP, iV + 1);
    const footX = P[0] + (VR[0] - P[0]) * (0.18 + r() * 0.2);
    const creaseLine = jag(P, [footX, base], rough * 0.5, r, 4);
    // shade facet: right flank, down the crease
    const toe = jag(VR, [VR[0] - (VR[0] - footX) * 0.55, base], rough * 0.4, r, 3);
    facets += `<polygon points="${pts([...flank, ...toe.slice(1), ...creaseLine.slice().reverse()])}" fill="url(#${id}-sh)"/>`;
    // a second, thinner facet on the lit side for some structure
    // gullies: thin lines running down both flanks
    for (let g = 0; g < 4; g++) {
      const side = g % 2 ? VR : VL;
      const k = 0.2 + r() * 0.5;
      const top = ridge[Math.round(lerpI(iP, ridge.indexOf(side), k))] || P;
      const len = (base - top[1]) * (0.25 + r() * 0.35);
      const line = jag(top, [top[0] + (side[0] - P[0]) * 0.12, top[1] + len], 0.5, r, 3);
      facets += `<polyline points="${pts(line)}" fill="none" stroke="${crease}" stroke-width="${f(1 + r() * 1.4)}" stroke-linecap="round" opacity="0.45"/>`;
    }
    // snow cap on the peak
    if (snow) {
      const depth = (base - P[1]) * (0.09 + r() * 0.06);
      const left = ridge.slice(0, iP + 1).reverse().find((p) => p[1] > P[1] + depth) || VL;
      const right = ridge.slice(iP).find((p) => p[1] > P[1] + depth) || VR;
      const iL = ridge.indexOf(left), iR = ridge.indexOf(right);
      const cap = ridge.slice(iL, iR + 1);
      const under = [right];
      const n = Math.max(3, Math.round(Math.abs(right[0] - left[0]) / 14));
      for (let j = 1; j < n; j++) {
        const x = right[0] + (left[0] - right[0]) * ((j + (r() - 0.5) * 0.6) / n);
        const yb = right[1] + (left[1] - right[1]) * (j / n);
        under.push([x, yb + (j % 2 ? depth * (0.15 + r() * r() * 0.9) : depth * 0.05 * r())]);
      }
      under.push(left);
      snows += `<polygon points="${pts([...cap, ...under.slice(1, -1)])}" fill="${snow}"/>`;
    }
  }
  return `
  <defs>
    <linearGradient id="${id}-lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lit[0]}"/><stop offset="1" stop-color="${lit[1]}"/></linearGradient>
    <linearGradient id="${id}-sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade[0]}"/><stop offset="0.45" stop-color="${shade[1]}" stop-opacity="0.85"/><stop offset="1" stop-color="${shade[1]}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="${mist[0]}" stop-color="${mist[2]}" stop-opacity="0"/><stop offset="1" stop-color="${mist[2]}" stop-opacity="${mist[1]}"/></linearGradient>
    <clipPath id="${id}-clip"><polygon points="${pts(silhouette)}"/></clipPath>
  </defs>
  <polygon points="${pts(silhouette)}" fill="url(#${id}-lit)"/>
  <g clip-path="url(#${id}-clip)">${facets}${snows}<rect x="0" y="0" width="${W}" height="${base}" fill="url(#${id}-mist)"/></g>`;
}

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">${body}</svg>\n`;

// far range: pale, low contrast, wide
const far = range({
  id: "far", seed: 11, base: H, rough: 0.55,
  keys: [[-40, 430], [90, 300], [210, 380], [330, 250], [470, 360], [590, 290], [700, 390], [800, 330], [900, 395], [1010, 285], [1130, 370], [1250, 240], [1390, 350], [1500, 280], [1640, 400]],
  lit: ["#eef5fe", "#d7e6f8"], shade: ["#c3d6f1", "#cddff5"], crease: "#b4cbec", snow: "#f8fbff", mist: [0.3, 1, "#e3eefb"],
});
writeFileSync(join(OUT, "far.svg"), svg(far));

// mid range: snowy peaks either side, lower saddle in the middle
const mid = range({
  id: "mid", seed: 7, base: H, rough: 0.5,
  keys: [[-40, 470], [60, 330], [170, 420], [300, 230], [440, 400], [540, 330], [650, 470], [760, 455], [860, 480], [960, 450], [1060, 470], [1160, 320], [1270, 410], [1380, 215], [1520, 380], [1600, 300], [1660, 420]],
  lit: ["#f6f9ff", "#b9cff0"], shade: ["#9db8e6", "#a8c1ea"], crease: "#86a4dc", snow: "#ffffff", mist: [0.35, 0.95, "#d6e6fa"],
});
writeFileSync(join(OUT, "mid.svg"), svg(mid));

// near cliffs: tall masses framing both sides
const nearL = range({
  id: "nl", seed: 23, base: H, rough: 0.42,
  keys: [[-80, 260], [90, 120], [260, 330], [350, 270], [520, 560], [560, 545], [660, 720]],
  lit: ["#dfe9fb", "#7e9fd6"], shade: ["#6f8fcf", "#5876b8"], crease: "#4f6db0", snow: "#ffffff", mist: [0.55, 0.9, "#c9dcf6"],
});
const nearR = range({
  id: "nr", seed: 31, base: H, rough: 0.42,
  keys: [[940, 720], [1050, 540], [1110, 575], [1250, 290], [1330, 340], [1480, 100], [1700, 300]],
  lit: ["#dfe9fb", "#7e9fd6"], shade: ["#6f8fcf", "#5876b8"], crease: "#4f6db0", snow: "#ffffff", mist: [0.55, 0.9, "#c9dcf6"],
});
writeFileSync(join(OUT, "near.svg"), svg(nearL + nearR));

// clouds: soft puffs made of overlapping circles, blurred, with a blue underside
function clouds({ seed, rows, id, blur, tint }) {
  const r = rng(seed);
  let g = "";
  for (const row of rows) {
    for (let x = row.x0; x < row.x1; x += row.step * (0.6 + r() * 0.6)) {
      const rad = row.r * (0.6 + r() * 0.8);
      const y = row.y + (r() - 0.5) * row.jit;
      g += `<circle cx="${f(x)}" cy="${f(y + rad * 0.18)}" r="${f(rad)}" fill="${tint}"/>`;
      g += `<circle cx="${f(x - rad * 0.08)}" cy="${f(y)}" r="${f(rad * 0.94)}" fill="url(#${id}-g)"/>`;
    }
  }
  return `<defs>
    <filter id="${id}-b" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter>
    <radialGradient id="${id}-g" cx="0.42" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.7" stop-color="#f7fbff"/><stop offset="1" stop-color="#e4eefb"/></radialGradient>
  </defs><g filter="url(#${id}-b)">${g}</g>`;
}
writeFileSync(join(OUT, "clouds-back.svg"), svg(clouds({
  id: "cb", seed: 5, blur: 6, tint: "#cfe0f7",
  rows: [{ x0: 380, x1: 1240, step: 70, r: 70, y: 560, jit: 50 }, { x0: -40, x1: 1660, step: 90, r: 80, y: 650, jit: 40 }],
})));
writeFileSync(join(OUT, "clouds-front.svg"), svg(
  `<defs><linearGradient id="cf-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.66" stop-color="#f5f9fe" stop-opacity="0"/><stop offset="0.93" stop-color="#f5f9fe"/></linearGradient></defs>` +
  clouds({
    id: "cf", seed: 9, blur: 4, tint: "#d3e3f8",
    rows: [{ x0: -60, x1: 520, step: 80, r: 90, y: 620, jit: 60 }, { x0: 1080, x1: 1680, step: 80, r: 90, y: 610, jit: 60 }, { x0: -60, x1: 1680, step: 100, r: 100, y: 700, jit: 30 }],
  }) + `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#cf-fade)"/>`,
));
console.log("wrote", OUT);
