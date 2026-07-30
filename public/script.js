function confirmDelete(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("delete-modal-overlay");
    const messageEl = document.getElementById("delete-modal-message");
    const confirmBtn = document.getElementById("delete-modal-confirm");
    const cancelBtn = document.getElementById("delete-modal-cancel");
    const previouslyFocused = document.activeElement;

    messageEl.textContent = message;
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

function openQrModal(url) {
  const overlay = document.getElementById("qr-modal-overlay");
  const imageEl = document.getElementById("qr-modal-image");
  const titleEl = document.getElementById("qr-modal-title");
  const urlEl = document.getElementById("qr-modal-url");
  const closeBtn = document.getElementById("qr-modal-close");
  const previouslyFocused = document.activeElement;

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
  overlay.hidden = false;
  closeBtn.focus();

  function close() {
    overlay.hidden = true;
    closeBtn.removeEventListener("click", close);
    overlay.removeEventListener("click", onOverlayClick);
    document.removeEventListener("keydown", onKeydown);
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  }

  function onOverlayClick(event) {
    if (event.target === overlay) close();
  }

  function onKeydown(event) {
    if (event.key === "Escape") close();
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", onOverlayClick);
  document.addEventListener("keydown", onKeydown);
}

async function generateUrl() {
  const input = document.getElementById("url-input");
  const result = document.getElementById("url-result");
  const url = input.value.trim();

  function setError(message) {
    result.textContent = message;
    result.classList.add("url-result-error");
  }

  function setStatus(message) {
    result.textContent = message;
    result.classList.remove("url-result-error");
  }

  if (!url) {
    setError("Enter a URL first.");
    return;
  }

  setStatus("Checking that page exists...");

  try {
    const response = await fetch("/api/shorten", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }

    input.value = "";
    setStatus("");
    updateGenerateButtonState();
    loadHistory(data.code);
  } catch {
    setError("Network error, try again.");
  }
}

function createQrIconButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn qr-code-btn";
  button.title = "Show QR code";
  button.setAttribute("aria-label", "Show QR code");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
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
  </svg>`;
  return button;
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

function createDeleteIconButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn delete-btn";
  button.title = "Delete";
  button.setAttribute("aria-label", "Delete this URL");
  button.innerHTML = `<span>Delete</span>`;
  return button;
}

async function deleteUrl(code, kind, shortUrl) {
  const confirmed = await confirmDelete(`This will delete ${shortUrl}`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/urls/${code}?kind=${kind}`, { method: "DELETE" });
    if (!response.ok) {
      alert("Could not delete that URL, try again.");
      return;
    }
    loadHistory();
  } catch {
    alert("Network error, try again.");
  }
}

function createShortUrlRow(shortUrlItem) {
  const shortCopyRow = document.createElement("div");
  shortCopyRow.className = "url-card-copy-row";

  const shortUrlGroup = createCopyableTextGroup(shortUrlItem.shortUrl);

  const qrBtn = createQrIconButton();
  qrBtn.addEventListener("click", () => openQrModal(`https://${shortUrlItem.shortUrl}`));

  const deleteBtn = createDeleteIconButton();
  deleteBtn.addEventListener("click", () => deleteUrl(shortUrlItem.code, shortUrlItem.kind, shortUrlItem.shortUrl));

  shortCopyRow.append(qrBtn, shortUrlGroup, deleteBtn);
  return shortCopyRow;
}

function createInlineCodeInputRow({ group, bodyKey, prefixText, suffixText, placeholder, onCancel }) {
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
      const response = await fetch("/api/shorten", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: group.originalUrl, [bodyKey]: value }),
      });
      const data = await response.json();

      if (!response.ok) {
        error.textContent = data.error || "Something went wrong.";
        saveBtn.disabled = false;
        return;
      }

      loadHistory(data.code);
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

function createSuffixInputRow(group, onCancel) {
  return createInlineCodeInputRow({
    group,
    bodyKey: "path",
    prefixText: "tiny.vin/",
    suffixText: null,
    placeholder: "Enter pathname",
    onCancel,
  });
}

function createSubdomainInputRow(group, onCancel) {
  return createInlineCodeInputRow({
    group,
    bodyKey: "subdomain",
    prefixText: null,
    suffixText: ".tiny.vin",
    placeholder: "Enter subdomain name",
    onCancel,
  });
}

function createUrlCard(group, justCreatedCode) {
  const shouldFlash = group.shortUrls.some((shortUrlItem) => shortUrlItem.code === justCreatedCode);

  const card = document.createElement("div");
  card.className = "url-card";
  if (shouldFlash) {
    card.classList.add("url-card--flash");
  }

  const originalRow = createOriginalUrlRow(group.originalUrl);

  const shortRow = document.createElement("div");
  shortRow.className = "url-card-row url-card-row--tiny";
  for (const shortUrlItem of group.shortUrls) {
    shortRow.append(createShortUrlRow(shortUrlItem));
  }

  const actionsContainer = document.createElement("div");
  actionsContainer.className = "url-card-actions";
  const addPathBtn = createAddButton("Add Path");
  const addSubdomainBtn = createAddButton("Add Subdomain");

  function showActionButtons() {
    actionsContainer.textContent = "";
    const separator = document.createElement("span");
    separator.className = "url-card-actions-separator";
    separator.textContent = "or";
    actionsContainer.append(addPathBtn, separator, addSubdomainBtn);
  }

  addPathBtn.addEventListener("click", () => {
    actionsContainer.textContent = "";
    const inputRow = createSuffixInputRow(group, showActionButtons);
    actionsContainer.appendChild(inputRow);
    inputRow.querySelector("input").focus();
  });

  addSubdomainBtn.addEventListener("click", () => {
    actionsContainer.textContent = "";
    const inputRow = createSubdomainInputRow(group, showActionButtons);
    actionsContainer.appendChild(inputRow);
    inputRow.querySelector("input").focus();
  });

  showActionButtons();

  card.append(originalRow, shortRow, actionsContainer);
  return card;
}

async function loadHistory(justCreatedCode) {
  const panel = document.getElementById("history-panel");
  const container = document.getElementById("history-list");

  const data = await fetchJsonOrNull("/api/history");
  if (!data) return;

  container.textContent = "";

  if (data.urls.length === 0) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  container.append(createCardsSection("CREATED URLS", data.urls, (group) => createUrlCard(group, justCreatedCode)));
}

function updateGenerateButtonState() {
  const input = document.getElementById("url-input");
  const generateBtn = document.getElementById("generate-btn");
  generateBtn.disabled = input.value.trim() === "";
}

document.getElementById("generate-btn").addEventListener("click", generateUrl);
document.getElementById("url-input").addEventListener("input", updateGenerateButtonState);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !document.getElementById("generate-btn").disabled) generateUrl();
});

updateGenerateButtonState();
loadHistory();
