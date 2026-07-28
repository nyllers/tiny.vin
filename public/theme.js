function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  updateThemeButtons(theme);
}

function updateThemeButtons(theme) {
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeValue === theme);
  });
}

document.querySelectorAll(".theme-btn").forEach((btn) => {
  btn.addEventListener("click", () => setTheme(btn.dataset.themeValue));
});

const storedTheme = document.documentElement.getAttribute("data-theme");
const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
updateThemeButtons(storedTheme || (systemPrefersDark ? "dark" : "light"));
