function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  updateThemeButtons(theme);
}

function updateThemeButtons(theme) {
  document.querySelectorAll(".theme-toggle .theme-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeValue === theme);
  });
}

document.querySelectorAll(".theme-toggle .theme-btn").forEach((btn) => {
  btn.addEventListener("click", () => setTheme(btn.dataset.themeValue));
});

updateThemeButtons(document.documentElement.getAttribute("data-theme"));
