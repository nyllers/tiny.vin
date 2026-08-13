// Single source of truth for the top nav shown on every signed-in page.
// Each page just needs an empty `<div class="site-nav"></div>` and a
// `<script src="nav.js"></script>` right after it - add/remove/reorder a
// link here and it's correct everywhere, instead of editing five HTML
// files. The signed-out landing page intentionally keeps its own simpler,
// dropdown-less header (nothing to navigate to before signing in), so it's
// not built from this list.
const NAV_LINKS = [
  {
    href: "/",
    label: "URL",
    icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
  },
  {
    href: "/stats",
    label: "URL Statistics",
    icon: '<line x1="6" y1="20" x2="6" y2="14"></line><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line>',
  },
  {
    href: "/emails",
    label: "E-Mail",
    icon: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>',
  },
  {
    href: "/email-stats",
    label: "E-Mail Statistics",
    icon: '<line x1="6" y1="20" x2="6" y2="14"></line><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line>',
  },
  {
    href: "/api",
    label: "API",
    icon: '<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>',
  },
];

const SIGN_OUT_LINK = {
  href: "/auth/logout",
  label: "Sign out",
  icon: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>',
};

function navLinkHtml({ href, label, icon }, extraClass) {
  return `<a class="nav-link${extraClass ? ` ${extraClass}` : ""}" href="${href}">
    <svg class="nav-link-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${icon}
    </svg>
    <span>${label}</span>
  </a>`;
}

function renderSiteNav() {
  const root = document.querySelector(".site-nav");
  if (!root) return;

  root.innerHTML = `
    <button type="button" class="nav-toggle" aria-label="Menu" aria-haspopup="true" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <a class="wordmark" href="/">tin<span class="accent-dot">y.v</span>in</a>
    <nav class="nav-dropdown" hidden>
      ${NAV_LINKS.map((link) => navLinkHtml(link)).join("")}
      ${navLinkHtml(SIGN_OUT_LINK, "nav-link--signout")}
    </nav>
  `;
}

function initNavMenu() {
  renderSiteNav();

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
