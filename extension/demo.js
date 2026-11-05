/**
 * Plays the "What's the answer?" flow on a loop: click, screenshot, Gemini, formatted answer,
 * copied, filled into the mock Khan Academy exercise. The user only presses Check.
 * Switches to a portrait layout in narrow frames.
 */

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const cursor = $("cursor");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let runId = 0;

function isPortrait() {
  return innerWidth < 700;
}

function fit() {
  stage.classList.toggle("portrait", isPortrait());
  const pad = isPortrait() ? 12 : 48;
  const scale = Math.min(
    (innerWidth - pad) / stage.offsetWidth,
    (innerHeight - pad) / stage.offsetHeight,
    isPortrait() ? 1.6 : 1.4
  );
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

/** Rect of an element in the stage's unscaled coordinates. */
function rectOf(el) {
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const scale = s.width / stage.offsetWidth;
  return {
    x: (r.left - s.left) / scale,
    y: (r.top - s.top) / scale,
    w: r.width / scale,
    h: r.height / scale,
  };
}

function centerOf(el, dx = 0, dy = 0) {
  const r = rectOf(el);
  return { x: r.x + r.w / 2 + dx, y: r.y + r.h / 2 + dy };
}

function moveCursor(point) {
  cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
}

function setStep(n, headline) {
  document.querySelectorAll(".step").forEach((step) => {
    const i = Number(step.dataset.step);
    step.classList.toggle("active", i === n);
    step.classList.toggle("done", i < n);
  });
  $("headline").innerHTML = headline;
}

function setStatus(text, done = false) {
  const status = $("status");
  status.textContent = text;
  status.classList.toggle("idle", !text);
  status.classList.toggle("done", done);
}

function reset() {
  setStep(0, "<strong>One click.</strong> Watch what happens on its own.");
  setStatus("");
  ["answer", "bubble-user", "bubble-model", "feedback"].forEach((id) => $(id).classList.remove("show"));
  $("answer-btn").classList.remove("busy", "pressed");
  $("answer-input").classList.remove("focus");
  $("ka-footer").classList.remove("correct");
  $("dot-3").classList.remove("done");
  $("check-btn").classList.remove("next");
  $("check-btn").textContent = "Check";
  $("typed").textContent = "";
  $("answer-copy").classList.remove("is-copied");
  $("copy-label").textContent = "Copy";

  const shot = $("shot");
  shot.style.transition = "none";
  shot.style.opacity = "0";
  shot.style.transform = "none";
  void shot.offsetWidth;
  shot.style.transition = "";

  const page = rectOf($("page"));
  moveCursor({ x: page.x + page.w * 0.55, y: page.y + page.h * 0.7 });
}

async function play() {
  const id = ++runId;
  const wait = async (ms) => {
    await sleep(ms);
    if (id !== runId) throw new Error("stale");
  };
  const click = async () => {
    cursor.classList.add("click");
    await wait(160);
    cursor.classList.remove("click");
  };

  try {
    reset();
    await wait(1200);

    const answerBtn = $("answer-btn");
    moveCursor(centerOf(answerBtn, -30, 4));
    await wait(1000);
    answerBtn.classList.add("pressed");
    await click();
    answerBtn.classList.remove("pressed");
    answerBtn.classList.add("busy");

    setStep(1, "Takes the screenshot <strong>for you</strong>");
    setStatus("Capturing the screen…");
    const flash = $("flash");
    flash.classList.remove("go");
    void flash.offsetWidth;
    flash.classList.add("go");
    await wait(350);

    const shot = $("shot");
    const page = rectOf($("page"));
    Object.assign(shot.style, {
      left: `${page.x}px`,
      top: `${page.y}px`,
      width: `${page.w}px`,
      height: `${page.h}px`,
      opacity: "1",
    });
    await wait(250);
    const thumb = rectOf($("thumb"));
    shot.style.transform = `translate(${thumb.x - page.x}px, ${thumb.y - page.y}px) scale(${thumb.w / page.w}, ${thumb.h / page.h})`;
    await wait(450);
    shot.style.opacity = "0";

    setStep(2, "Asks Gemini <strong>for you</strong>");
    setStatus("Asking Gemini…");
    $("bubble-user").classList.add("show");
    await wait(1500);

    setStep(3, "Formats it <strong>for Khan Academy</strong>");
    $("bubble-model").classList.add("show");
    await wait(1100);

    answerBtn.classList.remove("busy");
    $("answer").classList.add("show");

    setStep(4, "Copies it <strong>for you</strong>");
    setStatus("Copied to your clipboard.");
    $("answer-copy").classList.add("is-copied");
    $("copy-label").textContent = "Copied";
    await wait(1200);

    setStep(5, "Fills it in <strong>for you</strong>");
    setStatus("Filling in the answer…");
    const input = $("answer-input");
    input.classList.add("focus");
    await wait(350);
    $("typed").textContent = "4x^3cos(x^4)";
    setStatus("Filled in. Check it, then press Check.", true);
    await wait(1400);

    setStep(6, "All you do is press <strong>Check</strong>");
    const check = $("check-btn");
    moveCursor(centerOf(check, -6, 4));
    await wait(950);
    await click();
    input.classList.remove("focus");
    $("ka-footer").classList.add("correct");
    $("feedback").classList.add("show");
    $("dot-3").classList.add("done");
    check.classList.add("next");
    check.textContent = "Next question";
    setStep(7, "<strong>Screenshot, ask, format, copy, fill.</strong> Can't fill? It copies instead.");
    await wait(3400);

    play();
  } catch {
    // A newer run took over (the frame was resized).
  }
}

let lastPortrait = isPortrait();
addEventListener("resize", () => {
  fit();
  if (isPortrait() !== lastPortrait) {
    lastPortrait = isPortrait();
    play();
  }
});

fit();
play();
