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
    displayEl.textContent = "Copied to clipboard!";
    setTimeout(() => {
      displayEl.textContent = shortUrl;
    }, 1000);
  } catch {
    displayEl.textContent = "Could not copy to clipboard";
    setTimeout(() => {
      displayEl.textContent = shortUrl;
    }, 1000);
  }
}

function createCopyIconButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn copy-link-btn";
  button.title = "Copy to clipboard";
  button.setAttribute("aria-label", "Copy to clipboard");
  button.innerHTML = `<svg viewBox="0 0 148 148" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g transform="translate(0.000000,148.000000) scale(0.100000,-0.100000)" fill="currentColor" stroke="none" class="">
      <path d="M218 1380 c-48 -9 -101 -50 -122 -94 -15 -32 -17 -84 -17 -460 -1 -471 -2 -460 67 -512 27 -21 51 -29 102 -33 l67 -6 5 -50 c6 -58 35 -104 85 -135 34 -21 43 -22 452 -22 l416 0 40 29 c22 15 49 44 59 65 18 34 19 64 20 447 0 405 0 410 -22 445 -31 51 -77 80 -135 86 l-50 5 -2 49 c-2 68 -9 90 -39 126 -56 66 -47 65 -489 66 -220 1 -417 -2 -437 -6z m833 -139 c11 -14 19 -39 19 -62 l0 -40 -307 1 c-170 1 -317 -2 -328 -6 -40 -14 -87 -57 -102 -93 -13 -30 -15 -89 -14 -343 l2 -308 -45 0 c-36 0 -48 5 -65 26 -20 26 -21 37 -21 420 l0 393 26 20 c25 20 37 20 421 18 l395 -2 19 -24z m208 -235 c20 -18 20 -28 21 -396 0 -357 -1 -379 -19 -401 l-19 -24 -379 -3 c-373 -3 -380 -2 -406 18 l-27 21 0 384 0 384 26 20 c25 20 37 20 404 18 353 -2 379 -3 399 -21z" class=""></path>
      <path d="M885 923 c-43 -22 -132 -111 -162 -161 -22 -37 -25 -52 -21 -106 5 -83 34 -127 106 -163 l54 -26 -44 -38 c-24 -21 -55 -43 -71 -50 -22 -9 -35 -9 -64 2 -20 8 -45 26 -56 42 -27 35 -27 89 0 125 17 22 20 38 15 80 -2 29 -9 52 -13 52 -15 0 -68 -61 -91 -105 -15 -27 -22 -57 -21 -93 0 -40 7 -63 30 -100 38 -62 96 -95 168 -94 32 0 68 8 92 20 52 27 158 141 173 187 19 56 8 133 -24 182 -19 29 -42 48 -79 63 l-52 23 35 29 c51 43 92 68 115 68 34 0 85 -39 101 -76 12 -28 13 -43 4 -69 -6 -18 -17 -39 -25 -45 -10 -9 -13 -25 -9 -58 9 -77 12 -79 44 -41 17 19 42 54 57 79 21 34 27 56 27 96 -1 69 -39 134 -98 169 -33 19 -56 25 -102 25 -33 -1 -72 -8 -89 -17z m-34 -264 c34 -24 63 -74 55 -95 -8 -20 -33 -17 -68 7 -31 23 -63 83 -53 99 10 16 35 12 66 -11z"></path>
    </g>
  </svg>`;
  return button;
}

function createAddButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn card-action-btn";
  button.innerHTML = `<span>${label}</span>`;
  return button;
}

function createSaveSuffixButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn card-action-btn save-suffix-btn";
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

function createShortUrlRow(shortUrlItem) {
  const shortCopyRow = document.createElement("div");
  shortCopyRow.className = "url-card-copy-row";

  const shortUrlGroup = document.createElement("span");
  shortUrlGroup.className = "url-card-copy-group";
  shortUrlGroup.title = "Copy to clipboard";
  const shortValue = document.createElement("span");
  shortValue.className = "url-card-value url-card-copy-text";
  shortValue.textContent = shortUrlItem.shortUrl;
  const shortCopyBtn = createCopyIconButton();
  const copyShort = () => copyCardShortUrl(shortUrlItem.shortUrl, shortValue);
  shortValue.addEventListener("click", copyShort);
  shortCopyBtn.addEventListener("click", copyShort);
  shortUrlGroup.addEventListener("click", copyShort);
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
    const hasValue = Boolean(input.value.trim());
    saveBtnLabel.textContent = hasValue ? "Save" : "Cancel";
    saveBtn.classList.toggle("save-suffix-btn--cancel", !hasValue);
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
