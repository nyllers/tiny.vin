function initNavMenu() {
  const toggle = document.querySelector(".nav-toggle");
  const dropdown = document.querySelector(".nav-dropdown");
  if (!toggle || !dropdown) return;

  function closeMenu() {
    dropdown.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    dropdown.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (dropdown.hidden) openMenu();
    else closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!dropdown.hidden && !event.target.closest(".site-nav")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  const currentPath = window.location.pathname;
  dropdown.querySelectorAll(".nav-link").forEach((link) => {
    if (new URL(link.href).pathname === currentPath) {
      link.setAttribute("aria-current", "page");
    }
  });
}

initNavMenu();
