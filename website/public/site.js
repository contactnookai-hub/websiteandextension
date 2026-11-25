(() => {
  const STORE = "https://chromewebstore.google.com/detail/nook-ai-answering-sidebar/fpoojjlpjldmeamnjhbmkkokjlfhdelc";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  for (const a of $$("[data-store]")) {
    a.href = STORE; a.target = "_blank"; a.rel = "noopener";
    a.addEventListener("click", () => window.nookTrack?.("click", "add-to-chrome"));
  }
  if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) for (const el of $$("[data-pc]")) el.textContent = el.dataset.pc;

  // ——— holiday sale: on until midnight Jan 1 (Pacific), then the bar and crossed-out price go away ———
  const SALE_ENDS = Date.parse("2027-01-01T00:00:00-08:00");
  if (Date.now() < SALE_ENDS) {
    document.documentElement.classList.add("sale");
    const bar = $(".sale-bar");
    if (bar) bar.hidden = false;
  }

  // pause looping animations in anything that's off screen
  const offIo = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("off", !e.isIntersecting)));
  $$(".sale-bar, .hero, .shot, .pro, #pricing").forEach((el) => offIo.observe(el));

  // nav border once you scroll
  const nav = $("#nav");
  let navTick = 0;
  const onScroll = () => { if (navTick) return; navTick = requestAnimationFrame(() => { navTick = 0; nav.classList.toggle("scrolled", scrollY > 8); }); };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // reveal
  for (const el of $$(".step, .feat, .trust > div, .plan, .compare, .faq-list, .pro-copy, .pro-demo, .final-in, .types")) el.classList.add("rv");
  const rio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); rio.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  $$(".rv").forEach((el) => rio.observe(el));

  // ——— product shot: tilt flattens as it comes in, then the demo plays ———
  const shot = $("#shot");
  const mac = $("#mac");
  const cap = $("#shot-cap");
  const tabs = $$(".modes button");
  const qs = Object.fromEntries($$(".qq", mac).map((q) => [q.dataset.q, q]));
  const cursor = $(".cursor", mac);
  const CAPS = {
    click: "<b>One click.</b> Press ⌥⇧A. Nook reads the question, asks Gemini and types the answer in the box.",
    highlight: "<b>Highlight.</b> Select a question, right-click, Ask Nook. The answer shows right above it.",
    page: "<b>Whole page.</b> One ask answers every question. Double-click one to fill it, or Fill all.",
    hidden: '<b>Hidden, with Pro.</b> No sidebar, no bubble, not even the dots. Just a tiny loader by your cursor. <a class="cap-cta" href="#notify" data-notify>Get Nook Pro <span>$5/mo</span></a>',
  };
  const ORDER = ["click", "highlight", "page", "hidden"];
  let timers = [], mode = "click", auto, picked = false;
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const move = (x, y) => { cursor.style.left = x + "%"; cursor.style.top = y + "%"; };
  const macState = (...c) => (mac.className = "browser " + c.join(" "));
  const qState = (n, ...c) => (qs[n].className = "qq " + c.join(" "));
  const RUN = {
    click() { move(104, 22); at(600, () => macState("s-press")); at(850, () => macState("s-read")); at(1700, () => macState("s-ask")); at(3000, () => { macState("s-done"); qState(1, "filled"); }); },
    highlight() { move(30, 36); at(450, () => qState(2, "marked")); at(1150, () => { qState(2, "marked", "ctx-on"); move(50, 44); }); at(2050, () => qState(2, "marked", "bub-on")); at(3100, () => { qState(2, "bub-on", "picked"); move(42, 52); }); },
    page() {
      move(104, 30); at(600, () => { macState("s-press"); for (const n in qs) qState(n, "d-wait"); });
      ["1", "2", "3", "4"].forEach((n, i) => at(1650 + i * 140, () => qState(n, "d-ready")));
      at(2350, () => macState("s-pill")); at(2850, () => move(22, 24)); at(3450, () => qState(1, "d-ok", "filled"));
      at(4400, () => move(104, 92)); at(5000, () => { qState(2, "d-ok", "picked"); qState(3, "d-ok", "filled"); qState(4, "d-ok", "filled"); });
    },
    hidden() { move(58, 60); at(350, () => macState("no-side", "s-load")); at(2250, () => macState("no-side", "s-check")); at(3650, () => macState("no-side")); at(4050, () => move(22, 24)); at(4650, () => qState(1, "filled")); at(5250, () => move(24, 66)); at(5850, () => qState(3, "filled")); },
  };
  function show(m, byUser) {
    mode = m;
    tabs.forEach((t) => t.classList.toggle("on", t.dataset.mode === m));
    cap.innerHTML = CAPS[m];
    timers.forEach(clearTimeout); timers = []; clearTimeout(auto);
    for (const n in qs) qState(n);
    macState(m === "hidden" ? "no-side" : "");
    shot.classList.toggle("is-pro", m === "hidden");
    move(60, 62);
    if (still) {
      if (m === "click") { macState("s-done"); qState(1, "filled"); }
      if (m === "highlight") qState(2, "bub-on", "picked");
      if (m === "page") { macState("s-pill"); for (const n in qs) qState(n, "d-ok", "filled"); qState(2, "d-ok", "picked"); }
      if (m === "hidden") { macState("no-side"); qState(1, "filled"); qState(3, "filled"); }
      return;
    }
    RUN[m]();
    if (byUser) picked = true;
    const next = picked ? m : ORDER[(ORDER.indexOf(m) + 1) % ORDER.length];
    // the Hidden (Pro) demo stays up a little longer when it comes around on its own
    auto = setTimeout(() => show(next), m === "hidden" ? 9000 : 7600);
  }
  tabs.forEach((t) => t.addEventListener("click", () => { show(t.dataset.mode, true); window.nookTrack?.("click", "demo-" + t.dataset.mode); }));
  let started = false;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { shot.classList.add("in"); if (!started) { started = true; setTimeout(() => show(mode), 500); } }
    else if (started) { started = false; clearTimeout(auto); timers.forEach(clearTimeout); }
  }, { threshold: 0.3 }).observe(shot);

  // ——— headline, played once on arrival: the keys get pressed, then "in the box" is typed into the box ———
  const hkKeys = $$("#hk kbd");
  const hk = $("#hk");
  const fill = $("#fill");
  const fillT = $(".fill-t", fill);
  const caret = $(".caret", fill);
  const TEXT = "in the box";
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const placeCaret = () => { caret.style.left = `calc(0.16em + ${fillT.offsetWidth}px + 0.03em)`; };
  async function playHeadline() {
    placeCaret();
    await wait(450);
    hk.classList.add("in");                       // keys rise in, one by one
    await wait(750);
    for (const k of hkKeys) { k.classList.add("down"); await wait(260); }   // ⌥ … ⇧ … A
    hk.classList.add("held");                     // all three held together
    await wait(420);
    hkKeys.forEach((k) => k.classList.remove("down"));
    hk.classList.remove("held");
    hk.classList.add("fired");                    // release with a bounce
    fill.classList.add("on", "pulse");            // the box lights up
    await wait(420);
    for (const ch of TEXT) {                      // each letter lands with a pop
      const sp = document.createElement("span");
      sp.className = "ch";
      sp.textContent = ch === " " ? "\u00a0" : ch;
      fillT.appendChild(sp);
      placeCaret();
      await wait(ch === " " ? 70 : 95);
    }
    await wait(250);
    fillT.textContent = TEXT; // plain text again so the spacing matches the box exactly
    fill.classList.add("done");                   // caret goes, check pops in
  }
  if (still) { fillT.textContent = TEXT; hk.classList.add("in"); fill.classList.add("on", "done"); }
  else playHeadline();

  // the real shortcut replays the one-click demo
  addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && e.code === "KeyA") { e.preventDefault(); shot.scrollIntoView({ behavior: "smooth", block: "center" }); show("click", true); }
  });

  // ——— Pro: Hidden mode, step by step (only runs while it's on screen) ———
  const hd = $("#hd");
  const hdQs = $$(".hd-q", hd);
  const hdCur = $(".hd-cur", hd);
  const hdSteps = $$("#hd-steps li");
  const curTo = (x, y) => { hdCur.style.left = x + "%"; hdCur.style.top = y + "%"; };
  const hdState = (...c) => (hd.className = "pro-demo hd is-hidden " + c.join(" "));
  const step = (n) => hdSteps.forEach((li, i) => { li.classList.toggle("on", i === n); li.classList.toggle("done", i < n); });
  let hdOn = false, hdRun = 0;
  const hdWait = (ms, run) => new Promise((r, x) => setTimeout(() => (run === hdRun ? r() : x()), ms));
  async function hdLoop(run) {
    try {
      for (;;) {
        hdQs.forEach((q) => q.classList.remove("filled")); curTo(62, 48); hdState(); step(-1);
        await hdWait(900, run);
        step(0); await hdWait(1500, run);                     // press the shortcut: nothing appears
        step(1); hdState("loading"); await hdWait(2000, run); // the loader by the cursor
        step(2); hdState("checked"); await hdWait(1200, run); // check…
        hdState(); await hdWait(700, run);                    // …and gone
        step(3);
        const spots = [[38, 22], [34, 47], [42, 72]];
        for (let i = 0; i < hdQs.length; i++) { curTo(...spots[i]); await hdWait(700, run); hdQs[i].classList.add("filled"); await hdWait(300, run); }
        await hdWait(2600, run);
      }
    } catch { /* stopped: scrolled away */ }
  }
  if (still) { hdState(); step(4); hdQs.forEach((q) => q.classList.add("filled")); }
  else new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !hdOn) { hdOn = true; hdLoop(++hdRun); }
    else if (!e.isIntersecting && hdOn) { hdOn = false; hdRun++; }
  }, { threshold: 0.25 }).observe(hd);

  // video
  const vid = $("#vid"), v = $("video", vid);
  $("#pro-play").addEventListener("click", () => { vid.showModal(); v.play().catch(() => {}); window.nookTrack?.("click", "pro-video-play"); });
  const closeVid = () => { v.pause(); vid.close(); };
  $(".x", vid).addEventListener("click", closeVid);
  vid.addEventListener("click", (e) => { if (e.target === vid) closeVid(); });

  // FAQ: one open at a time
  const items = $$(".faq details");
  items.forEach((d) => d.addEventListener("toggle", () => { if (d.open) items.forEach((o) => o !== d && (o.open = false)); }));

  // Get notified (Web3Forms)
  const WEB3FORMS_KEY = "3279cdcd-0e17-432e-b227-9991911060fd";
  const dlg = $("#notify"), form = $("#notify-form"), done = $(".nf-done", dlg), err = $(".nf-err", form), submit = $('button[type="submit"]', form);
  const openNotify = (e) => { e?.preventDefault(); form.hidden = false; done.hidden = true; err.textContent = ""; dlg.showModal(); setTimeout(() => form.elements.name.focus(), 60); window.nookTrack?.("click", "pro-notify"); };
  // delegated, so links added later (like the one in the demo caption) work too
  document.addEventListener("click", (e) => { const a = e.target.closest("[data-notify]"); if (a) openNotify(e); });
  $$("[data-close]", dlg).forEach((b) => b.addEventListener("click", () => dlg.close()));
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  if (location.hash === "#notify") openNotify();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.elements.botcheck.checked) return;
    const name = form.elements.name.value.trim(), email = form.elements.email.value.trim();
    if (!name) { err.textContent = "Add your name."; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = "That email doesn't look right."; return; }
    err.textContent = ""; submit.disabled = true; submit.textContent = "Sending…";
    try {
      const res = await fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject: "Nook Pro waitlist", from_name: "Nook website", name, email }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error();
      form.reset(); form.hidden = true; done.hidden = false;
      window.nookTrack?.("click", "pro-notify-sent");
    } catch { err.textContent = "Couldn't send that. Check your connection and try again."; }
    finally { submit.disabled = false; submit.textContent = "Notify me"; }
  });
})();
