async function fetchJsonOrNull(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function createEditTitleButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn edit-title-btn";
  button.title = "Edit title";
  button.setAttribute("aria-label", "Edit title");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
  </svg>`;
  return button;
}

// Self-contained: fetches/persists the title itself (PATCH
// /api/redirects/title) rather than bubbling a callback up to the caller,
// since every caller wants the same behavior - update the title in place,
// no full list reload needed. `maxTitleLength` comes from the server (see
// loadRedirects in script.js) rather than being hardcoded here a second
// time, with 300 as a fallback only if that field is ever missing.
function createEditableTitleRow(originalUrl, initialTitle, maxTitleLength = 300) {
  const container = document.createElement("span");
  container.className = "url-card-title-row";
  let title = initialTitle;

  // Editing a title changes the row's height (a longer/shorter title, or
  // swapping in the input row), which the masonry grid's cached
  // grid-row-end span doesn't know about on its own - repack after every
  // render so the card never overlaps its neighbors. Deferred a frame so it
  // never fights a just-triggered focus scroll, and re-resolves the grid
  // lazily in case the card was detached (e.g. by an unrelated full list
  // reload) between scheduling and running.
  function repackGrid() {
    requestAnimationFrame(() => {
      const grid = container.closest(".url-cards");
      if (grid) packMasonryRows(grid);
    });
  }

  function showDisplay() {
    container.textContent = "";
    const titleEl = document.createElement("span");
    titleEl.className = title ? "url-card-title" : "url-card-title url-card-title--placeholder";
    titleEl.textContent = title || "Add a title";
    container.append(titleEl);

    const editBtn = createEditTitleButton();
    editBtn.addEventListener("click", showEditor);
    container.append(editBtn);
    repackGrid();
  }

  function showEditor() {
    container.textContent = "";
    const inputRow = createInlineCodeInputRow({
      endpoint: "/api/redirects/title",
      method: "PATCH",
      buildBody: (value) => ({ destination: originalUrl, title: value }),
      prefixText: null,
      suffixText: null,
      placeholder: "Add a title",
      initialValue: title || "",
      maxLength: maxTitleLength,
      allowEmptySubmit: true,
      onSuccess: async (response) => {
        const data = await response.json();
        // The card can have been torn down and rebuilt from scratch (e.g. a
        // full loadRedirects() triggered by an unrelated action elsewhere on
        // the page) while this request was in flight - skip mutating/
        // repacking a copy the user can no longer see.
        if (!container.isConnected) return;
        title = data.title;
        showDisplay();
      },
      onCancel: showDisplay,
    });
    container.append(inputRow);
    inputRow.querySelector("input").focus();
    repackGrid();
  }

  showDisplay();
  return container;
}

function createOriginalUrlRow(originalUrl, title, { editable = false, maxTitleLength } = {}) {
  const row = document.createElement("div");
  row.className = "url-card-row";

  if (editable) {
    row.append(createEditableTitleRow(originalUrl, title, maxTitleLength));
  } else if (title) {
    const titleEl = document.createElement("span");
    titleEl.className = "url-card-title";
    titleEl.textContent = title;
    row.append(titleEl);
  }

  const value = document.createElement("span");
  value.className = "url-card-value url-card-value--original";
  value.title = originalUrl;
  value.textContent = originalUrl;
  row.append(value);
  return row;
}

function createTitleOnlyRow(title) {
  const row = document.createElement("div");
  row.className = "url-card-row";
  const titleEl = document.createElement("span");
  titleEl.className = "url-card-title";
  titleEl.textContent = title;
  row.append(titleEl);
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

function createCardsGrid(cardElements) {
  const grid = document.createElement("div");
  grid.className = "url-cards";
  grid.append(...cardElements);
  requestAnimationFrame(() => packMasonryRows(grid));
  return grid;
}

function createCardsSectionFromElements(headingText, cardElements) {
  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = headingText;
  const fragment = document.createDocumentFragment();
  fragment.append(heading, createCardsGrid(cardElements));
  return fragment;
}

function createCardsSection(headingText, items, renderItem) {
  return createCardsSectionFromElements(headingText, items.map(renderItem));
}

// `restoreText` is what displayEl goes back to after the confirmation - it
// differs from `text` when what's copied isn't exactly what's shown (see
// withHttps).
async function copyTextToClipboard(text, displayEl, restoreText = text) {
  try {
    await navigator.clipboard.writeText(text);
    displayEl.textContent = "Copied to clipboard!";
    setTimeout(() => {
      displayEl.textContent = restoreText;
    }, 1000);
  } catch {
    displayEl.textContent = "Could not copy to clipboard";
    setTimeout(() => {
      displayEl.textContent = restoreText;
    }, 1000);
  }
}

// Short URLs are shown without a scheme (tiny.vin/abc) but copied with an
// explicit https:// so a pasted link is always recognized as a link. Replaces
// any scheme already on `url` rather than stacking a second one.
function withHttps(url) {
  return `https://${url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")}`;
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

// `copyText` is what lands on the clipboard when it should differ from the
// displayed `text` - only URLs opt in (e-mail aliases and the API key are
// copied exactly as shown).
function createCopyableTextGroup(text, { copyText = text } = {}) {
  const group = document.createElement("span");
  group.className = "url-card-copy-group";
  group.title = "Copy to clipboard";
  const value = document.createElement("span");
  value.className = "url-card-value url-card-copy-text";
  value.textContent = text;
  const copyBtn = createCopyIconButton();
  // One listener on the group only: clicks on the text or the icon (or a
  // keyboard activation of the icon button) all bubble up to it. Listening
  // on those children as well fired two overlapping clipboard writes per click.
  group.addEventListener("click", () => copyTextToClipboard(copyText, value, text));
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

// Only shown when allowEmptySubmit is set (see createInlineCodeInputRow):
// once an empty field is a legitimate value to submit, the Save/Cancel
// button can no longer double as a "back out" affordance for an empty
// field, so this gives editing flows an explicit, always-visible way to
// discard changes without saving.
function createCancelEditButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn cancel-edit-btn";
  button.title = "Cancel";
  button.setAttribute("aria-label", "Cancel editing");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 6 6 18"/>
    <path d="M6 6l12 12"/>
  </svg>`;
  return button;
}

// Serves two jobs, distinguished by allowEmptySubmit: creating a brand-new
// suffixed value (add path/subdomain/alias - default false, so an empty
// field just cancels, nothing to create) and editing an existing free-text
// value where empty is itself a meaningful, submittable choice (edit title
// - true, since an empty title clears it back to none).
function createInlineCodeInputRow({
  endpoint,
  method = "POST",
  buildBody,
  prefixText,
  suffixText,
  placeholder,
  initialValue = "",
  maxLength,
  allowEmptySubmit = false,
  onSuccess,
  onCancel,
}) {
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
  input.value = initialValue;
  // maxLength alone doesn't retroactively trim a pre-filled value that's
  // already longer than it (the DOM attribute only constrains future
  // typing/pasting) - truncate up front so a value that predates this cap
  // doesn't fail an untouched Save.
  if (maxLength) {
    input.maxLength = maxLength;
    if (input.value.length > maxLength) input.value = input.value.slice(0, maxLength);
  }
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

  if (allowEmptySubmit) {
    const cancelBtn = createCancelEditButton();
    cancelBtn.addEventListener("click", () => {
      dismissed = true;
      onCancel();
    });
    row.append(cancelBtn);
  }

  const error = document.createElement("p");
  error.className = "url-card-suffix-error";

  // A card can be replaced (a full loadRedirects() elsewhere) or explicitly
  // cancelled while a submit is in flight - once true, the pending
  // request's resolution is a no-op rather than reviving a dismissed edit.
  let dismissed = false;

  // Height changes here (the error message appearing/clearing) aren't
  // covered by a caller-side repack the way title-editing's own
  // display/editor swap is - repack locally so every user of this shared
  // input row gets the same masonry fix.
  function repackGrid() {
    requestAnimationFrame(() => {
      const grid = wrapper.closest(".url-cards");
      if (grid) packMasonryRows(grid);
    });
  }

  function updateSaveButtonLabel() {
    const showSave = Boolean(input.value.trim()) || allowEmptySubmit;
    saveBtnLabel.textContent = showSave ? "Save" : "Cancel";
    saveBtn.classList.toggle("save-btn", showSave);
    saveBtn.classList.toggle("cancel-btn", !showSave);
  }

  async function submitValue() {
    const value = input.value.trim();
    if (!value && !allowEmptySubmit) {
      dismissed = true;
      onCancel();
      return;
    }

    saveBtn.disabled = true;
    error.textContent = "";
    repackGrid();

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBody(value)),
      });

      if (dismissed) return;

      if (!response.ok) {
        const data = await response.json();
        error.textContent = data.error || "Something went wrong.";
        saveBtn.disabled = false;
        repackGrid();
        return;
      }

      await onSuccess(response);
    } catch {
      if (dismissed) return;
      error.textContent = "Network error, try again.";
      saveBtn.disabled = false;
      repackGrid();
    }
  }

  saveBtn.addEventListener("click", submitValue);
  input.addEventListener("input", updateSaveButtonLabel);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitValue();
    if (event.key === "Escape") {
      dismissed = true;
      onCancel();
    }
  });
  updateSaveButtonLabel();

  wrapper.append(row, error);
  return wrapper;
}

// ---- Shared by the Redirects and QR Codes pages ----

const LINK_ICON = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>';
const MAIL_ICON = '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>';
// Three finder squares plus a few data modules - used by the QR buttons and
// as the QR card watermark.
const QR_ICON = `
    <rect x="2.5935183" y="2.8879271" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <rect x="4.5935183" y="4.8879271" width="3" height="3" fill="currentColor"/>
    <rect x="14.125116" y="2.8581874" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <rect x="16.125116" y="4.8581872" width="3" height="3" fill="currentColor"/>
    <rect x="2.6638107" y="13.88421" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <rect x="4.6638088" y="15.88421" width="3" height="3" fill="currentColor"/>
    <rect x="11.981996" y="12.157454" width="2" height="2" fill="currentColor"/>
    <rect x="14.82772" y="14.61657" width="2" height="2" fill="currentColor"/>
    <rect x="18.327723" y="14.61657" width="2" height="2" fill="currentColor"/>
    <rect x="14.82772" y="18.116564" width="2" height="2" fill="currentColor"/>
    <rect x="18.327723" y="18.116564" width="2" height="2" fill="currentColor"/>
  `;
const KIND_WATERMARK_ICONS = { url: LINK_ICON, email: MAIL_ICON, qr: QR_ICON };

function createKindWatermark(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `url-card-kind-watermark url-card-kind-watermark--${kind}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = KIND_WATERMARK_ICONS[kind] ?? LINK_ICON;
  return svg;
}

async function copyQrImageToClipboard(qr) {
  const cellSize = 8;
  const margin = cellSize * 2;
  const size = qr.getModuleCount() * cellSize + margin * 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.translate(margin, margin);
  qr.renderTo2dContext(ctx, cellSize);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

// Needs the QR modal markup (#qr-modal-*) and qrcode-lib.js on the page.
function openQrModal(url) {
  const overlay = document.getElementById("qr-modal-overlay");
  const imageEl = document.getElementById("qr-modal-image");
  const titleEl = document.getElementById("qr-modal-title");
  const urlEl = document.getElementById("qr-modal-url");
  const closeBtn = document.getElementById("qr-modal-close");

  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  imageEl.innerHTML = qr.createSvgTag({ scalable: true, alt: `QR code for ${url}` });

  imageEl.onclick = async () => {
    const originalTitle = titleEl.textContent;
    try {
      await copyQrImageToClipboard(qr);
      titleEl.textContent = "Copied to clipboard!";
    } catch {
      titleEl.textContent = "Could not copy to clipboard";
    }
    setTimeout(() => {
      titleEl.textContent = originalTitle;
    }, 1000);
  };

  urlEl.textContent = "";
  urlEl.appendChild(createCopyableTextGroup(url));

  openModal(overlay, closeBtn);
}

// An icon-only button by default; pass `label` to add visible text next to it.
function createQrIconButton({ label } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn qr-code-btn";
  button.title = "Show QR code";
  button.setAttribute("aria-label", "Show QR code");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">${QR_ICON}</svg>`;
  if (label) {
    const text = document.createElement("span");
    text.className = "qr-code-btn-label";
    text.textContent = label;
    button.append(text);
  }
  return button;
}

function createDeleteIconButton(label = "Delete this URL") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn delete-btn";
  button.title = "Delete";
  button.setAttribute("aria-label", label);
  button.innerHTML = `<span>Delete</span>`;
  return button;
}

function initInfoPopovers() {
  document.querySelectorAll(".info-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const popover = document.getElementById(btn.getAttribute("data-info-target"));
      const isOpen = !popover.hidden;
      document.querySelectorAll(".info-popover").forEach((p) => {
        p.hidden = true;
      });
      document.querySelectorAll(".info-btn").forEach((b) => {
        b.setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        popover.hidden = false;
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".info-wrap")) {
      document.querySelectorAll(".info-popover").forEach((p) => {
        p.hidden = true;
      });
      document.querySelectorAll(".info-btn").forEach((b) => {
        b.setAttribute("aria-expanded", "false");
      });
    }
  });
}
