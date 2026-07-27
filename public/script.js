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

function createAddPathButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn card-action-btn";
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg><span>Add path</span>`;
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

function createSuffixInputRow(group, onCancel) {
  const wrapper = document.createElement("div");
  wrapper.className = "url-card-suffix-wrapper";

  const row = document.createElement("div");
  row.className = "url-card-copy-row";
  const prefix = document.createElement("span");
  prefix.className = "url-card-suffix-prefix";
  prefix.textContent = "tiny.vin/";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "url-card-suffix-input";
  input.placeholder = "banana";
  const saveBtn = createSaveSuffixButton();

  const error = document.createElement("p");
  error.className = "url-card-suffix-error";

  async function submitSuffix() {
    const suffix = input.value.trim();
    if (!suffix) return;

    saveBtn.disabled = true;
    error.textContent = "";

    try {
      const response = await fetch("/api/shorten", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: group.originalUrl, code: suffix }),
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

  saveBtn.addEventListener("click", submitSuffix);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitSuffix();
    if (event.key === "Escape") onCancel();
  });

  row.append(prefix, input, saveBtn);
  wrapper.append(row, error);
  return wrapper;
}

function createUrlCard(group, justCreatedCode) {
  const latestCreatedAt = group.shortUrls[0].createdAt;
  const oldestCreatedAt = group.shortUrls[group.shortUrls.length - 1].createdAt;
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
  createdValue.textContent = new Date(oldestCreatedAt).toLocaleString();
  meta.appendChild(createdValue);
  originalHeader.append(originalLabel, meta);
  const originalValue = document.createElement("span");
  originalValue.className = "url-card-value url-card-value--original";
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

  const actionsContainer = document.createElement("div");
  actionsContainer.className = "url-card-actions";
  const addPathBtn = createAddPathButton();
  function closeSuffixRow() {
    actionsContainer.textContent = "";
    actionsContainer.appendChild(addPathBtn);
  }
  addPathBtn.addEventListener("click", () => {
    actionsContainer.textContent = "";
    const inputRow = createSuffixInputRow(group, closeSuffixRow);
    actionsContainer.appendChild(inputRow);
    inputRow.querySelector("input").focus();
  });
  actionsContainer.appendChild(addPathBtn);

  card.append(originalRow, shortRow, actionsContainer);
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

updateGenerateButtonState();
loadHistory();
