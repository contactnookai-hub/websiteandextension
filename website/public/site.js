/* Nook site v6. Every "Add to Chrome" link comes from STORE. No libraries. */
(() => {
  const STORE = "https://chromewebstore.google.com/detail/nook-ai-answering-sidebar/fpoojjlpjldmeamnjhbmkkokjlfhdelc";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const a of $$("[data-store]")) {
    a.href = STORE;
    a.target = "_blank";
    a.rel = "noopener";
    a.addEventListener("click", () => window.nookTrack?.("click", "add-to-chrome"));
  }
  // ——— Get notified about Pro: a small form (name + email) sent with Web3Forms ———
  const WEB3FORMS_KEY = "3279cdcd-0e17-432e-b227-9991911060fd";
  const dlg = $("#notify");
  const form = $("#notify-form");
  const done = $(".nf-done", dlg);
  const err = $(".nf-err", form);
  const submit = $('button[type="submit"]', form);
  function openNotify(e) {
    e?.preventDefault();
    window.nookTrack?.("click", "pro-notify");
    form.hidden = false;
    done.hidden = true;
    err.textContent = "";
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    setTimeout(() => form.elements.name.focus(), 60);
  }
  const closeNotify = () => (dlg.close ? dlg.close() : dlg.removeAttribute("open"));
  for (const a of $$("[data-notify]")) a.addEventListener("click", openNotify);
  for (const b of $$("[data-close]", dlg)) b.addEventListener("click", closeNotify);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeNotify(); }); // click on the backdrop
  if (location.hash === "#notify") openNotify();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.elements.botcheck.checked) return;
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    if (!name) { err.textContent = "Add your name."; form.elements.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = "That email doesn't look right."; form.elements.email.focus(); return; }
    err.textContent = "";
    submit.disabled = true;
    submit.textContent = "Sending…";
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject: "Nook Pro waitlist", from_name: "Nook website", name, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || "failed");
      form.reset();
      form.hidden = true;
      done.hidden = false;
      window.nookTrack?.("click", "pro-notify-sent");
    } catch {
      err.textContent = "Couldn't send that. Check your connection and try again.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Notify me";
    }
  });

  // ——— Nav: background once scrolled, mobile menu, tucked away while the feature tabs are pinned ———
  const nav = $("#nav");
  const menuBtn = $(".nav-menu");
  const menu = $("#mobile-menu");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  menuBtn.addEventListener("click", () => {
    const open = menuBtn.getAttribute("aria-expanded") !== "true";
    menuBtn.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
  });
  for (const a of $$("a", menu)) a.addEventListener("click", () => { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); });

  // ——— Reveal on scroll ———
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const el of $$("[data-reveal]")) io.observe(el);

  // ——— Hero clock (like a desktop menu bar) ———
  const clock = $("[data-clock]");
  const tick = () => {
    const d = new Date();
    const day = d.toLocaleDateString("en-US", { weekday: "short" });
    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    clock.textContent = `${day} ${date} ${time}`;
  };
  tick();
  setInterval(tick, 30000);

  // ——— Hero loop: press the keys, Nook reads, asks, fills; the bubble and the page log fill in too ———
  const stage = $("#stage");
  const h = (k) => $(`[data-h="${k}"]`, stage);
  const island = $(".island", stage);
  const islandS = h("island");
  const btn = h("btn");
  const status = h("status");
  const card = h("card");
  const field = h("field");
  const fieldV = h("fieldv");
  const bubble = h("bubble");
  const logItems = $$("li", h("log"));
  let stageVisible = false;
  new IntersectionObserver(([e]) => { stageVisible = e.isIntersecting; }, { threshold: 0.2 }).observe(stage);

  function finalState() {
    islandS.textContent = "Answered · 4.6s"; islandS.classList.add("ok");
    status.textContent = "Filled in. Check it, then submit."; status.classList.add("ok");
    card.classList.add("show"); fieldV.textContent = "17"; field.classList.add("done");
    bubble.classList.add("show"); logItems.forEach((li) => li.classList.add("show"));
  }
  function reset() {
    islandS.textContent = "Ready"; islandS.classList.remove("ok");
    status.textContent = "Ready when you are"; status.classList.remove("ok");
    card.classList.remove("show"); fieldV.textContent = ""; field.classList.remove("done", "typing");
    bubble.classList.remove("show"); logItems.forEach((li) => li.classList.remove("show"));
  }
  async function heroLoop() {
    if (reduced.matches) { finalState(); return; }
    for (;;) {
      while (!stageVisible || document.hidden) await wait(400);
      reset();
      await wait(1100);
      island.classList.add("press"); btn.classList.add("press");
      islandS.textContent = "Reading the page…"; status.textContent = "Reading the question…";
      await wait(260);
      island.classList.remove("press"); btn.classList.remove("press");
      await wait(700);
      islandS.textContent = "Asking Gemini…"; status.textContent = "Asking Gemini…";
      logItems[0].classList.add("show");
      await wait(700);
      logItems[1].classList.add("show"); bubble.classList.add("show");
      await wait(500);
      card.classList.add("show"); status.textContent = "Filling in the answer…";
      field.classList.add("typing");
      for (const ch of "17") { await wait(140); fieldV.textContent += ch; }
      await wait(160);
      field.classList.remove("typing"); field.classList.add("done");
      islandS.textContent = "Answered · 4.6s"; islandS.classList.add("ok");
      status.textContent = "Filled in. Check it, then submit."; status.classList.add("ok");
      for (const li of logItems.slice(2)) { await wait(260); li.classList.add("show"); }
      await wait(3600);
    }
  }
  heroLoop();

  // ——— Tour video ———
  for (const btn of $$("[data-play]")) {
    btn.addEventListener("click", () => {
      const fig = btn.closest("figure");
      const video = $("[data-video]", fig);
      for (const other of $$("[data-video]")) if (other !== video) other.pause();
      video.controls = true;
      video.play().catch(() => {});
      fig.classList.add("playing");
      window.nookTrack?.("click", `${btn.dataset.play}-play`);
    });
  }

  // ——— Problem / Solution switch ———
  const flow = $("#flow");
  const setPS = (mode) => {
    for (const b of $$("[data-ps]")) b.setAttribute("aria-selected", String(b.dataset.ps === mode));
    for (const t of $$(".ps-text")) t.hidden = t.dataset.show !== mode;
    flow.dataset.mode = mode;
    const key = mode === "problem" ? "p" : "s";
    for (const el of $$("[data-p]", flow)) el.textContent = el.dataset[key];
  };
  for (const b of $$("[data-ps]")) b.addEventListener("click", () => { psAuto = false; setPS(b.dataset.ps); });
  let psAuto = true;
  let psVisible = false;
  new IntersectionObserver(([e]) => { psVisible = e.isIntersecting; }, { threshold: 0.4 }).observe(flow);
  if (!reduced.matches) {
    (async () => {
      for (;;) {
        await wait(4800);
        if (psAuto && psVisible && !document.hidden) setPS(flow.dataset.mode === "problem" ? "solution" : "problem");
      }
    })();
  }

  // ——— Feature cards: pinned tab bar with a scroll progress line, nav tucks away under it ———
  const ftabs = $("#ftabs");
  const bar = $("#ftabs-bar");
  const tabs = $$("[data-ft]", ftabs);
  const cards = tabs.map((t) => document.getElementById(t.dataset.ft));
  function onFeatureScroll() {
    const tabsTop = ftabs.getBoundingClientRect().top;
    const pinned = tabsTop <= 0.5;
    const last = cards[cards.length - 1].getBoundingClientRect();
    nav.classList.toggle("tucked", pinned && last.bottom > 120);
    let active = 0;
    cards.forEach((c, i) => { if (c.getBoundingClientRect().top < innerHeight * 0.45) active = i; });
    tabs.forEach((t, i) => t.classList.toggle("on", i === active));
    const first = cards[0].getBoundingClientRect();
    const total = last.bottom - first.top - innerHeight * 0.5;
    const done = Math.min(1, Math.max(0, (-first.top + innerHeight * 0.3) / Math.max(1, total)));
    bar.style.width = `${(done * 100).toFixed(2)}%`;
  }
  addEventListener("scroll", onFeatureScroll, { passive: true });
  addEventListener("resize", onFeatureScroll);
  onFeatureScroll();

  // ——— Sub-tabs inside each feature card: click to switch, or they cycle while the card is on screen ———
  const ANSWER_VIEWS = [
    { k: "Multiple choice", q: "Which expression is equivalent to (x + 3)²?", v: "x² + 6x + 9",
      a: () => ["x² + 9", "x² + 6x + 9", "x² + 3x + 9", "2x + 6"].map((t, i) => `<div class="m-opt${i === 1 ? " pick" : ""}">${t}</div>`).join("") },
    { k: "Math box", q: "Simplify. Write your answer as a fraction.  1/3 + 1/4", v: "7/12", a: () => `<div class="m-box">7/12</div>` },
    { k: "Dropdown", q: "Which country shares the longest border with Nepal?", v: "China", a: () => `<div class="m-dd">China</div>` },
    { k: "Code editor", q: "Return the sum of the numbers in the list.", v: "return sum(nums)",
      a: () => `<div class="m-code"><span class="k">def</span> total(nums):\n    <span class="k">return</span> sum(nums)\n\n<span class="n"># total([1, 2, 3]) → 6</span></div>` },
  ];
  function applyStep(fcard, step) {
    const mock = $(".mock", fcard);
    mock.dataset.step = String(step);
    $$(".subtabs button", fcard).forEach((b, i) => b.classList.toggle("on", i === step));
    if (mock.dataset.mock === "answer") {
      const v = ANSWER_VIEWS[step];
      $('[data-v="k"]', mock).textContent = v.k;
      $('[data-v="q"]', mock).textContent = v.q;
      $('[data-v="a"]', mock).innerHTML = v.a();
      $('[data-v="v"]', mock).textContent = v.v;
    }
    if (mock.dataset.mock === "page") {
      $('[data-v="pill"]', mock).textContent = ["Reading 5 questions…", "5 of 5 ready", "1 filled · 4 ready", "5 filled"][step];
    }
  }
  for (const fcard of $$(".fcard")) {
    const subs = $(".subtabs", fcard);
    let step = 0;
    let manual = false;
    let visible = false;
    applyStep(fcard, 0);
    $$("button", subs).forEach((b, i) => b.addEventListener("click", () => {
      manual = true; subs.classList.add("paused"); step = i; applyStep(fcard, i);
    }));
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.5 }).observe($(".mock", fcard));
    if (reduced.matches) { subs.classList.add("paused"); continue; }
    (async () => {
      for (;;) {
        await wait(4200);
        if (manual || !visible || document.hidden) continue;
        step = (step + 1) % 4;
        // restart the progress line on the newly active tab
        applyStep(fcard, step);
      }
    })();
  }
})();

// FAQ: one answer open at a time. Opening one smoothly closes the one that was open; both animate their height.
(() => {
  const items = [...document.querySelectorAll(".faq details")];
  if (!items.length) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const running = new WeakMap();
  const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

  function animate(item, open) {
    running.get(item)?.cancel();
    if (reduced.matches) {
      item.open = open;
      item.dataset.closing = "";
      return;
    }
    const summary = item.querySelector("summary");
    const borders = item.offsetHeight - item.clientHeight;
    const from = item.offsetHeight;
    if (open) item.open = true;
    const to = open ? item.offsetHeight : summary.offsetHeight + borders;
    item.style.overflow = "hidden";
    const anim = item.animate({ height: [`${from}px`, `${to}px`] }, { duration: open ? 320 : 260, easing: EASE });
    running.set(item, anim);
    anim.onfinish = () => {
      if (running.get(item) !== anim) return;
      running.delete(item);
      if (!open) { item.open = false; item.dataset.closing = ""; }
      item.style.overflow = "";
    };
    anim.oncancel = () => {
      if (running.get(item) === anim) running.delete(item);
      item.style.overflow = "";
    };
  }

  for (const item of items) {
    item.querySelector("summary").addEventListener("click", (e) => {
      e.preventDefault();
      const opening = !item.open || item.dataset.closing === "1";
      for (const other of items) {
        if (other !== item && other.open && other.dataset.closing !== "1") {
          other.dataset.closing = "1";
          animate(other, false);
        }
      }
      item.dataset.closing = opening ? "" : "1";
      animate(item, opening);
    });
  }
})();
