/* Nook website v2: sky hero (parallax, sparkles), scroll effects, and the live product demos.
   Each demo is a pure function of time, seek(t), driven by a loop that only runs while it's on screen. */
(() => {
  const STORE = "https://chromewebstore.google.com/detail/nook-ai-answering-sidebar/fpoojjlpjldmeamnjhbmkkokjlfhdelc";
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ——— math ———
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    outQuint: (x) => 1 - Math.pow(1 - x, 5),
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    inOutQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
    expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  };
  /** Damped spring from 0 to 1, s seconds after it starts. */
  const spring = (s, f = 2.4, d = 0.5) => (s <= 0 ? 0 : 1 - Math.exp(-d * 2 * Math.PI * f * s) * Math.cos(2 * Math.PI * f * Math.sqrt(1 - d * d) * s));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(k)))).join(",")})`; };
  function set(el, { x = 0, y = 0, s = 1, r = 0, o = 1, blur = 0 } = {}) {
    el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg) scale(${s})`;
    el.style.opacity = o;
    el.style.filter = blur > 0.05 ? `blur(${blur}px)` : "";
  }
  const cursorSVG = `<svg viewBox="0 0 24 24"><path d="M5 3l14 8.2-6.3 1.4L9.6 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

  /** Runs seek(t) on a loop of `dur` seconds while `target` is visible. */
  function runLoop(target, dur, seek) {
    let t = 0, last = null, on = false;
    const tick = (now) => {
      if (!on) { last = null; return; }
      if (last != null) t = (t + Math.min(0.1, (now - last) / 1000)) % dur;
      last = now;
      seek(t);
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => {
      const was = on;
      on = e.isIntersecting;
      if (on && !was) requestAnimationFrame(tick);
    }, { threshold: 0.12 }).observe(target);
    seek(REDUCED ? dur * 0.7 : 0);
    return { restart() { t = 0; }, get t() { return t; } };
  }
  /** Keeps a fixed-size scene scaled to its frame. */
  function fit(frame, scene, w, h, mobile) {
    const apply = () => {
      const fw = frame.clientWidth, fh = frame.clientHeight;
      const m = mobile && mobile(fw);
      if (m) { scene.style.transform = `scale(${m.s}) translate(${m.x}px, ${m.y}px)`; return; }
      const s = Math.min(fw / w, fh / h);
      scene.style.transform = `translate(${(fw - w * s) / 2}px, ${(fh - h * s) / 2}px) scale(${s})`;
    };
    new ResizeObserver(apply).observe(frame);
    apply();
  }

  // ——— momentum scrolling (Lenis), off for reduced motion; anchors still land under the nav ———
  let lenis = null;
  if (!REDUCED && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.4 });
    const lraf = (t) => { lenis.raf(t); requestAnimationFrame(lraf); };
    requestAnimationFrame(lraf);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || !lenis) return;
    const id = a.getAttribute("href");
    const target = id === "#top" || id === "#" ? 0 : document.querySelector(id);
    if (target == null) return;
    e.preventDefault();
    lenis.scrollTo(target, { duration: 1.4 }); // Lenis honours html scroll-padding-top (90px), so anchors clear the nav
    history.replaceState(null, "", id);
  });

  // Views and the live count come from /assets/track.js (loaded on every page); this page adds clicks.
  const track = (kind, label) => window.nookTrack?.(kind, label);

  // ——— store links: tagged by where they sit (the Web Store's stats show installs by utm_content) and counted ———
  $$("[data-store]").forEach((a) => {
    const where = a.closest("nav") ? "nav" : a.closest("footer") ? "footer" : a.closest("section[id]")?.id || "hero";
    a.href = `${STORE}?utm_source=trynook.org&utm_medium=website&utm_content=${where}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.addEventListener("click", () => track("click", where));
  });

  // ——— the hero comes in once fonts are ready ———
  const heroIn = () => {
    document.documentElement.classList.add("ready");
    $$("[data-hero]").forEach((el, i) => { el.style.setProperty("--d", `${80 + i * 110}ms`); el.classList.add("in"); });
  };
  // The intro (pure CSS, about 2s) plays over the hero; the hero starts coming in as it lifts away.
  // Fonts get at most 700ms, so a slow font never holds the page.
  const intro = $("#intro");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (REDUCED) { heroIn(); if (intro) intro.remove(); }
  else {
    Promise.all([Promise.race([document.fonts.ready, wait(700)]), wait(intro ? 1270 : 0)]).then(() => requestAnimationFrame(heroIn));
    if (intro) setTimeout(() => intro.remove(), 2100);
  }

  // ——— hero landscape: layers drift with scroll and pointer ———
  const heroEl = $("#hero");
  const layers = $$("#scene .ly").map((el) => ({ el, d: +el.dataset.depth || 0, m: +el.dataset.mx || 0 }));
  const finalEl = $("#final");
  const finalLayers = $$(".final-scene .ly").map((el) => ({ el, d: +el.dataset.depth || 0 }));
  let mx = 0, my = 0, tmx = 0, tmy = 0, plxRaf = 0;
  const parallax = () => {
    plxRaf = 0;
    mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
    const sy = Math.min(scrollY, heroEl.offsetHeight) * (innerWidth < 760 ? 0.35 : 1);
    for (const L of layers) L.el.style.transform = `translate3d(${(-mx * L.m).toFixed(2)}px, ${(sy * L.d - my * L.m * 0.4).toFixed(2)}px, 0)`;
    const fr = finalEl.getBoundingClientRect();
    if (fr.top < innerHeight && fr.bottom > 0) {
      const k = fr.bottom - innerHeight; // 0 once the section's bottom meets the viewport's
      for (const L of finalLayers) L.el.style.transform = `translate3d(0, ${(k * L.d).toFixed(2)}px, 0)`;
    }
    if (Math.abs(tmx - mx) > 0.001 || Math.abs(tmy - my) > 0.001) kick();
  };
  const kick = () => { if (!plxRaf) plxRaf = requestAnimationFrame(parallax); };
  if (!REDUCED) {
    addEventListener("scroll", kick, { passive: true });
    heroEl.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; tmx = e.clientX / innerWidth - 0.5; tmy = e.clientY / innerHeight - 0.5; kick(); });
    heroEl.addEventListener("pointerleave", () => { tmx = 0; tmy = 0; kick(); });
    parallax();
  }

  // ——— sparkles: tiny twinkling stars drifting up through the light ———
  const cv = $("#sparkles"), cx = cv.getContext("2d");
  let sparks = [], sW = 0, sH = 0, sOn = false, sLast = 0;
  const DPR = Math.min(2, devicePixelRatio || 1);
  const seedSparks = () => {
    sW = cv.clientWidth; sH = cv.clientHeight;
    cv.width = Math.round(sW * DPR); cv.height = Math.round(sH * DPR);
    const n = Math.round(Math.min(90, sW / 16));
    sparks = Array.from({ length: n }, () => ({
      x: Math.random() * sW, y: sH * (0.5 + Math.random() * 0.5), r: 0.6 + Math.random() * 1.8,
      v: 4 + Math.random() * 12, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.8, star: Math.random() < 0.22,
    }));
  };
  const drawSparks = (now) => {
    const dt = Math.min(0.05, (now - (sLast || now)) / 1000); sLast = now;
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.clearRect(0, 0, sW, sH);
    const t = now / 1000;
    for (const p of sparks) {
      p.y -= p.v * dt; p.x += Math.sin(t * 0.5 + p.ph) * 0.15;
      if (p.y < sH * 0.42) { p.y = sH * (0.9 + Math.random() * 0.1); p.x = Math.random() * sW; }
      const fade = Math.min(1, (p.y - sH * 0.42) / (sH * 0.15));
      const a = (0.35 + 0.65 * Math.abs(Math.sin(t * p.sp + p.ph))) * fade;
      const x = p.x - mx * 30, y = p.y;
      cx.globalAlpha = a;
      if (p.star) {
        const s = p.r * 3.2;
        cx.fillStyle = "#fff";
        cx.beginPath();
        cx.moveTo(x, y - s); cx.quadraticCurveTo(x, y, x + s, y); cx.quadraticCurveTo(x, y, x, y + s); cx.quadraticCurveTo(x, y, x - s, y); cx.quadraticCurveTo(x, y, x, y - s);
        cx.fill();
      } else {
        const g = cx.createRadialGradient(x, y, 0, x, y, p.r * 3);
        g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
        cx.fillStyle = g;
        cx.beginPath(); cx.arc(x, y, p.r * 3, 0, 6.283); cx.fill();
      }
    }
    if (sOn) requestAnimationFrame(drawSparks);
  };
  seedSparks();
  addEventListener("resize", () => { seedSparks(); if (REDUCED) drawSparks(performance.now()); });
  if (REDUCED) drawSparks(performance.now());
  else new IntersectionObserver(([e]) => { const was = sOn; sOn = e.isIntersecting; if (sOn && !was) { sLast = 0; requestAnimationFrame(drawSparks); } }).observe(heroEl);

  // ——— nav ———
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ——— reveal on scroll ———
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  $$("[data-reveal]").forEach((el) => io.observe(el));

  // ——— rotating word in the headline ———
  const rot = $("#rot");
  const words = $$("span", rot);
  let wi = 0;
  const sizeRot = () => { rot.style.width = `${words[wi].getBoundingClientRect().width}px`; };
  document.fonts.ready.then(sizeRot);
  addEventListener("resize", sizeRot);
  if (!REDUCED) setInterval(() => {
    const cur = words[wi];
    wi = (wi + 1) % words.length;
    const next = words[wi];
    cur.classList.remove("on"); cur.classList.add("out");
    next.classList.remove("out"); next.classList.add("on");
    sizeRot();
    setTimeout(() => cur.classList.remove("out"), 700);
  }, 2600);

  // ——— statement: each word lights up as it scrolls past ———
  const st = $("#statement");
  st.innerHTML = st.textContent.split(" ").map((w) => `<span class="sw-word">${w}</span>`).join(" ");
  const stWords = $$(".sw-word", st);
  const lightWords = () => {
    const r = st.getBoundingClientRect(), vh = innerHeight;
    const k = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35));
    stWords.forEach((w, i) => { w.style.opacity = 0.16 + 0.84 * clamp(k * stWords.length * 1.1 - i); });
  };
  if (!REDUCED) { addEventListener("scroll", lightWords, { passive: true }); lightWords(); }

  // ———————————————————————————————————————————————————————————————
  // Hero demo: the full flow in the real Nook sidebar
  // ———————————————————————————————————————————————————————————————
  const PAGE = `
    <div class="pg-top"><i></i>Practice<span>AP Calculus · Unit 3</span></div>
    <div class="pg-body">
      <div class="pg-eb">CHAIN RULE</div>
      <div class="pg-h">Derivatives of composite functions</div>
      <div class="pg-q">Let <i>F</i>(<i>x</i>) = sin(<i>x</i><sup>4</sup>). Find <i>F</i>′(<i>x</i>).</div>
      <div class="pg-row"><span><i>F</i>′(<i>x</i>) =</span><div class="pg-in"><span class="typed"></span><span class="caret"></span></div></div>
      <div class="pg-hint">Stuck? <b>Use a hint.</b></div>
    </div>
    <div class="pg-foot"><i class="d f"></i><i class="d f"></i><i class="d"></i><i class="d"></i><span class="t">Do 4 problems</span>
      <div class="pg-good"><i><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i>Nice work!</div>
      <div class="pg-check"><span class="c0">Check</span><span class="c1" style="opacity:0">Next</span></div>
    </div>`;
  const RESP = "Chain rule: sin(u)′ = cos(u)·u′, and here u′ = 4x³.".split(" ");
  const ANSWER = "4x^3cos(x^4)";
  const WIN = { x: 70, y: 34, w: 980, h: 620 }, PAGE_W = 620, PANEL_W = WIN.w - PAGE_W;

  const hs = $("#hero-stage");
  hs.innerHTML = `
    <div class="win" style="left:${WIN.x}px;top:${WIN.y}px;width:${WIN.w}px;height:${WIN.h}px">
      <div class="chrome"><div class="lights"><i></i><i></i><i></i></div><div class="url">practice.example<b>/calculus/chain-rule</b></div><div class="ext"><svg viewBox="0 0 120 120"><use href="#logo"/></svg></div></div>
      <div class="pg" id="h-page" style="width:${PAGE_W}px">${PAGE}<div class="vf"><i></i><i></i><i></i><i></i></div><div class="pg-flash"></div></div>
      <div class="panel" style="width:${PANEL_W}px">
        <div class="tb" id="h-tb">
          <div class="tb-top"><div class="wm"><i></i>Nook</div><div class="tb-icons"><svg class="ic"><use href="#i-help"/></svg><svg class="ic"><use href="#i-reload"/></svg><svg class="ic"><use href="#i-user"/></svg></div></div>
          <div class="pbtn" id="h-pbtn"><svg class="ic"><use href="#i-spark"/></svg><span>What's the answer?</span><i class="spin"></i><i class="rip"></i></div>
          <div class="hk">Hotkey <span class="k">⌥⇧A</span> Alt+Shift+A on Windows</div>
          <div class="pills"><div class="pl"><svg class="ic"><use href="#i-camera"/></svg>Screenshot</div><div class="pl">Auto fill<span class="sw on"><i></i></span></div><div class="pl dim">Auto copy<span class="sw"><i></i></span></div></div>
          <div class="status" id="h-status"><i></i><span class="s0"></span><span class="s1"></span></div>
        </div>
        <div class="acard" id="h-card"><span class="v">${ANSWER}</span><span class="a"><svg class="ic"><use href="#i-fill"/></svg>Fill</span><span class="a"><svg class="ic"><use href="#i-copy"/></svg>Copy</span></div>
        <div class="gem" id="h-gem">
          <div class="gem-head"><div class="bars"></div><span>Gemini</span><span class="m">Flash ▾</span><div class="av"></div></div>
          <div class="hi" id="h-hi" style="top:150px"><svg viewBox="0 0 24 24"><use href="#i-spark" fill="url(#gemgrad)"/></svg>Hi, let's get into it</div>
          <div class="ubub" id="h-ubub" style="top:52px"><div class="th" id="h-thumb"></div><p>What's the answer? Format it for this site.</p></div>
          <svg class="gsp" id="h-gsp" viewBox="0 0 24 24" style="top:192px"><use href="#i-spark" fill="url(#gemgrad)"/></svg>
          <div class="resp" id="h-resp" style="top:190px">${RESP.map((w) => `<span class="w">${w} </span>`).join("")}<div class="ans">ANSWER: <code><b></b><span>${ANSWER}</span></code></div></div>
          <div class="ginput">+&nbsp;&nbsp;&nbsp;Ask Gemini</div>
        </div>
      </div>
    </div>
    <div class="shot" id="h-shot" style="width:${PAGE_W}px;height:${WIN.h - 40}px"><div class="pg" style="position:relative;top:0;width:${PAGE_W}px;height:${WIN.h - 40}px">${PAGE}</div></div>
    <div class="ring" id="h-ring"></div>
    <div class="cur" id="h-cur">${cursorSVG}</div>`;
  $("#h-thumb").innerHTML = `<div class="pg" style="top:0;width:${PAGE_W}px;height:${WIN.h - 40}px;transform:scale(${154 / PAGE_W});transform-origin:0 0">${PAGE}</div>`;

  const H = {
    page: $("#h-page"), pbtn: $("#h-pbtn"), status: $("#h-status"), card: $("#h-card"), gem: $("#h-gem"), hi: $("#h-hi"),
    ubub: $("#h-ubub"), gsp: $("#h-gsp"), resp: $("#h-resp"), shot: $("#h-shot"), ring: $("#h-ring"), cur: $("#h-cur"),
    words: $$("#h-resp .w"), ans: $("#h-resp .ans"), tb: $("#h-tb"),
  };
  H.typed = $(".typed", H.page); H.input = $(".pg-in", H.page); H.caret = $(".caret", H.page);
  H.good = $(".pg-good", H.page); H.check = $(".pg-check", H.page); H.foot = $(".pg-foot", H.page);
  H.flash = $(".pg-flash", H.page); H.vf = $(".vf", H.page); H.dot3 = $$(".pg-foot .d", H.page)[2];
  H.spin = $(".spin", H.pbtn); H.rip = $(".rip", H.pbtn);

  const HT = { click: 1.6, read: 1.66, capture: 2.15, flash: 2.45, fly: 2.7, land: 3.35, think: 3.55, stream: 4.25, hi: 6.2, card: 6.55, fill: 7.0, type: 7.2, filled: 8.0, cur2: 8.5, check: 9.4, reset: 12.7, dur: 13.6 };
  const STATUS = [
    { t: HT.read, text: "Reading the page…" }, { t: HT.capture, text: "Capturing the screen…" },
    { t: HT.land, text: "Asking Gemini…" }, { t: HT.fill, text: "Filling in the answer…" },
    { t: HT.filled, text: "Filled in. Check it, then press Check.", ok: true },
  ];
  const SEGS = [[0, HT.capture], [HT.capture, HT.land], [HT.land, HT.card], [HT.card, HT.check + 0.1]];
  const ssEls = $$("#hero-steps .ss");
  // geometry, in stage pixels
  const P = {}; // filled by measure()
  const tiltEl = $("#hero-tilt"), tiltWrap = $("#stage-wrap");
  const measure = () => {
    const prevT = tiltEl.style.transform;
    tiltEl.style.transform = "none"; // measure the flat layout, not the 3D projection
    const base = hs.getBoundingClientRect(), s = base.width / 1120;
    const at = (el, ax = 0.5, ay = 0.5) => { const r = el.getBoundingClientRect(); return { x: (r.left - base.left + r.width * ax) / s, y: (r.top - base.top + r.height * ay) / s, w: r.width / s, h: r.height / s }; };
    P.btn = at(H.pbtn); P.check = at(H.check); P.thumb = at($("#h-thumb"), 0, 0); P.page = { x: WIN.x, y: WIN.y + 40 };
    P.tbH = H.tb.offsetHeight;
    tiltEl.style.transform = prevT;
  };

  function hero(t) {
    const reset = E.inOut(prog(t, HT.reset, HT.dur - 0.15)), keep = 1 - reset;

    // cursor: glide to the button, click, drift off; later click Check
    let cx, cy, co, down = false;
    if (t < HT.cur2 - 0.3) {
      const k = E.inOutQuint(prog(t, 0.45, HT.click - 0.06));
      cx = lerp(1010, P.btn.x + 6, k) + Math.sin(k * Math.PI) * 60;
      cy = lerp(640, P.btn.y + 2, k) + Math.sin(k * Math.PI) * 20;
      const away = E.inOut(prog(t, HT.click + 0.25, HT.click + 1.0));
      cx += away * 60; cy += away * 120;
      co = prog(t, 0.35, 0.6) * (1 - prog(t, HT.click + 0.6, HT.click + 1.0));
      down = t >= HT.click - 0.03 && t < HT.click + 0.1;
    } else {
      const k = E.inOutQuint(prog(t, HT.cur2, HT.check - 0.06));
      cx = lerp(P.btn.x - 120, P.check.x + 8, k) + Math.sin(k * Math.PI) * -50;
      cy = lerp(P.btn.y + 330, P.check.y + 4, k) + Math.sin(k * Math.PI) * -40;
      co = prog(t, HT.cur2, HT.cur2 + 0.25) * keep;
      down = t >= HT.check - 0.03 && t < HT.check + 0.1;
    }
    set(H.cur, { x: cx, y: cy, s: down ? 0.85 : 1, o: co });
    const rk = Math.max(prog(t, HT.click, HT.click + 0.55), 0) ;
    const rk2 = prog(t, HT.check, HT.check + 0.55);
    const ring = rk > 0 && rk < 1 ? { k: rk, p: P.btn } : rk2 > 0 && rk2 < 1 ? { k: rk2, p: P.check } : null;
    if (ring) set(H.ring, { x: ring.p.x, y: ring.p.y, s: 0.3 + E.out(ring.k) * 1.4, o: (1 - ring.k) * 0.9 });
    else H.ring.style.opacity = 0;

    // primary button: press, busy, done
    const busy = E.out(prog(t, HT.click + 0.05, HT.click + 0.3)) * (1 - E.out(prog(t, HT.filled, HT.filled + 0.3)));
    const press = t >= HT.click - 0.02 && t < HT.click + 0.12 ? 1 : 0;
    H.pbtn.style.transform = `scale(${1 - 0.03 * press})`;
    H.pbtn.style.background = mix("#eceef2", "#1d2027", busy);
    H.pbtn.style.color = mix("#0e0f12", "#8a91a0", busy);
    H.pbtn.style.boxShadow = `inset 0 0 0 1px rgba(39,43,52,${busy})`;
    H.spin.style.opacity = busy;
    H.spin.style.transform = `rotate(${t * 520}deg)`;
    const rp = prog(t, HT.click, HT.click + 0.7);
    set(H.rip, { x: P.btn.x - (WIN.x + PAGE_W + 14), y: 20, s: E.out(rp) * 12, o: rp > 0 && rp < 1 ? 0.5 * (1 - rp) : 0 });

    // status line rolls each new message up
    let cur = null, prev = null;
    for (const s of STATUS) if (t >= s.t) { prev = cur; cur = s; }
    const s0 = $(".s0", H.status), s1 = $(".s1", H.status);
    if (cur && keep > 0) {
      const k = E.out(prog(t, cur.t, cur.t + 0.32));
      s1.textContent = cur.text; s1.style.transform = `translateY(${(1 - k) * 10}px)`; s1.style.opacity = k;
      s0.textContent = prev ? prev.text : ""; s0.style.transform = `translateY(${-k * 10}px)`; s0.style.opacity = prev ? 1 - k : 0;
      H.status.className = `status${cur.ok ? " ok" : ""}`;
      H.status.style.opacity = keep;
    } else H.status.style.opacity = 0;

    // capture: viewfinder corners close in, flash
    const vin = E.expo(prog(t, HT.capture + 0.05, HT.flash)), vout = prog(t, HT.flash + 0.05, HT.flash + 0.4);
    H.vf.style.opacity = t > HT.capture && t < HT.flash + 0.4 ? vin * (1 - vout) : 0;
    $$("i", H.vf).forEach((c, i) => { const d = (1 - vin) * 60; c.style.transform = `translate(${(i % 2 ? 1 : -1) * d}px, ${(i < 2 ? -1 : 1) * d}px)`; });
    const fl = prog(t, HT.flash, HT.flash + 0.4);
    H.flash.style.opacity = fl > 0 && fl < 1 ? Math.pow(1 - fl, 2) * 0.9 : 0;

    // the screenshot flies into Gemini
    if (t > HT.flash && t < HT.land + 0.02) {
      const lift = E.out(prog(t, HT.flash, HT.fly)), fk = E.inOut(prog(t, HT.fly, HT.land));
      const s = lerp(1 - 0.05 * lift, 154 / PAGE_W, fk);
      const x = lerp(P.page.x + 15 * lift, P.thumb.x, fk), y = lerp(P.page.y + 12 * lift, P.thumb.y, fk) - Math.sin(fk * Math.PI) * 90;
      H.shot.style.transform = `translate(${x}px, ${y}px) rotate(${Math.sin(fk * Math.PI) * -4}deg) scale(${s})`;
      H.shot.style.opacity = 1;
    } else H.shot.style.opacity = 0;

    // Gemini: greeting, bubble, thinking, answer
    const cardK = E.out(prog(t, HT.card, HT.card + 0.35)) * (1 - reset);
    H.card.style.height = `${40 * cardK}px`;
    H.card.style.opacity = cardK;
    H.card.style.transform = `scale(${0.96 + 0.04 * spring(t - HT.card, 2.6, 0.5)})`;
    H.gem.style.top = `${P.tbH + 10 + 40 * cardK + 2}px`;
    const hiO = Math.max(1 - prog(t, HT.land - 0.2, HT.land + 0.1), prog(t, HT.reset + 0.45, HT.dur));
    set(H.hi, { y: (1 - hiO) * -14, o: hiO });
    const ub = t >= HT.land ? spring(t - HT.land, 2.6, 0.5) : 0;
    set(H.ubub, { y: (1 - ub) * 8, s: 0.9 + 0.1 * ub, o: (t >= HT.land ? 1 : 0) * keep });
    const thinking = t >= HT.think;
    const pulse = t < HT.stream ? 1 + Math.sin((t - HT.think) * 9) * 0.12 : 1;
    set(H.gsp, { s: thinking ? spring(t - HT.think, 2.4, 0.45) * pulse : 0, r: thinking ? Math.min(t, HT.stream + 0.4) * 300 : 0, o: thinking ? keep : 0 });
    H.words.forEach((w, i) => {
      const k = prog(t, HT.stream + i * 0.07, HT.stream + i * 0.07 + 0.2);
      w.style.opacity = k * keep;
      w.style.filter = k < 1 ? `blur(${(1 - k) * 4}px)` : "";
      w.style.transform = `translateY(${(1 - k) * 4}px)`;
    });
    const ansStart = HT.stream + H.words.length * 0.07;
    H.ans.style.opacity = prog(t, ansStart, ansStart + 0.2) * keep;
    const hl = E.inOut(prog(t, HT.hi, HT.hi + 0.4));
    const hb = $("b", H.ans);
    hb.style.right = `${(1 - hl) * 100}%`;
    hb.style.opacity = hl > 0 ? 1 : 0;

    // auto fill types the answer into the box
    const n = t >= HT.type ? clamp(Math.floor((t - HT.type) / 0.055) + 1, 0, ANSWER.length) : 0;
    H.typed.textContent = ANSWER.slice(0, n);
    H.typed.style.opacity = keep;
    const fk = E.out(prog(t, HT.fill, HT.fill + 0.25)) * keep;
    H.input.style.borderColor = mix("#babec2", "#1865f2", fk);
    H.input.style.boxShadow = `0 0 0 ${3 * fk}px rgba(24,101,242,0.18)`;
    H.caret.style.opacity = fk > 0.5 && t < HT.check && Math.floor(t * 2.4) % 2 === 0 ? 1 : 0;
    $(".v", H.card).style.color = t > HT.type && t < HT.filled ? "#8ab4f8" : "";

    // Check, then "Nice work!"
    const g = E.out(prog(t, HT.check + 0.08, HT.check + 0.4)) * keep;
    H.foot.style.background = mix("#ffffff", "#e7f6ed", g);
    H.check.style.background = mix("#1865f2", "#1fab54", g);
    H.check.style.transform = `scale(${t >= HT.check - 0.02 && t < HT.check + 0.1 ? 0.95 : 1})`;
    $(".c0", H.check).style.opacity = 1 - g;
    $(".c1", H.check).style.opacity = g;
    const gk = t >= HT.check + 0.1 ? spring(t - HT.check - 0.1, 2.6, 0.45) : 0;
    H.good.style.opacity = g;
    H.good.style.transform = `translateX(${(1 - gk) * 20}px) scale(${0.9 + 0.1 * gk})`;
    H.dot3.classList.toggle("f", g > 0.5);
    $(".ext", hs).style.boxShadow = `0 0 0 2px rgba(138,180,248,${busy * 0.9})`;

    // step strip under the stage
    const doneAll = t >= HT.check + 0.1;
    ssEls.forEach((el, i) => {
      const [a, b] = SEGS[i];
      const k = doneAll ? 1 : prog(t, a, b);
      el.classList.toggle("on", (t >= a && t < b) || (doneAll && i === 3));
      $(".bar", el).style.transform = `scaleX(${k * keep})`;
    });
  }

  const heroFrame = $("#hero-frame");
  // phones: crop to the sidebar plus the page's Check button
  fit(heroFrame, hs, 1120, 680, (w) => (w < 700 ? { s: w / 560, x: -555, y: -30 } : null));
  document.fonts.ready.then(() => { measure(); });
  measure();
  addEventListener("resize", () => requestAnimationFrame(measure));
  runLoop(heroFrame, HT.dur, hero);

  // The demo starts tilted back in 3D and is scrubbed flat by scroll position:
  // fully tilted while its top is near the bottom of the screen, flat by the time it reaches the upper fifth.
  let tiltK = -1, tiltRaf = 0;
  const applyTilt = () => {
    tiltRaf = 0;
    const r = tiltWrap.getBoundingClientRect(), vh = innerHeight;
    const start = vh * 0.92, end = vh * (innerWidth < 760 ? 0.2 : 0.16);
    const k = clamp((start - r.top) / (start - end));
    const e = 1 - Math.pow(1 - k, 2.2);
    if (Math.abs(e - tiltK) < 0.0004) return;
    tiltK = e;
    const rx = (1 - e) * 24, sc = 0.86 + 0.14 * e, ty = (1 - e) * 18;
    tiltEl.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) rotateX(${rx.toFixed(3)}deg) scale(${sc.toFixed(4)})`;
    tiltEl.style.setProperty("--tk", e.toFixed(3));
  };
  const kickTilt = () => { if (!tiltRaf) tiltRaf = requestAnimationFrame(applyTilt); };
  if (REDUCED) tiltEl.style.transform = "none";
  else { addEventListener("scroll", kickTilt, { passive: true }); addEventListener("resize", () => { tiltK = -1; kickTilt(); }); applyTilt(); }

  // ———————————————————————————————————————————————————————————————
  // How it works: three small scenes, one per step
  // ———————————————————————————————————————————————————————————————
  const mini = $("#mini");
  mini.innerHTML = `
    <div class="scene-s" data-s="0">
      <div class="panel" style="left:120px;top:96px;width:380px;height:230px;border-radius:16px;border:1px solid #0003;box-shadow:0 30px 70px rgba(20,25,45,.35)">
        <div class="tb" style="border:0;padding:16px 18px 16px">
          <div class="tb-top"><div class="wm"><i></i>Nook</div><div class="tb-icons"><svg class="ic"><use href="#i-help"/></svg><svg class="ic"><use href="#i-reload"/></svg><svg class="ic"><use href="#i-user"/></svg></div></div>
          <div class="pbtn" id="m1-btn" style="height:46px;font-size:15px;margin-top:16px"><svg class="ic"><use href="#i-spark"/></svg><span>What's the answer?</span><i class="spin" style="right:74px"></i><i class="rip"></i></div>
          <div class="hk" style="margin-top:10px">Hotkey <span class="k">⌥⇧A</span> Alt+Shift+A on Windows</div>
          <div class="status" id="m1-st" style="margin-top:14px"><i></i><span class="s1">Reading the page…</span></div>
        </div>
      </div>
      <div style="position:absolute;left:0;right:0;top:360px;display:flex;justify-content:center;gap:10px" id="m1-keys">
        <span class="kc mk">⌥</span><span class="kc mk">⇧</span><span class="kc mk">A</span>
      </div>
      <div class="cur" id="m1-cur">${cursorSVG}</div>
    </div>
    <div class="scene-s" data-s="1">
      <div class="panel" style="left:150px;top:40px;width:320px;height:390px;border-radius:16px;border:1px solid #0003;box-shadow:0 30px 70px rgba(20,25,45,.35);background:var(--gem)">
        <div class="gem" style="top:0">
          <div class="gem-head"><div class="bars"></div><span>Gemini</span><span class="m">Flash ▾</span><div class="av"></div></div>
          <div class="ubub" id="m2-ub" style="top:56px"><div class="th" id="m2-th"></div><p>What's the answer? Format it for this site.</p></div>
          <svg class="gsp" id="m2-sp" viewBox="0 0 24 24" style="top:196px"><use href="#i-spark" fill="url(#gemgrad)"/></svg>
          <div class="resp" id="m2-resp" style="top:194px;left:40px">${RESP.map((w) => `<span class="w">${w} </span>`).join("")}<div class="ans">ANSWER: <code><b></b><span>${ANSWER}</span></code></div></div>
          <div class="ginput">+&nbsp;&nbsp;&nbsp;Ask Gemini</div>
        </div>
      </div>
      <div class="shot" id="m2-shot" style="width:${PAGE_W}px;height:${WIN.h - 40}px"><div class="pg" style="position:relative;top:0;width:${PAGE_W}px;height:${WIN.h - 40}px">${PAGE}</div></div>
    </div>
    <div class="scene-s" data-s="2">
      <div class="win" style="left:70px;top:70px;width:480px;height:330px">
        <div class="chrome"><div class="lights"><i></i><i></i><i></i></div><div class="url">practice.example<b>/calculus</b></div></div>
        <div class="pg" id="m3-pg" style="width:480px">
          <div class="pg-body" style="padding:28px 30px">
            <div class="pg-q" style="margin-top:0">Let <i>F</i>(<i>x</i>) = sin(<i>x</i><sup>4</sup>). Find <i>F</i>′(<i>x</i>).</div>
            <div class="pg-row"><span><i>F</i>′(<i>x</i>) =</span><div class="pg-in"><span class="typed"></span><span class="caret"></span></div></div>
          </div>
          <div class="pg-foot"><div class="pg-good"><i><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i>Nice work!</div><div class="pg-check"><span class="c0">Check</span><span class="c1" style="opacity:0">Next</span></div></div>
        </div>
      </div>
      <div class="cur" id="m3-cur">${cursorSVG}</div>
    </div>`;
  $("#m2-th").innerHTML = `<div class="pg" style="top:0;width:${PAGE_W}px;height:${WIN.h - 40}px;transform:scale(${154 / PAGE_W});transform-origin:0 0">${PAGE}</div>`;
  // mini keycaps reuse the bento keycap look at a smaller size
  $$(".mk", mini).forEach((k) => Object.assign(k.style, { width: "52px", height: "52px", borderRadius: "12px", display: "grid", placeItems: "center", font: "600 21px/1 var(--font)", color: "#0c1a30", background: "linear-gradient(#fff,#f3f4f6)", border: "1px solid #e2e3e6", boxShadow: "0 5px 0 #dcdde1, 0 12px 20px rgba(17,17,19,.12)" }));
  fit($("#how-vis"), mini, 620, 470, (w) => (w < 700 ? { s: w / 520, x: -50, y: -20 } : null)); // phones: crop the empty margins so the scenes read bigger

  const scenes = $$(".scene-s", mini);
  const M = {
    btn: $("#m1-btn"), st: $("#m1-st"), keys: $$(".mk", mini), c1: $("#m1-cur"),
    ub: $("#m2-ub"), sp: $("#m2-sp"), words: $$("#m2-resp .w"), ans: $("#m2-resp .ans"), shot: $("#m2-shot"),
    pg: $("#m3-pg"), c3: $("#m3-cur"),
  };
  const STEP_DUR = 4.6;
  const sceneFns = [
    (t) => { // click the button (or press the keys)
      const k = E.inOutQuint(prog(t, 0.3, 1.2));
      set(M.c1, { x: lerp(560, 330, k) + Math.sin(k * Math.PI) * 30, y: lerp(430, 165, k), s: t > 1.2 && t < 1.32 ? 0.85 : 1, o: prog(t, 0.15, 0.4) * (1 - prog(t, 3.9, 4.3)) });
      const busy = E.out(prog(t, 1.3, 1.55)) * (1 - E.out(prog(t, 3.8, 4.2)));
      M.btn.style.background = mix("#eceef2", "#1d2027", busy);
      M.btn.style.color = mix("#0e0f12", "#8a91a0", busy);
      M.btn.style.transform = `scale(${t > 1.2 && t < 1.34 ? 0.97 : 1})`;
      const sp = $(".spin", M.btn); sp.style.opacity = busy; sp.style.transform = `rotate(${t * 520}deg)`;
      const rp = prog(t, 1.22, 1.9);
      set($(".rip", M.btn), { x: 200, y: 23, s: E.out(rp) * 14, o: rp > 0 && rp < 1 ? 0.5 * (1 - rp) : 0 });
      M.st.style.opacity = busy;
      M.keys.forEach((kc, i) => {
        const a = 2.2 + i * 0.12, d = t > a && t < a + 0.6 ? 1 : 0;
        kc.style.transform = `translateY(${d * 4}px)`;
        kc.style.boxShadow = d ? "0 1px 0 #dcdde1, 0 4px 8px rgba(17,17,19,.1)" : "0 5px 0 #dcdde1, 0 12px 20px rgba(17,17,19,.12)";
      });
    },
    (t) => { // screenshot to Gemini, Gemini answers
      const fk = E.inOut(prog(t, 0.2, 0.9));
      if (t < 0.92) {
        const s = lerp(0.42, 154 / PAGE_W, fk);
        M.shot.style.transform = `translate(${lerp(40, 306, fk)}px, ${lerp(150, 105, fk) - Math.sin(fk * Math.PI) * 60}px) rotate(${Math.sin(fk * Math.PI) * -5}deg) scale(${s})`;
        M.shot.style.opacity = prog(t, 0, 0.15);
      } else M.shot.style.opacity = 0;
      const ub = t >= 0.9 ? spring(t - 0.9, 2.6, 0.5) : 0;
      set(M.ub, { y: (1 - ub) * 8, s: 0.9 + 0.1 * ub, o: t >= 0.9 ? 1 : 0 });
      const thinking = t >= 1.1;
      set(M.sp, { s: thinking ? spring(t - 1.1, 2.4, 0.45) : 0, r: Math.min(t, 2.2) * 300, o: thinking ? 1 : 0 });
      M.words.forEach((w, i) => { const k = prog(t, 1.7 + i * 0.07, 1.9 + i * 0.07); w.style.opacity = k; w.style.filter = k < 1 ? `blur(${(1 - k) * 4}px)` : ""; });
      const a0 = 1.7 + M.words.length * 0.07;
      M.ans.style.opacity = prog(t, a0, a0 + 0.2);
      const hb = $("b", M.ans), hl = E.inOut(prog(t, a0 + 0.3, a0 + 0.7));
      hb.style.right = `${(1 - hl) * 100}%`; hb.style.opacity = hl > 0 ? 1 : 0;
    },
    (t) => { // fills it in, you press Check
      const n = t >= 0.4 ? clamp(Math.floor((t - 0.4) / 0.06) + 1, 0, ANSWER.length) : 0;
      $(".typed", M.pg).textContent = ANSWER.slice(0, n);
      const inp = $(".pg-in", M.pg), fk = E.out(prog(t, 0.25, 0.5));
      inp.style.borderColor = mix("#babec2", "#1865f2", fk);
      inp.style.boxShadow = `0 0 0 ${3 * fk}px rgba(24,101,242,0.18)`;
      $(".caret", M.pg).style.opacity = fk > 0.5 && t < 2.4 && Math.floor(t * 2.4) % 2 === 0 ? 1 : 0;
      const k = E.inOutQuint(prog(t, 1.4, 2.35));
      set(M.c3, { x: lerp(560, 487, k), y: lerp(460, 375, k) - Math.sin(k * Math.PI) * 30, s: t > 2.4 && t < 2.52 ? 0.85 : 1, o: prog(t, 1.3, 1.5) });
      const g = E.out(prog(t, 2.48, 2.8));
      $(".pg-foot", M.pg).style.background = mix("#ffffff", "#e7f6ed", g);
      const chk = $(".pg-check", M.pg);
      chk.style.background = mix("#1865f2", "#1fab54", g);
      $(".c0", chk).style.opacity = 1 - g; $(".c1", chk).style.opacity = g;
      const good = $(".pg-good", M.pg), gk = t > 2.5 ? spring(t - 2.5, 2.6, 0.45) : 0;
      good.style.opacity = g; good.style.transform = `translateX(${(1 - gk) * 20}px) scale(${0.9 + 0.1 * gk})`;
    },
  ];

  const stepEls = $$("#steps .step");
  let step = 0, stepT = 0, stepLast = null, stepOn = false;
  const showStep = (i) => {
    step = i; stepT = 0;
    stepEls.forEach((el, j) => el.classList.toggle("on", j === i));
    scenes.forEach((sc, j) => sc.classList.toggle("on", j === i));
  };
  stepEls.forEach((el, i) => el.addEventListener("click", () => showStep(i)));
  const stepTick = (now) => {
    if (!stepOn) { stepLast = null; return; }
    if (stepLast != null) stepT += Math.min(0.1, (now - stepLast) / 1000);
    stepLast = now;
    if (stepT >= STEP_DUR) showStep((step + 1) % 3);
    sceneFns[step](stepT);
    stepEls.forEach((el, j) => { $(".prog", el).style.transform = `scaleX(${j === step ? stepT / STEP_DUR : 0})`; });
    requestAnimationFrame(stepTick);
  };
  new IntersectionObserver(([e]) => { const was = stepOn; stepOn = e.isIntersecting; if (stepOn && !was) requestAnimationFrame(stepTick); }, { threshold: 0.2 }).observe($("#how-vis"));
  showStep(0);
  sceneFns.forEach((fn) => fn(REDUCED ? 3.5 : 0));

  // ———————————————————————————————————————————————————————————————
  // Highlight demo: select, right-click, Ask Nook, bubble, choice picked
  // ———————————————————————————————————————————————————————————————
  const Q = "What is the slope of the line through (2, 3) and (6, 11)?".split(" ");
  const CH = ["1/2", "2", "4", "8"], PICK = 1;
  const hm = $("#hl-mini");
  hm.innerHTML = `
    <div class="win" style="left:24px;top:44px;width:652px;height:440px">
      <div class="chrome"><div class="lights"><i></i><i></i><i></i></div><div class="url">quiz.example<b>/algebra</b></div></div>
      <div class="qz" style="left:0;top:40px;right:0;bottom:0;padding:26px 28px"><div style="width:350px">
        <div class="pg-eb" style="color:#6b4fd8">QUESTION 3 OF 10</div>
        <div class="qz-q" id="hl-q" style="margin-top:12px">${Q.map((w, i) => `<span class="w">${w}${i < Q.length - 1 ? " " : ""}</span>`).join("")}</div>
        <div style="margin-top:16px">${CH.map((c) => `<div class="qz-ch"><i><b></b></i>${c}</div>`).join("")}</div></div>
      </div>
    </div>
    <div class="cmenu" id="hl-menu"><div class="mi"><span class="gap"></span>Copy</div><div class="mi"><span class="gap"></span>Search Google for “What is the slope…”</div><div class="sep"></div><div class="mi" id="hl-ask"><svg viewBox="0 0 120 120" style="width:14px;height:14px"><use href="#logo"/></svg>Ask Nook about “What is the slope…”</div><div class="sep"></div><div class="mi"><span class="gap"></span>Inspect</div></div>
    <div class="nb" id="hl-bub">
      <div class="nb-head"><i></i>Nook<svg class="ic x"><use href="#i-x"/></svg></div>
      <div class="nb-body" id="hl-body">
        <div class="nb-ld" id="hl-ld"><div class="nb-row"><svg viewBox="0 0 24 24" id="hl-spark"><use href="#i-spark"/></svg>Solving…</div><div class="nb-bar"></div><div class="nb-bar" style="width:70%"></div></div>
        <div class="nb-an" id="hl-an"><div class="nb-label">Answer</div><div class="nb-value">2</div><div class="nb-why">Slope = (11 − 3) ÷ (6 − 2) = 8 ÷ 4 = 2.</div><div class="nb-actions"><span class="nb-btn primary" id="hl-fill"><svg class="ic"><use href="#i-check"/></svg><span>Filled</span></span><span class="nb-btn"><svg class="ic"><use href="#i-copy"/></svg>Copy</span></div><div class="nb-note">Filled in. Check it, then submit.</div></div>
      </div>
    </div>
    <svg class="cur" id="hl-beam" viewBox="0 0 14 26" style="width:14px;height:26px"><path d="M2 2h3.5c.8 0 1.5.7 1.5 1.5 0-.8.7-1.5 1.5-1.5H12M2 24h3.5c.8 0 1.5-.7 1.5-1.5 0 .8.7 1.5 1.5 1.5H12M7 3.5v19" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M2 2h3.5c.8 0 1.5.7 1.5 1.5 0-.8.7-1.5 1.5-1.5H12M2 24h3.5c.8 0 1.5-.7 1.5-1.5 0 .8.7 1.5 1.5 1.5H12M7 3.5v19" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round"/></svg>
    <div class="cur" id="hl-cur">${cursorSVG}</div>`;
  fit($("#hl-vis"), hm, 700, 520, (w) => (w < 700 ? { s: w / 652, x: -24, y: -30 } : null));
  $("#hl-bub").style.width = "236px";
  const L = { q: $("#hl-q"), words: $$("#hl-q .w"), menu: $("#hl-menu"), ask: $("#hl-ask"), bub: $("#hl-bub"), body: $("#hl-body"), ld: $("#hl-ld"), an: $("#hl-an"), spark: $("#hl-spark"), beam: $("#hl-beam"), cur: $("#hl-cur"), fill: $("#hl-fill"), chs: $$("#hl-mini .qz-ch") };
  const LT = { drag: 0.8, dragEnd: 1.75, right: 2.05, hover: 2.45, pick: 2.75, answer: 4.3, fill: 4.75, reset: 8.3, dur: 9.0 };
  const LG = {};
  const measureHL = () => {
    const base = hm.getBoundingClientRect(), s = base.width / 700;
    LG.words = L.words.map((w) => { const r = w.getBoundingClientRect(); return { x: (r.left - base.left) / s, y: (r.top - base.top) / s, w: r.width / s, h: r.height / s }; });
    LG.ld = L.ld.offsetHeight; LG.an = L.an.offsetHeight;
  };
  function highlight(t) {
    if (!LG.words) return;
    const reset = E.inOut(prog(t, LT.reset, LT.dur - 0.1)), keep = 1 - reset;
    const W = LG.words, N = W.length;
    const f = E.inOut(prog(t, LT.drag, LT.dragEnd)) * N;
    L.words.forEach((w, i) => { w.style.backgroundSize = `${clamp(f - i) * 100 * keep}% 100%`; });
    const pts = [{ x: W[0].x - 2, y: W[0].y + W[0].h / 2 }, ...W.map((r) => ({ x: r.x + r.w, y: r.y + r.h / 2 }))];
    const i0 = Math.min(N - 1, Math.floor(f)), fr = clamp(f - i0);
    const drag = { x: lerp(pts[i0].x, pts[i0 + 1].x, fr), y: lerp(pts[i0].y, pts[i0 + 1].y, fr) };
    const end = pts[N];
    const mx = end.x + 4, my = end.y + 4, askY = 4 + 24 * 2 + 9 + 12;
    // pointer
    let p;
    if (t < LT.drag) { const k = E.inOutQuint(prog(t, 0.2, LT.drag - 0.05)); p = { x: lerp(pts[0].x + 200, pts[0].x, k), y: lerp(pts[0].y + 260, pts[0].y, k) }; }
    else if (t < LT.right + 0.1) p = t < LT.dragEnd ? drag : end;
    else if (t < LT.pick + 0.1) { const k = E.inOutQuint(prog(t, LT.right + 0.12, LT.hover - 0.02)); p = { x: lerp(end.x, mx + 150, k), y: lerp(end.y, my + askY, k) }; }
    else { const k = E.inOut(prog(t, LT.pick + 0.2, LT.pick + 0.9)); p = { x: mx + 150 + k * 120, y: my + askY + k * 160 }; }
    const arrow = t >= LT.right, pO = prog(t, 0.2, 0.4) * (1 - prog(t, LT.pick + 0.6, LT.pick + 1.0));
    const press = (t >= LT.drag && t < LT.dragEnd) || (t >= LT.right && t < LT.right + 0.1) || (t >= LT.pick && t < LT.pick + 0.1);
    set(L.beam, { x: p.x - 7, y: p.y - 13, s: press ? 0.92 : 1, o: arrow ? 0 : pO });
    set(L.cur, { x: p.x - 6, y: p.y - 4, s: press ? 0.85 : 1, o: arrow ? pO : 0 });
    // menu
    const mOn = t >= LT.right + 0.02 && t < LT.pick + 0.16;
    const mk = E.out(prog(t, LT.right + 0.02, LT.right + 0.2)), mOut = prog(t, LT.pick + 0.08, LT.pick + 0.16);
    set(L.menu, { x: Math.min(mx, 700 - 310), y: my, s: 0.92 + 0.08 * spring(t - LT.right, 3, 0.6), o: mOn ? mk * (1 - mOut) : 0 });
    L.ask.classList.toggle("on", t >= LT.hover && !(t >= LT.pick + 0.03 && t < LT.pick + 0.07));
    // bubble beside the question, loading then answer
    const bIn = E.out(prog(t, LT.pick + 0.1, LT.pick + 0.35)) * keep;
    const ans = E.out(prog(t, LT.answer, LT.answer + 0.3));
    const bodyH = lerp(LG.ld, LG.an, ans);
    L.body.style.height = `${bodyH}px`;
    const bs = spring(t - LT.pick - 0.1, 2.6, 0.55);
    set(L.bub, { x: 24 + 28 + 350 + 18, y: W[0].y - 20 + (1 - bIn) * 10, s: t > LT.pick ? 0.9 + 0.1 * bs : 0.9, o: t > LT.pick + 0.1 ? bIn : 0, blur: (1 - bIn) * 5 });
    L.bub.style.left = "0px";
    L.ld.style.opacity = 1 - prog(t, LT.answer - 0.02, LT.answer + 0.12);
    L.an.style.opacity = ans;
    L.an.style.transform = `translateY(${(1 - ans) * 4}px)`;
    const lt = t - LT.pick;
    L.spark.style.transform = `rotate(${lt * 230}deg) scale(${0.85 + 0.15 * Math.cos(lt * 4)})`;
    const filled = t >= LT.fill;
    L.fill.classList.toggle("done", filled);
    // the choice gets picked
    L.chs.forEach((c, i) => {
      const on = filled && i === PICK && keep > 0.5;
      const sk = spring(t - LT.fill, 3, 0.5);
      c.style.borderColor = on ? "#6b4fd8" : "#d6d9de";
      c.style.background = on ? "#f3f0fd" : "#fff";
      $("i", c).style.borderColor = on ? "#6b4fd8" : "#9aa0a6";
      $("i b", c).style.transform = `scale(${on ? sk : 0})`;
    });
  }
  document.fonts.ready.then(() => { measureHL(); });
  measureHL();
  addEventListener("resize", () => requestAnimationFrame(measureHL));
  runLoop($("#hl-vis"), LT.dur, highlight);

  // ———————————————————————————————————————————————————————————————
  // Sites marquee + the per-site format card
  // ———————————————————————————————————————————————————————————————
  const SITES_A = [["Khan Academy", "4x^3cos(x^4)"], ["IXL", "12/5"], ["DeltaMath", "x=-3"], ["MathXL", "sqrt(2)"], ["Google Forms", "B) 3"], ["Canvas", "True"]];
  const SITES_B = [["Quizlet", "mitochondria"], ["Quizizz", "C"], ["Kahoot!", "Blue"], ["Blooket", "1945"], ["Any website", "copied"], ["Your worksheet", "x = 7"]];
  // official marks, stored in assets/logos; [file, isWordmark]
  const LOGO = {
    "Khan Academy": ["khan-academy.svg"], IXL: ["ixl.svg", 1], DeltaMath: ["deltamath.svg"], MathXL: ["pearson.svg"],
    "Google Forms": ["google-forms.svg"], Canvas: ["canvas.svg"], Quizlet: ["quizlet.svg"], Quizizz: ["quizizz.png", 1],
    "Kahoot!": ["kahoot.svg"], Blooket: ["blooket.svg", 1],
  };
  const GENERIC = {
    "Any website": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
    "Your worksheet": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
  };
  const lockup = (name) => {
    const l = LOGO[name];
    if (!l) return `<span class="lg lg-generic">${GENERIC[name] || ""}${name}</span>`;
    const slug = l[0].split(".")[0];
    return l[1] ? `<span class="lg lg-word lg-${slug}"><img src="assets/logos/${l[0]}" alt="${name}"></span>`
      : `<span class="lg lg-${slug}"><img src="assets/logos/${l[0]}" alt="">${name}</span>`;
  };
  const pill = ([name, v]) => `<div class="site">${lockup(name)}<code>${v}</code></div>`;
  const fillTrack = (el, list) => { const html = list.map(pill).join(""); el.innerHTML = html + html + html + html; };
  const tracks = [{ el: $("#track-a"), dir: -1, base: 34 }, { el: $("#track-b"), dir: 1, base: 28 }];
  fillTrack(tracks[0].el, SITES_A);
  fillTrack(tracks[1].el, SITES_B);
  let mqVel = 0, mqLastY = scrollY, mqLast = 0, mqOn = false;
  tracks.forEach((t) => { t.x = 0; t.half = 0; });
  const mqTick = (now) => {
    if (!mqOn) { mqLast = 0; return; }
    const dt = mqLast ? Math.min(0.05, (now - mqLast) / 1000) : 0; mqLast = now;
    const dy = scrollY - mqLastY; mqLastY = scrollY; // px this frame
    mqVel += (dy - mqVel) * 0.14;
    if (Math.abs(mqVel) < 0.01) mqVel = 0;
    const boost = 1 + Math.min(7, Math.abs(mqVel) * 0.32);
    const skew = clamp(-mqVel * 0.4, -9, 9);
    for (const t of tracks) {
      if (!t.half) { t.half = t.el.scrollWidth / 2; if (t.dir > 0) t.x = -t.half; }
      t.x += t.dir * t.base * boost * dt;
      if (t.dir < 0 && t.x <= -t.half) t.x += t.half;
      if (t.dir > 0 && t.x >= 0) t.x -= t.half;
      t.el.style.transform = `translate3d(${t.x.toFixed(2)}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
    }
    requestAnimationFrame(mqTick);
  };
  addEventListener("resize", () => tracks.forEach((t) => { t.half = 0; }));
  if (!REDUCED) new IntersectionObserver(([e]) => { const was = mqOn; mqOn = e.isIntersecting; if (mqOn && !was) { mqLastY = scrollY; requestAnimationFrame(mqTick); } }).observe($("#sites"));

  const FMT = [["Khan Academy", "4x^3cos(x^4)"], ["Google Forms", "B) 3"], ["IXL", "12/5"], ["Quizlet", "mitochondria"]];
  const tabs = $("#fmt-tabs"), val = $("#fmt-val");
  tabs.innerHTML = FMT.map(([n]) => { const l = LOGO[n]; return `<span class="tab">${l[1] ? `<img src="assets/logos/${l[0]}" alt="${n}">` : `<img src="assets/logos/${l[0]}" alt="">${n}`}</span>`; }).join("");
  const tabEls = $$(".tab", tabs);
  let fi = 0;
  const showFmt = (i) => {
    tabEls.forEach((el, j) => el.classList.toggle("on", j === i));
    const sp = $("span", val);
    sp.classList.add("hide");
    setTimeout(() => { sp.textContent = FMT[i][1]; sp.classList.remove("hide"); }, 260);
  };
  $("span", val).textContent = FMT[0][1];
  tabEls[0].classList.add("on");
  if (!REDUCED) setInterval(() => { fi = (fi + 1) % FMT.length; showFmt(fi); }, 2200);

  // copy card flips to "Copied" now and then
  const vcopy = $("#vcopy");
  const vcopyBox = vcopy.closest(".fv-copy") || vcopy;
  const copyGo = (on) => { vcopy.classList.toggle("go", on); vcopyBox.classList.toggle("go", on); };
  if (REDUCED) copyGo(true);
  else setInterval(() => { copyGo(true); setTimeout(() => copyGo(false), 2200); }, 4200);

  // ——— video ———
  // The designed poster and play button cover the video before it plays, while it's paused, and after it ends.
  // Play resumes from where it paused; it only restarts after the end.
  const vid = $("#tour"), vf = $("#video-frame");
  let pauseT = 0;
  const showPoster = () => { vf.classList.remove("playing"); vid.controls = false; };
  const showVideo = () => { clearTimeout(pauseT); vf.classList.add("playing"); vid.controls = true; };
  $("#play").addEventListener("click", () => { if (vid.ended) vid.currentTime = 0; showVideo(); vid.play(); });
  vid.addEventListener("play", showVideo);
  vid.addEventListener("pause", () => { clearTimeout(pauseT); pauseT = setTimeout(() => { if (vid.paused && !vid.seeking) showPoster(); }, 220); });
  vid.addEventListener("ended", showPoster);

  // ——— FAQ ———
  $$(".qa").forEach((qa) => {
    const btn = $("button", qa), ans = $(".ans", qa);
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => {
      const open = !qa.classList.contains("open");
      qa.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
      ans.style.height = open ? `${ans.scrollHeight}px` : "0px";
    });
  });

  // ——— final keys press in order while visible ———
  const fk = $$("#fk .kc");
  let fkTimer = null;
  new IntersectionObserver(([e]) => {
    clearInterval(fkTimer);
    if (!e.isIntersecting || REDUCED) return;
    const press = () => fk.forEach((k, i) => { setTimeout(() => k.classList.add("down"), i * 130); setTimeout(() => k.classList.remove("down"), 700 + i * 60); });
    press();
    fkTimer = setInterval(press, 2800);
  }, { threshold: 0.5 }).observe($("#fk"));
})();
