/**
 * First-run guide: three short cards, then a spotlight tour over the real toolbar.
 * Shown once, reopened with the help button.
 */

const ONBOARDING_DONE_KEY = "onboardingDoneV5";

const ONBOARDING_CARDS = [
  {
    visual: `
      <div class="mini-panel">
        <div class="mini-page">
          <div class="mini-line" style="width: 70%"></div>
          <div class="mini-line" style="width: 90%"></div>
          <div class="mini-line" style="width: 55%"></div>
        </div>
        <div class="mini-side">
          <div class="mini-button"></div>
          <div class="mini-line" style="width: 80%"></div>
          <div class="mini-line" style="width: 60%"></div>
        </div>
      </div>`,
    tags: ["Free forever", "No data collected"],
    title: "Gemini, right here",
    body: "Your own Gemini account next to any page, completely free. We never see your data: everything stays between you, Gemini, and your Google account.",
  },
  {
    visual: `
      <div class="flow">
        <div class="flow-step"><svg class="icon"><use href="#i-camera" /></svg>Screenshot</div>
        <div class="flow-arrow"></div>
        <div class="flow-step"><svg class="icon"><use href="#i-spark" /></svg>Gemini</div>
        <div class="flow-arrow"></div>
        <div class="flow-step"><svg class="icon"><use href="#i-fill" /></svg>Filled in</div>
      </div>`,
    tags: ["Fully automatic"],
    title: "One click. That's it.",
    body: "Press What's the answer?, or the hotkey: Option+Shift+A on Mac, Alt+Shift+A on Windows. The rest happens on its own: screenshot, ask Gemini, format the answer, copy it, and fill it when the page supports that.",
  },
  {
    visual: `
      <div class="hl-demo">
        <div class="hl-line">Find <span class="hl-sel">F′(x) if F(x) = sin(x⁴)</span></div>
        <div class="hl-menu"><svg class="icon"><use href="#i-spark" /></svg>Ask Nook</div>
        <div class="hl-bubble"><span>Answer</span>4x^3cos(x^4)</div>
      </div>`,
    tags: ["New"],
    title: "Or just highlight it",
    body: "Highlight a question on any page, right-click, and pick Ask Nook. A small bubble shows the answer right next to it.",
  },
  {
    visual: `
      <div class="paste-demo">
        <div class="paste-row">4x^3cos(x^4)<svg class="icon"><use href="#i-check" /></svg></div>
        <div class="paste-row paste-target">Answer box<kbd>Check</kbd></div>
      </div>`,
    title: "Filled in for you",
    body: "Auto fill puts the answer in the box on Khan Academy today (more sites coming soon). If it can't find a place, it copies for you instead — you paste with Ctrl+V.",
    autoFillToggle: true,
    autoCopyToggle: true,
  },
];

const TOUR_STEPS = [
  {
    target: "answer",
    tag: "Automatic",
    title: "What's the answer?",
    body: "One click, or the hotkey Option+Shift+A on Mac and Alt+Shift+A on Windows. Screenshot, ask Gemini, format the answer, copy it, and fill it when we can. On Khan Academy you just press Check afterward.",
  },
  {
    target: "autofill",
    tag: "Khan Academy",
    title: "Auto fill",
    body: "On: we type into answer boxes and pick multiple-choice options on Khan Academy (more sites coming soon). Off: use Fill on the answer card when you want it placed.",
  },
  {
    target: "autocopy",
    title: "Auto copy",
    body: "On: every answer is copied to your clipboard too. If fill can't find a box or choice, we copy automatically so you can paste with Ctrl+V.",
  },
  {
    target: "answercard",
    title: "Answer card",
    body: "Shows the formatted answer after each run. Fill tries the page again; Copy is always one click. Click the answer text to copy anytime.",
  },
  {
    target: "screenshot",
    tag: "Manual",
    title: "Screenshot, then ask your own question",
    body: "Don't want the automatic answer? This only attaches the page to Gemini. Then type any question, like you normally would.",
  },
  {
    target: "gemini",
    title: "Your normal Gemini, always here",
    body: "Don't need the special features right now? Your regular Gemini is always in the side panel. Chat below like you would on gemini.google.com.",
  },
  {
    target: "icons",
    title: "Help, reload, sign in",
    body: "Sign in to Google once in the new tab, then press reload. Open this guide again with the help button.",
  },
];

/**
 * @param {{
 *   getAutoCopy: () => boolean, setAutoCopy: (on: boolean) => void,
 *   getAutoFill: () => boolean, setAutoFill: (on: boolean) => void,
 * }} settings
 */
function createOnboarding(settings) {
  const overlay = document.getElementById("onboarding");
  const content = document.getElementById("card-content");
  const dots = document.getElementById("card-dots");
  const nextBtn = document.getElementById("card-next");
  const skipBtn = document.getElementById("card-skip");

  const tour = document.getElementById("tour");
  const tip = document.getElementById("tour-tip");
  const tipStep = document.getElementById("tour-step");
  const tipTitle = document.getElementById("tour-title");
  const tipBody = document.getElementById("tour-body");
  const tourNext = document.getElementById("tour-next");
  const tourSkip = document.getElementById("tour-skip");

  const cardEl = overlay.querySelector(".card");

  let card = 0;
  let tourStep = 0;
  let spotlit = null;
  let showingDemo = false;
  let answerBarWasHidden = true;
  let answerPreviewText = false;

  const answerBar = document.getElementById("answer-bar");
  const answerTextEl = document.getElementById("answer-text");

  function setTourAnswerPreview(on) {
    if (!answerBar || !answerTextEl) return;
    if (on) {
      answerBarWasHidden = answerBar.hidden;
      answerPreviewText = !answerTextEl.textContent.trim();
      if (answerPreviewText) answerTextEl.textContent = "4x^3cos(x^4)";
      answerBar.hidden = false;
      return;
    }
    if (answerPreviewText) {
      answerTextEl.textContent = "";
      answerBar.hidden = answerBarWasHidden;
      answerPreviewText = false;
    } else {
      answerBar.hidden = answerBarWasHidden;
    }
  }

  function replayAnimation(element) {
    element.classList.remove("is-entering");
    void element.offsetWidth;
    element.classList.add("is-entering");
  }

  function renderCard() {
    const current = ONBOARDING_CARDS[card];
    const isLast = card === ONBOARDING_CARDS.length - 1;

    content.innerHTML = `
      <div class="card-visual">${current.visual}</div>
      ${current.tags ? `<div class="tags">${current.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>` : ""}
      <h2 id="card-title" class="card-title">${current.title}</h2>
      <p class="card-body">${current.body}</p>
      ${
        current.autoCopyToggle
          ? `<label class="setting">
              <span>Auto copy answers</span>
              <input type="checkbox" data-autocopy-toggle />
              <span class="switch" aria-hidden="true"></span>
            </label>`
          : ""
      }
      ${
        current.autoFillToggle
          ? `<label class="setting">
              <span>Auto fill answers</span>
              <input type="checkbox" data-autofill-toggle />
              <span class="switch" aria-hidden="true"></span>
            </label>`
          : ""
      }`;
    replayAnimation(content);

    dots.innerHTML = ONBOARDING_CARDS.map((_, i) => `<span class="${i === card ? "active" : ""}"></span>`).join("");
    nextBtn.textContent = isLast ? "Show me around" : "Next";

    const copyToggle = content.querySelector("[data-autocopy-toggle]");
    if (copyToggle) {
      copyToggle.checked = settings.getAutoCopy();
      copyToggle.addEventListener("change", () => settings.setAutoCopy(copyToggle.checked));
    }
    const fillToggle = content.querySelector("[data-autofill-toggle]");
    if (fillToggle) {
      fillToggle.checked = settings.getAutoFill();
      fillToggle.addEventListener("change", () => settings.setAutoFill(fillToggle.checked));
    }
  }

  function clearSpotlight() {
    spotlit?.classList.remove("is-spotlit");
    spotlit = null;
    setTourAnswerPreview(false);
  }

  function positionTip(target) {
    const rect = target.getBoundingClientRect();
    const gap = 12;
    const below = rect.bottom + gap;
    const above = rect.top - gap - tip.offsetHeight;
    if (below + tip.offsetHeight < window.innerHeight) {
      tip.style.top = `${below}px`;
    } else if (above >= gap) {
      tip.style.top = `${above}px`;
    } else {
      tip.style.top = `${rect.top + gap * 2}px`;
    }
  }

  function renderTourStep() {
    const current = TOUR_STEPS[tourStep];
    const isLast = tourStep === TOUR_STEPS.length - 1;

    clearSpotlight();
    if (current.target === "answercard") {
      setTourAnswerPreview(true);
    }
    spotlit = document.querySelector(`[data-tour="${current.target}"]`);
    spotlit?.classList.add("is-spotlit");

    tipStep.innerHTML = `${tourStep + 1} / ${TOUR_STEPS.length}${current.tag ? `<span class="tag">${current.tag}</span>` : ""}`;
    tipTitle.textContent = current.title;
    tipBody.textContent = current.body;
    tourNext.textContent = "Next";
    tourSkip.hidden = isLast;

    tip.style.bottom = "";
    if (spotlit && spotlit.getBoundingClientRect().height > 0) {
      positionTip(spotlit);
    } else {
      tip.style.top = "auto";
      tip.style.bottom = "14px";
    }
    replayAnimation(tip);
  }

  function startTour() {
    overlay.hidden = true;
    tourStep = 0;
    tour.hidden = false;
    renderTourStep();
    tourNext.focus();
  }

  /** Optional last step: a looping demo the user can choose to play. */
  function showDemoCard() {
    tour.hidden = true;
    clearSpotlight();
    showingDemo = true;
    cardEl.classList.add("card-demo");

    content.innerHTML = `
      <div class="demo-frame">
        <button type="button" class="demo-play" data-demo-play>
          <svg class="icon"><use href="#i-play" /></svg>
          Watch the demo
        </button>
      </div>
      <div class="tags"><span class="tag">Optional</span></div>
      <h2 id="card-title" class="card-title">See it in action</h2>
      <p class="card-body">A 15-second demo on a Khan Academy question. Or skip it, you're all set.</p>`;
    replayAnimation(content);

    content.querySelector("[data-demo-play]").addEventListener("click", () => {
      content.querySelector(".demo-frame").innerHTML = `<iframe src="demo.html" title="Demo"></iframe>`;
    });

    dots.innerHTML = "";
    skipBtn.hidden = true;
    nextBtn.textContent = "Start using it";
    overlay.hidden = false;
    nextBtn.focus();
  }

  function finish() {
    overlay.hidden = true;
    tour.hidden = true;
    clearSpotlight();
    showingDemo = false;
    cardEl.classList.remove("card-demo");
    skipBtn.hidden = false;
    content.innerHTML = "";
    chrome.storage.local.set({ [ONBOARDING_DONE_KEY]: true });
  }

  function open() {
    card = 0;
    showingDemo = false;
    cardEl.classList.remove("card-demo");
    skipBtn.hidden = false;
    tour.hidden = true;
    clearSpotlight();
    renderCard();
    overlay.hidden = false;
    nextBtn.focus();
  }

  nextBtn.addEventListener("click", () => {
    if (showingDemo) {
      finish();
      return;
    }
    if (card === ONBOARDING_CARDS.length - 1) {
      startTour();
      return;
    }
    card++;
    renderCard();
  });

  tourNext.addEventListener("click", () => {
    if (tourStep === TOUR_STEPS.length - 1) {
      showDemoCard();
      return;
    }
    tourStep++;
    renderTourStep();
  });

  skipBtn.addEventListener("click", finish);
  tourSkip.addEventListener("click", finish);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (!overlay.hidden || !tour.hidden)) finish();
  });

  window.addEventListener("resize", () => {
    if (!tour.hidden && spotlit) positionTip(spotlit);
  });

  async function openIfFirstRun() {
    const stored = await chrome.storage.local.get(ONBOARDING_DONE_KEY);
    if (!stored[ONBOARDING_DONE_KEY]) open();
  }

  return { open, openIfFirstRun };
}
