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

function createCardsSectionFromElements(headingText, cardElements) {
  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = headingText;
  const grid = document.createElement("div");
  grid.className = "url-cards";
  grid.append(...cardElements);
  requestAnimationFrame(() => packMasonryRows(grid));
  const fragment = document.createDocumentFragment();
  fragment.append(heading, grid);
  return fragment;
}

function createCardsSection(headingText, items, renderItem) {
  return createCardsSectionFromElements(headingText, items.map(renderItem));
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

// Wires "click outside" and "Escape" to call onDismiss, and returns a
// cleanup() that unwires those and restores focus to whatever had it
// before the modal opened. Shared plumbing for every modal on the site -
// each one still owns its own open/close semantics on top of this.
function bindModalDismissal(overlay, onDismiss) {
  const previouslyFocused = document.activeElement;

  function onOverlayClick(event) {
    if (event.target === overlay) onDismiss();
  }

  function onKeydown(event) {
    if (event.key === "Escape") onDismiss();
  }

  overlay.addEventListener("click", onOverlayClick);
  document.addEventListener("keydown", onKeydown);

  return function cleanup() {
    overlay.removeEventListener("click", onOverlayClick);
    document.removeEventListener("keydown", onKeydown);
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  };
}

// Single-button modal: opens overlay, focuses closeBtn, and closes (hiding
// + cleaning up) on close-button click, outside click, or Escape. For
// modals with more than one exit path (e.g. confirm/cancel with different
// results), build directly on bindModalDismissal instead.
function openModal(overlay, closeBtn) {
  function close() {
    overlay.hidden = true;
    closeBtn.removeEventListener("click", close);
    cleanup();
  }

  const cleanup = bindModalDismissal(overlay, close);
  closeBtn.addEventListener("click", close);
  overlay.hidden = false;
  closeBtn.focus();
}

function confirmAction(message, { confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirm-modal-overlay");
    const messageEl = document.getElementById("confirm-modal-message");
    const confirmBtn = document.getElementById("confirm-modal-confirm");
    const cancelBtn = document.getElementById("confirm-modal-cancel");

    messageEl.textContent = message;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle("modal-btn--confirm", danger);
    confirmBtn.classList.toggle("modal-btn--primary", !danger);

    function close(result) {
      overlay.hidden = true;
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      cleanup();
      resolve(result);
    }

    const cleanup = bindModalDismissal(overlay, () => close(false));

    function onConfirm() {
      close(true);
    }

    function onCancel() {
      close(false);
    }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    overlay.hidden = false;
    cancelBtn.focus();
  });
}

function confirmDelete(message) {
  return confirmAction(message, { confirmLabel: "Delete", danger: true });
}

function createAddButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-btn active";
  button.innerHTML = `<span>${label}</span>`;
  return button;
}

function createSaveSuffixButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn cancel-btn";
  button.innerHTML = `<span>Save</span>`;
  return button;
}

function createInlineCodeInputRow({ endpoint, buildBody, prefixText, suffixText, placeholder, onSuccess, onCancel }) {
  const wrapper = document.createElement("div");
  wrapper.className = "url-card-suffix-wrapper";

  const row = document.createElement("div");
  row.className = "url-card-copy-row";

  if (prefixText) {
    const prefix = document.createElement("span");
    prefix.className = "url-card-suffix-prefix";
    prefix.textContent = prefixText;
    row.append(prefix);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "url-card-suffix-input";
  input.placeholder = placeholder;
  row.append(input);

  if (suffixText) {
    const suffix = document.createElement("span");
    suffix.className = "url-card-suffix-prefix";
    suffix.textContent = suffixText;
    row.append(suffix);
  }

  const saveBtn = createSaveSuffixButton();
  const saveBtnLabel = saveBtn.querySelector("span");
  row.append(saveBtn);

  const error = document.createElement("p");
  error.className = "url-card-suffix-error";

  function updateSaveButtonLabel() {
    const hasValue = Boolean(input.value.trim());
    saveBtnLabel.textContent = hasValue ? "Save" : "Cancel";
    saveBtn.classList.toggle("save-btn", hasValue);
    saveBtn.classList.toggle("cancel-btn", !hasValue);
  }

  async function submitValue() {
    const value = input.value.trim();
    if (!value) {
      onCancel();
      return;
    }

    saveBtn.disabled = true;
    error.textContent = "";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBody(value)),
      });

      if (!response.ok) {
        const data = await response.json();
        error.textContent = data.error || "Something went wrong.";
        saveBtn.disabled = false;
        return;
      }

      await onSuccess(response);
    } catch {
      error.textContent = "Network error, try again.";
      saveBtn.disabled = false;
    }
  }

  saveBtn.addEventListener("click", submitValue);
  input.addEventListener("input", updateSaveButtonLabel);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitValue();
    if (event.key === "Escape") onCancel();
  });
  updateSaveButtonLabel();

  wrapper.append(row, error);
  return wrapper;
}
