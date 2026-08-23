// Renders the whole page header - the signed-in nav (hamburger, wordmark,
// dropdown), the theme toggle, and the donate button - from three empty
// placeholder divs. Single source of truth referenced by every page;
// previously this markup was duplicated across eight places (five signed-in
// pages, the signed-out landing page, privacy.html, and terms.html).
//
// Expected markup right before this script tag:
//   <div class="site-nav"></div>
//   <div class="theme-toggle" role="group" aria-label="Theme"></div>
//   <div class="donate-nav"></div>
//
// The signed-out landing page, privacy.html, and terms.html intentionally
// keep a simpler, dropdown-less nav (nothing to navigate to before signing
// in) by pre-filling .site-nav with just the wordmark themselves - if it
// already has content, renderSiteNav() leaves it alone.

const NAV_LINKS = [
  {
    href: "/",
    label: "Redirects",
    icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
  },
  {
    href: "/stats",
    label: "URL Statistics",
    icon: '<line x1="6" y1="20" x2="6" y2="14"></line><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line>',
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

const ADMIN_LINK = {
  href: "/admin",
  label: "Admin",
  icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path>',
};

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
  if (!root || root.hasChildNodes()) return;

  root.innerHTML = `
    <button type="button" class="nav-toggle" aria-label="Menu" aria-haspopup="true" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <a class="wordmark" href="/">
      <span>tiny</span>
      <span><span class="accent-dot">.</span>vin</span>
    </a>
    <nav class="nav-dropdown" hidden>
      ${NAV_LINKS.map((link) => navLinkHtml(link)).join("")}
      ${navLinkHtml(SIGN_OUT_LINK, "nav-link--signout")}
    </nav>
  `;
}

// Only admins get the Admin nav link - the session cookie is HttpOnly, so
// the only way to know from here is to ask the server.
async function maybeShowAdminLink(dropdown) {
  let data;
  try {
    const response = await fetch("/api/session");
    if (!response.ok) return;
    data = await response.json();
  } catch {
    return;
  }

  if (!data.admin) return;

  const signOutLink = dropdown.querySelector(".nav-link--signout");
  signOutLink.insertAdjacentHTML("beforebegin", navLinkHtml(ADMIN_LINK));
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

  function markCurrentPage() {
    const currentPath = window.location.pathname;
    dropdown.querySelectorAll(".nav-link").forEach((link) => {
      if (new URL(link.href).pathname === currentPath) {
        link.setAttribute("aria-current", "page");
      }
    });
  }

  // Menu interactivity and the current-page marker don't depend on admin
  // status, so they're wired up immediately rather than waiting on the
  // /api/session round trip - re-marked once that resolves in case it
  // inserted the Admin link and it's the current page.
  markCurrentPage();
  maybeShowAdminLink(dropdown).then(markCurrentPage);
}

function renderThemeToggle() {
  const root = document.querySelector(".theme-toggle");
  if (!root || root.hasChildNodes()) return;

  root.innerHTML = `
    <button type="button" class="theme-btn" data-theme-value="light">Light</button>
    <button type="button" class="theme-btn" data-theme-value="dark">Dark</button>
  `;
}

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

function initThemeToggle() {
  renderThemeToggle();

  document.querySelectorAll(".theme-toggle .theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.themeValue);
      renderDonateButton();
    });
  });

  updateThemeButtons(document.documentElement.getAttribute("data-theme"));
}

function renderDonateNav() {
  const root = document.querySelector(".donate-nav");
  if (!root || root.hasChildNodes()) return;

  root.innerHTML = '<div id="donate-button-container"></div>';
}

function donateButtonImageSrc() {
  const theme = document.documentElement.getAttribute("data-theme");
  return theme === "dark" ? "/top-middle-button-dark.svg" : "/top-middle-button.svg";
}

// Called by the PayPal SDK script tag's onload attribute, since that script
// loads independently of this file - relying on tag order alone would be
// fragile once this file's own tag moved earlier in the page.
function renderDonateButton() {
  if (!window.PayPal) return;
  const container = document.getElementById("donate-button-container");
  if (!container) return;
  container.innerHTML = '<div id="donate-button"></div>';
  PayPal.Donation.Button({
    env: "production",
    hosted_button_id: "MDJZUR6T8QP3Y",
    image: {
      src: donateButtonImageSrc(),
      alt: "Donate with PayPal",
      title: "Donate with PayPal",
    },
  }).render("#donate-button");
}

function updateDonateVisibility() {
  const nav = document.querySelector(".donate-nav");
  if (!nav) return;
  const scrollable = document.documentElement.scrollHeight > document.documentElement.clientHeight + 1;
  const atTop = window.scrollY <= 0;
  nav.classList.toggle("donate-nav--hidden", scrollable && !atTop);
}

function initDonateNav() {
  renderDonateNav();
  window.addEventListener("scroll", updateDonateVisibility, { passive: true });
  window.addEventListener("resize", updateDonateVisibility);
  updateDonateVisibility();
}

initNavMenu();
initThemeToggle();
initDonateNav();
