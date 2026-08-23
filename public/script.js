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

function codeFromLocation(location) {
  const url = new URL(location);
  return url.hostname === "tiny.vin" ? url.pathname.slice(1) : url.hostname.replace(/\.tiny\.vin$/, "");
}

async function generateUrl() {
  const input = document.getElementById("url-input");
  const result = document.getElementById("result");
  const url = input.value.trim();

  function setError(message) {
    result.textContent = message;
    result.classList.add("result-error");
  }

  function setStatus(message) {
    result.textContent = message;
    result.classList.remove("result-error");
  }

  if (!url) {
    setError("Enter a URL first.");
    return;
  }

  setStatus("Checking that page exists...");

  try {
    const response = await fetch("/api/urls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Something went wrong.");
      return;
    }

    input.value = "";
    setStatus("");
    updateGenerateButtonState();
    loadHistory(codeFromLocation(response.headers.get("Location")));
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

function createSuffixInputRow(group, onCancel) {
  return createInlineCodeInputRow({
    endpoint: "/api/urls",
    buildBody: (value) => ({ url: group.originalUrl, path: value }),
    prefixText: "tiny.vin/",
    suffixText: null,
    placeholder: "Enter pathname",
    onSuccess: (response) => loadHistory(codeFromLocation(response.headers.get("Location"))),
    onCancel,
  });
}

function createSubdomainInputRow(group, onCancel) {
  return createInlineCodeInputRow({
    endpoint: "/api/urls",
    buildBody: (value) => ({ url: group.originalUrl, subdomain: value }),
    prefixText: null,
    suffixText: ".tiny.vin",
    placeholder: "Enter subdomain name",
    onSuccess: (response) => loadHistory(codeFromLocation(response.headers.get("Location"))),
    onCancel,
  });
}

async function generatePathForGroup(group) {
  try {
    const response = await fetch("/api/urls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: group.originalUrl }),
    });

    if (!response.ok) {
      alert("Could not generate a path, try again.");
      return;
    }

    loadHistory(codeFromLocation(response.headers.get("Location")));
  } catch {
    alert("Network error, try again.");
  }
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
  const generatePathBtn = createAddButton("Generate Path");
  const addPathBtn = createAddButton("Add Path");
  const addSubdomainBtn = createAddButton("Add Subdomain");

  function showActionButtons() {
    actionsContainer.textContent = "";
    actionsContainer.append(generatePathBtn, addPathBtn, addSubdomainBtn);
  }

  generatePathBtn.addEventListener("click", () => {
    generatePathForGroup(group);
  });

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
