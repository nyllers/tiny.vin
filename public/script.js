const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_ICON = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>';
const MAIL_ICON = '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>';

function isEmailInput(value) {
  return EMAIL_PATTERN.test(value);
}

function createKindWatermark(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "url-card-kind-watermark");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = kind === "email" ? MAIL_ICON : LINK_ICON;
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

async function generateRedirect() {
  const input = document.getElementById("redirect-input");
  const result = document.getElementById("result");
  const value = input.value.trim();

  function setError(message) {
    result.textContent = message;
    result.classList.add("result-error");
  }

  function setStatus(message) {
    result.textContent = message;
    result.classList.remove("result-error");
  }

  if (!value) {
    setError("Enter a URL or e-mail address first.");
    return;
  }

  if (isEmailInput(value)) {
    setStatus("Creating redirect...");

    try {
      const response = await fetch("/api/emails", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination: value }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      input.value = "";
      setStatus(
        data.verified === false
          ? `Created. Cloudflare needs to verify ${value} before mail will actually forward there - check that inbox for a confirmation link.`
          : ""
      );
      updateGenerateButtonState();
      updateDetectedHint();
      loadRedirects({ justCreatedAlias: data.alias });
    } catch {
      setError("Network error, try again.");
    }
    return;
  }

  setStatus("Checking that page exists...");

  try {
    const response = await fetch("/api/urls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: value }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Something went wrong.");
      return;
    }

    input.value = "";
    setStatus("");
    updateGenerateButtonState();
    updateDetectedHint();
    loadRedirects({ justCreatedCode: codeFromLocation(response.headers.get("Location")) });
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
    loadRedirects();
  } catch {
    alert("Network error, try again.");
  }
}

function createShortUrlRow(shortUrlItem, justCreatedCode) {
  const shortCopyRow = document.createElement("div");
  shortCopyRow.className = "url-card-copy-row";

  const shortUrlGroup = createCopyableTextGroup(shortUrlItem.shortUrl);
  if (shortUrlItem.code === justCreatedCode) {
    shortUrlGroup.querySelector(".url-card-copy-text").classList.add("url-card-value--flash");
  }

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
    onSuccess: (response) => loadRedirects({ justCreatedCode: codeFromLocation(response.headers.get("Location")) }),
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
    onSuccess: (response) => loadRedirects({ justCreatedCode: codeFromLocation(response.headers.get("Location")) }),
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

    loadRedirects({ justCreatedCode: codeFromLocation(response.headers.get("Location")) });
  } catch {
    alert("Network error, try again.");
  }
}

function createUrlCard(group, justCreatedCode) {
  const card = document.createElement("div");
  card.className = "url-card";
  card.dataset.kind = "url";

  const originalRow = createOriginalUrlRow(group.originalUrl);

  const shortRow = document.createElement("div");
  shortRow.className = "url-card-row url-card-row--tiny";
  for (const shortUrlItem of group.shortUrls) {
    shortRow.append(createShortUrlRow(shortUrlItem, justCreatedCode));
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

  card.append(createKindWatermark("url"), originalRow, shortRow, actionsContainer);
  return card;
}

function createDeleteEmailButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn delete-btn";
  button.title = "Delete";
  button.setAttribute("aria-label", "Delete this redirect");
  button.innerHTML = `<span>Delete</span>`;
  return button;
}

function createEmailStatusBadge(verified) {
  const badge = document.createElement("span");
  badge.className = "email-status-badge";

  if (verified === true) {
    badge.classList.add("email-status-badge--verified");
    badge.title = "Verified";
    badge.setAttribute("aria-label", "Verified");
    badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (verified === false) {
    badge.classList.add("email-status-badge--pending");
    badge.title = "Cloudflare e-mailed a confirmation link to this address - redirects won't deliver until it's confirmed.";
    badge.setAttribute("aria-label", "Pending verification");
    badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="12" x2="12" y2="6.5"></line></svg>`;
  } else {
    badge.classList.add("email-status-badge--unknown");
    badge.title = "Status unknown";
    badge.setAttribute("aria-label", "Status unknown");
    badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="13"></line><circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none"></circle></svg>`;
  }

  return badge;
}

async function deleteEmailRedirect(alias, address) {
  const confirmed = await confirmDelete(`This will delete the redirect for ${address}`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/emails/${alias}`, { method: "DELETE" });
    if (!response.ok) {
      alert("Could not delete that redirect, try again.");
      return;
    }
    loadRedirects();
  } catch {
    alert("Network error, try again.");
  }
}

function createEmailAliasRow(item, justCreatedAlias) {
  const copyRow = document.createElement("div");
  copyRow.className = "url-card-copy-row";
  const addressGroup = createCopyableTextGroup(item.address);
  if (item.alias === justCreatedAlias) {
    addressGroup.querySelector(".url-card-copy-text").classList.add("url-card-value--flash");
  }

  const qrBtn = createQrIconButton();
  qrBtn.addEventListener("click", () => openQrModal(`mailto:${item.address}`));

  const badge = createEmailStatusBadge(item.verified);
  const deleteBtn = createDeleteEmailButton();
  deleteBtn.addEventListener("click", () => deleteEmailRedirect(item.alias, item.address));
  copyRow.append(qrBtn, addressGroup, badge, deleteBtn);
  return copyRow;
}

function createAliasInputRow(group, onCancel) {
  return createInlineCodeInputRow({
    endpoint: "/api/emails",
    buildBody: (value) => ({ destination: group.destination, alias: value }),
    prefixText: null,
    suffixText: "@tiny.vin",
    placeholder: "Enter alias",
    onSuccess: async (response) => {
      const data = await response.json();
      loadRedirects({ justCreatedAlias: data.alias });
    },
    onCancel,
  });
}

function createEmailCard(group, justCreatedAlias) {
  const card = document.createElement("div");
  card.className = "url-card";
  card.dataset.kind = "email";

  const destinationRow = createOriginalUrlRow(group.destination);

  const row = document.createElement("div");
  row.className = "url-card-row url-card-row--tiny";
  for (const item of group.aliases) {
    row.append(createEmailAliasRow(item, justCreatedAlias));
  }

  const actionsContainer = document.createElement("div");
  actionsContainer.className = "url-card-actions";
  const addAliasBtn = createAddButton("Add alias");

  function showActionButton() {
    actionsContainer.textContent = "";
    actionsContainer.append(addAliasBtn);
  }

  addAliasBtn.addEventListener("click", () => {
    actionsContainer.textContent = "";
    const inputRow = createAliasInputRow(group, showActionButton);
    actionsContainer.appendChild(inputRow);
    inputRow.querySelector("input").focus();
  });

  showActionButton();

  card.append(createKindWatermark("email"), destinationRow, row, actionsContainer);
  return card;
}

function applyRedirectFilter() {
  const activeBtn = document.querySelector(".filter-btn.active");
  const filter = activeBtn ? activeBtn.dataset.filter : "all";
  const grid = document.querySelector("#history-list .url-cards");
  if (!grid) return;

  grid.querySelectorAll(".url-card").forEach((card) => {
    card.hidden = filter !== "all" && filter !== card.dataset.kind;
  });
  packMasonryRows(grid);
}

async function loadRedirects({ justCreatedCode, justCreatedAlias } = {}) {
  const panel = document.getElementById("history-panel");
  const container = document.getElementById("history-list");

  const [historyData, emailData] = await Promise.all([fetchJsonOrNull("/api/history"), fetchJsonOrNull("/api/emails")]);

  const urlGroups = (historyData?.urls || []).map((group) => ({ ...group, kind: "url" }));
  const emailGroups = (emailData?.redirects || []).map((group) => ({ ...group, kind: "email" }));
  const allGroups = [...urlGroups, ...emailGroups].sort((a, b) => b.createdAt - a.createdAt);

  container.textContent = "";

  if (allGroups.length === 0) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const cardElements = allGroups.map((group) =>
    group.kind === "url" ? createUrlCard(group, justCreatedCode) : createEmailCard(group, justCreatedAlias)
  );
  container.append(createCardsGrid(cardElements));
  applyRedirectFilter();
}

function updateGenerateButtonState() {
  const input = document.getElementById("redirect-input");
  const generateBtn = document.getElementById("generate-btn");
  generateBtn.disabled = input.value.trim() === "";
}

function updateDetectedHint() {
  const input = document.getElementById("redirect-input");
  const hint = document.getElementById("detected-hint");
  const value = input.value.trim();

  if (!value) {
    hint.innerHTML = "";
    return;
  }

  const isEmail = isEmailInput(value);
  const icon = isEmail ? MAIL_ICON : LINK_ICON;
  const label = isEmail
    ? "Looks like an e-mail address - this will create an e-mail alias"
    : "Looks like a URL - this will create a short link";
  hint.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>${label}`;
}

function initFilterRow() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
      applyRedirectFilter();
    });
  });
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

document.getElementById("generate-btn").addEventListener("click", generateRedirect);
document.getElementById("redirect-input").addEventListener("input", () => {
  updateGenerateButtonState();
  updateDetectedHint();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !document.getElementById("generate-btn").disabled) generateRedirect();
});

initFilterRow();
initInfoPopovers();
updateGenerateButtonState();
loadRedirects();
