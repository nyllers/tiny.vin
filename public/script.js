let currentShortUrl = "";

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
  const copyBtn = document.getElementById("copy-btn");
  const url = input.value.trim();

  currentShortUrl = "";
  copyBtn.hidden = true;

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

    currentShortUrl = data.shortUrl;
    result.textContent = data.shortUrl;
    result.title = "Click to copy";
    copyBtn.hidden = false;
    loadHistory();
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

function createUrlCard(item) {
  const card = document.createElement("div");
  card.className = "url-card";

  const originalRow = document.createElement("div");
  originalRow.className = "url-card-row";
  const originalLabel = document.createElement("span");
  originalLabel.className = "url-card-label";
  originalLabel.textContent = "Original URL";
  const originalValue = document.createElement("span");
  originalValue.className = "url-card-value";
  originalValue.title = item.originalUrl;
  originalValue.textContent = item.originalUrl;
  originalRow.append(originalLabel, originalValue);

  const shortRow = document.createElement("div");
  shortRow.className = "url-card-row";
  const shortLabel = document.createElement("span");
  shortLabel.className = "url-card-label";
  shortLabel.textContent = "Short URL";
  const shortCopyRow = document.createElement("div");
  shortCopyRow.className = "url-card-copy-row";
  const shortValue = document.createElement("span");
  shortValue.className = "url-card-value url-card-copy-text";
  shortValue.title = "Click to copy";
  shortValue.textContent = item.shortUrl;
  const shortCopyBtn = createCopyIconButton();
  const copyShort = () => copyCardShortUrl(item.shortUrl, shortValue);
  shortValue.addEventListener("click", copyShort);
  shortCopyBtn.addEventListener("click", copyShort);
  shortCopyRow.append(shortValue, shortCopyBtn);
  shortRow.append(shortLabel, shortCopyRow);

  const createdValue = document.createElement("span");
  createdValue.className = "url-card-timestamp";
  createdValue.textContent = new Date(item.createdAt).toLocaleString();

  card.append(originalRow, shortRow, createdValue);
  return card;
}

async function loadHistory() {
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
    for (const item of data.urls) {
      list.appendChild(createUrlCard(item));
    }
    container.appendChild(list);
  } catch {
    // history is a nice-to-have; a failed fetch shouldn't break the page
  }
}

async function copyResult() {
  const result = document.getElementById("url-result");
  if (!currentShortUrl || result.textContent !== currentShortUrl) return;

  try {
    await navigator.clipboard.writeText(currentShortUrl);
    result.textContent = "Copied!";
    setTimeout(() => {
      result.textContent = currentShortUrl;
    }, 1000);
  } catch {
    result.textContent = "Could not copy, select the text manually.";
  }
}

document.getElementById("generate-btn").addEventListener("click", generateUrl);
document.getElementById("url-result").addEventListener("click", copyResult);
document.getElementById("copy-btn").addEventListener("click", copyResult);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") generateUrl();
});

loadHistory();
