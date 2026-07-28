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

async function copyCardShortUrl(shortUrl, displayEl) {
  try {
    await navigator.clipboard.writeText(shortUrl);
    displayEl.textContent = "Copied!";
    setTimeout(() => {
      displayEl.textContent = shortUrl;
    }, 1000);
  } catch {
    displayEl.textContent = "Could not copy, select the text manually.";
  }
}

function createCopyIconButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn";
  button.title = "Copy to clipboard";
  button.setAttribute("aria-label", "Copy to clipboard");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>`;
  return button;
}

function createAddButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn card-action-btn";
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg><span>${label}</span>`;
  return button;
}

function createSaveSuffixButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn card-action-btn save-suffix-btn";
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg><span>Save</span>`;
  return button;
}

function createDeleteIconButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn delete-btn";
  button.title = "Delete";
  button.setAttribute("aria-label", "Delete this URL");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
    <path d="M10 11v6"></path>
    <path d="M14 11v6"></path>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
  </svg><span>Delete</span>`;
  return button;
}

async function deleteUrl(code, kind, shortUrl) {
  const confirmed = confirm(`Are you sure you want to delete the redirected URL ${shortUrl}?`);
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

const NEW_BADGE_WINDOW_MS = 5 * 60 * 1000;

function createShortUrlRow(shortUrlItem) {
  const shortCopyRow = document.createElement("div");
  shortCopyRow.className = "url-card-copy-row";

  const shortUrlGroup = document.createElement("span");
  shortUrlGroup.className = "url-card-copy-group";
  const shortValue = document.createElement("span");
  shortValue.className = "url-card-value url-card-copy-text";
  shortValue.title = "Click to copy";
  shortValue.textContent = shortUrlItem.shortUrl;
  const shortCopyBtn = createCopyIconButton();
  const copyShort = () => copyCardShortUrl(shortUrlItem.shortUrl, shortValue);
  shortValue.addEventListener("click", copyShort);
  shortCopyBtn.addEventListener("click", copyShort);
  shortUrlGroup.append(shortValue, shortCopyBtn);

  const deleteBtn = createDeleteIconButton();
  deleteBtn.addEventListener("click", () => deleteUrl(shortUrlItem.code, shortUrlItem.kind, shortUrlItem.shortUrl));

  shortCopyRow.append(shortUrlGroup, deleteBtn);
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
    saveBtnLabel.textContent = input.value.trim() ? "Save" : "Cancel";
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
    bodyKey: "code",
    prefixText: "tiny.vin/",
    suffixText: null,
    placeholder: "path",
    onCancel,
  });
}

function createSubdomainInputRow(group, onCancel) {
  return createInlineCodeInputRow({
    group,
    bodyKey: "subdomain",
    prefixText: null,
    suffixText: ".tiny.vin",
    placeholder: "my-subdomain",
    onCancel,
  });
}

function createUrlCard(group, justCreatedCode) {
  const oldestCreatedAt = group.shortUrls[group.shortUrls.length - 1].createdAt;
  const isNew = Date.now() - oldestCreatedAt < NEW_BADGE_WINDOW_MS;
  const shouldFlash = group.shortUrls.some((shortUrlItem) => shortUrlItem.code === justCreatedCode);

  const card = document.createElement("div");
  card.className = isNew ? "url-card url-card--new" : "url-card";
  if (shouldFlash) {
    card.classList.add("url-card--flash");
  }

  const originalRow = document.createElement("div");
  originalRow.className = "url-card-row";
  const metaRow = document.createElement("div");
  metaRow.className = "url-card-meta-row";
  const meta = document.createElement("div");
  meta.className = "url-card-meta";
  if (isNew) {
    const newBadge = document.createElement("span");
    newBadge.className = "new-badge";
    newBadge.textContent = "NEW!";
    meta.appendChild(newBadge);
  }
  const createdValue = document.createElement("span");
  createdValue.className = "url-card-timestamp";
  createdValue.textContent = new Date(oldestCreatedAt).toLocaleString();
  meta.appendChild(createdValue);
  metaRow.appendChild(meta);
  const originalValue = document.createElement("span");
  originalValue.className = "url-card-value url-card-value--original";
  originalValue.title = group.originalUrl;
  originalValue.textContent = group.originalUrl;
  originalRow.append(metaRow, originalValue);

  const shortRow = document.createElement("div");
  shortRow.className = "url-card-row url-card-row--tiny";
  for (const shortUrlItem of group.shortUrls) {
    shortRow.append(createShortUrlRow(shortUrlItem));
  }

  const actionsContainer = document.createElement("div");
  actionsContainer.className = "url-card-actions";
  const addPathBtn = createAddButton("Path");
  const addSubdomainBtn = createAddButton("Subdomain");

  function showActionButtons() {
    actionsContainer.textContent = "";
    actionsContainer.append(addPathBtn, addSubdomainBtn);
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

  try {
    const response = await fetch("/api/history");
    if (!response.ok) return;
    const data = await response.json();

    container.textContent = "";

    if (data.urls.length === 0) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    const list = document.createElement("div");
    list.className = "url-cards";
    for (const group of data.urls) {
      list.appendChild(createUrlCard(group, justCreatedCode));
    }
    container.appendChild(list);
  } catch {
    // history is a nice-to-have; a failed fetch shouldn't break the page
  }
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
