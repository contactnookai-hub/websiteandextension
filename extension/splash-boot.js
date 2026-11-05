/**
 * Runs in the head, before the panel paints.
 * Returning opens skip the intro. First open cannot get stuck on it.
 */
const SPLASH_KEY = "nookSplashV55";
try {
  if (localStorage.getItem(SPLASH_KEY) === "1") {
    document.documentElement.classList.add("splash-seen");
  }
} catch {
  /* If storage is blocked, the intro still shows once. */
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.documentElement.classList.contains("splash-seen")) return;
  setTimeout(() => {
    const splash = document.getElementById("splash");
    if (!splash || splash.classList.contains("is-out")) return;
    try {
      localStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* Still uncover the panel. */
    }
    document.documentElement.classList.add("splash-seen");
  }, 8000);
});
