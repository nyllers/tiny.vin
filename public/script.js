function validateUrl(input) {
  if (!input.includes("://")) {
    if (/\s/.test(input)) {
      return { error: "That doesn't look like a URL. Try a format like: https://example.com" };
    }
    return { error: `Missing "http://" or "https://" at the start. Try: https://${input}` };
  }

  const scheme = input.slice(0, input.indexOf("://")).toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return {
      error: `"${scheme}://" links aren't supported, only http:// and https://. Try: https://example.com`,
    };
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { error: "That doesn't look like a valid URL. Try a format like: https://example.com/page" };
  }

  if (!parsed.hostname || (!parsed.hostname.includes(".") && parsed.hostname !== "localhost")) {
    return {
      error: `"${parsed.hostname}" doesn't look like a real domain. Try a format like: https://example.com`,
    };
  }

  return { url: parsed.href };
}

async function generateUrl() {
  const input = document.getElementById("url-input");
  const result = document.getElementById("url-result");
  const url = input.value.trim();

  if (!url) {
    result.textContent = "Enter a URL first.";
    return;
  }

  const validation = validateUrl(url);
  if (validation.error) {
    result.textContent = validation.error;
    return;
  }

  result.textContent = "Generating...";

  try {
    const response = await fetch("/api/shorten", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();

    if (!response.ok) {
      result.textContent = data.error || "Something went wrong.";
      return;
    }

    input.value = "";
    result.textContent = "";
    updateGenerateButtonState();
    loadHistory(data.code);
  } catch {
    result.textContent = "Network error, try again.";
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

function createEditIconButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn edit-btn";
  button.title = "Edit";
  button.setAttribute("aria-label", "Edit this URL");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg><span>Edit</span>`;
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

async function deleteUrl(code, shortUrl) {
  const confirmed = confirm(`Are you sure you want to delete the redirected URL ${shortUrl}?`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/urls/${code}`, { method: "DELETE" });
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
  deleteBtn.addEventListener("click", () => deleteUrl(shortUrlItem.code, shortUrlItem.shortUrl));

  shortCopyRow.append(shortUrlGroup, deleteBtn);
  return shortCopyRow;
}

function createUrlCard(group, justCreatedCode) {
  const latestCreatedAt = group.shortUrls[0].createdAt;
  const isNew = Date.now() - latestCreatedAt < NEW_BADGE_WINDOW_MS;
  const shouldFlash = group.shortUrls.some((shortUrlItem) => shortUrlItem.code === justCreatedCode);

  const card = document.createElement("div");
  card.className = isNew ? "url-card url-card--new" : "url-card";
  if (shouldFlash) {
    card.classList.add("url-card--flash");
  }

  const originalRow = document.createElement("div");
  originalRow.className = "url-card-row";
  const originalHeader = document.createElement("div");
  originalHeader.className = "url-card-header";
  const originalLabel = document.createElement("span");
  originalLabel.className = "url-card-label";
  originalLabel.textContent = "Original URL";
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
  createdValue.textContent = new Date(latestCreatedAt).toLocaleString();
  meta.appendChild(createdValue);
  originalHeader.append(originalLabel, meta);
  const originalValue = document.createElement("span");
  originalValue.className = "url-card-value";
  originalValue.title = group.originalUrl;
  originalValue.textContent = group.originalUrl;
  originalRow.append(originalHeader, originalValue);

  const shortRow = document.createElement("div");
  shortRow.className = "url-card-row";
  const shortLabel = document.createElement("span");
  shortLabel.className = "url-card-label";
  shortLabel.textContent = "Tiny URL";
  shortRow.append(shortLabel);
  for (const shortUrlItem of group.shortUrls) {
    shortRow.append(createShortUrlRow(shortUrlItem));
  }

  const footerRow = document.createElement("div");
  footerRow.className = "url-card-footer";
  const editBtn = createEditIconButton();
  editBtn.addEventListener("click", () => openEditModal(group));
  footerRow.append(editBtn);

  card.append(originalRow, shortRow, footerRow);
  return card;
}

async function loadHistory(justCreatedCode) {
  const container = document.getElementById("history-list");

  try {
    const response = await fetch("/api/history");
    if (!response.ok) return;
    const data = await response.json();

    container.textContent = "";

    if (data.urls.length === 0) {
      const empty = document.createElement("p");
      empty.className = "login-subtitle";
      empty.textContent = "You haven't created any short URLs yet.";
      container.appendChild(empty);
      return;
    }

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

let editingGroup = null;

function openEditModal(group) {
  editingGroup = group;
  document.getElementById("edit-modal-original").textContent = group.originalUrl;

  const shortList = document.getElementById("edit-modal-short-list");
  shortList.textContent = "";
  for (const shortUrlItem of group.shortUrls) {
    const shortUrlLine = document.createElement("p");
    shortUrlLine.className = "modal-value";
    shortUrlLine.textContent = shortUrlItem.shortUrl;
    shortList.appendChild(shortUrlLine);
  }

  document.getElementById("edit-modal-suffix").value = "";
  document.getElementById("edit-modal-error").textContent = "";
  document.getElementById("edit-modal-backdrop").hidden = false;
}

function closeEditModal() {
  editingGroup = null;
  document.getElementById("edit-modal-backdrop").hidden = true;
}

async function saveEditModal() {
  const suffixInput = document.getElementById("edit-modal-suffix");
  const errorEl = document.getElementById("edit-modal-error");
  const suffix = suffixInput.value.trim();

  if (!suffix) {
    closeEditModal();
    return;
  }

  const saveBtn = document.getElementById("edit-modal-save");
  saveBtn.disabled = true;
  errorEl.textContent = "";

  try {
    const response = await fetch("/api/shorten", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: editingGroup.originalUrl, code: suffix }),
    });
    const data = await response.json();

    if (!response.ok) {
      errorEl.textContent = data.error || "Something went wrong.";
      return;
    }

    closeEditModal();
    loadHistory(data.code);
  } catch {
    errorEl.textContent = "Network error, try again.";
  } finally {
    saveBtn.disabled = false;
  }
}

document.getElementById("edit-modal-cancel").addEventListener("click", closeEditModal);
document.getElementById("edit-modal-save").addEventListener("click", saveEditModal);
document.getElementById("edit-modal-backdrop").addEventListener("click", (event) => {
  if (event.target.id === "edit-modal-backdrop") closeEditModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.getElementById("edit-modal-backdrop").hidden) {
    closeEditModal();
  }
});

updateGenerateButtonState();
loadHistory();
