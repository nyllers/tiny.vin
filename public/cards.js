async function fetchJsonOrNull(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function createOriginalUrlRow(originalUrl) {
  const row = document.createElement("div");
  row.className = "url-card-row";
  const value = document.createElement("span");
  value.className = "url-card-value url-card-value--original";
  value.title = originalUrl;
  value.textContent = originalUrl;
  row.append(value);
  return row;
}

function packMasonryRows(grid) {
  const style = window.getComputedStyle(grid);
  const rowHeight = parseFloat(style.gridAutoRows) || 1;
  const gap = parseFloat(style.columnGap) || 0;

  for (const card of grid.children) {
    const span = Math.ceil((card.getBoundingClientRect().height + gap) / rowHeight);
    card.style.gridRowEnd = `span ${span}`;
  }
}

let masonryResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(masonryResizeTimer);
  masonryResizeTimer = setTimeout(() => {
    document.querySelectorAll(".url-cards").forEach(packMasonryRows);
  }, 150);
});

function createCardsSection(headingText, items, renderItem) {
  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = headingText;
  const grid = document.createElement("div");
  grid.className = "url-cards";
  for (const item of items) {
    grid.appendChild(renderItem(item));
  }
  requestAnimationFrame(() => packMasonryRows(grid));
  const fragment = document.createDocumentFragment();
  fragment.append(heading, grid);
  return fragment;
}

async function copyTextToClipboard(text, displayEl) {
  try {
    await navigator.clipboard.writeText(text);
    displayEl.textContent = "Copied to clipboard!";
    setTimeout(() => {
      displayEl.textContent = text;
    }, 1000);
  } catch {
    displayEl.textContent = "Could not copy to clipboard";
    setTimeout(() => {
      displayEl.textContent = text;
    }, 1000);
  }
}

function createCopyIconButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn copy-link-btn";
  button.title = "Copy to clipboard";
  button.setAttribute("aria-label", "Copy to clipboard");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`;
  return button;
}

function createCopyableTextGroup(text) {
  const group = document.createElement("span");
  group.className = "url-card-copy-group";
  group.title = "Copy to clipboard";
  const value = document.createElement("span");
  value.className = "url-card-value url-card-copy-text";
  value.textContent = text;
  const copyBtn = createCopyIconButton();
  const copy = () => copyTextToClipboard(text, value);
  value.addEventListener("click", copy);
  copyBtn.addEventListener("click", copy);
  group.addEventListener("click", copy);
  group.append(value, copyBtn);
  return group;
}

function confirmAction(message, { confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirm-modal-overlay");
    const messageEl = document.getElementById("confirm-modal-message");
    const confirmBtn = document.getElementById("confirm-modal-confirm");
    const cancelBtn = document.getElementById("confirm-modal-cancel");
    const previouslyFocused = document.activeElement;

    messageEl.textContent = message;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle("modal-btn--confirm", danger);
    confirmBtn.classList.toggle("modal-btn--primary", !danger);
    overlay.hidden = false;
    cancelBtn.focus();

    function close(result) {
      overlay.hidden = true;
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlayClick);
      document.removeEventListener("keydown", onKeydown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
      resolve(result);
    }

    function onConfirm() {
      close(true);
    }

    function onCancel() {
      close(false);
    }

    function onOverlayClick(event) {
      if (event.target === overlay) close(false);
    }

    function onKeydown(event) {
      if (event.key === "Escape") close(false);
    }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKeydown);
  });
}

function confirmDelete(message) {
  return confirmAction(message, { confirmLabel: "Delete", danger: true });
}
