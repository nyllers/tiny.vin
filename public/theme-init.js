(function () {
  var stored = localStorage.getItem("theme");
  var theme = stored || "dark";
  document.documentElement.setAttribute("data-theme", theme);
})();
