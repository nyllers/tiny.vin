const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailInput(value) {
  return EMAIL_PATTERN.test(value);
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

  setStatus(isEmailInput(value) ? "Creating redirect..." : "Checking that page exists...");

  try {
    const response = await fetch("/api/redirects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value }),
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
    loadRedirects(data.kind === "email" ? { justCreatedAlias: data.code } : { justCreatedCode: data.code });
  } catch {
    setError("Network error, try again.");
  }
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

  const shortUrlGroup = createCopyableTextGroup(shortUrlItem.shortUrl, {
    copyText: withHttps(shortUrlItem.shortUrl),
  });
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
    endpoint: "/api/redirects",
    buildBody: (value) => ({ value: group.destination, path: value }),
    prefixText: "tiny.vin/",
    suffixText: null,
    placeholder: "Enter pathname",
    onSuccess: async (response) => {
      const data = await response.json();
      loadRedirects({ justCreatedCode: data.code });
    },
    onCancel,
  });
}

function createSubdomainInputRow(group, onCancel) {
  return createInlineCodeInputRow({
    endpoint: "/api/redirects",
    buildBody: (value) => ({ value: group.destination, subdomain: value }),
    prefixText: null,
    suffixText: ".tiny.vin",
    placeholder: "Enter subdomain name",
    onSuccess: async (response) => {
      const data = await response.json();
      loadRedirects({ justCreatedCode: data.code });
    },
    onCancel,
  });
}

async function generatePathForGroup(group) {
  try {
    const response = await fetch("/api/redirects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: group.destination }),
    });

    if (!response.ok) {
      alert("Could not generate a path, try again.");
      return;
    }

    const data = await response.json();
    loadRedirects({ justCreatedCode: data.code });
  } catch {
    alert("Network error, try again.");
  }
}

// Swapping a card's action buttons for an input row (and back) changes its
// height without going through loadRedirects()'s full grid rebuild, so the
// masonry grid's cached row span goes stale the same way an in-place title
// edit does - repack after every such swap. Deferred a frame so it doesn't
// fight a just-triggered focus scroll, and re-resolves the grid lazily in
// case the card was detached in the meantime.
function repackCardGrid(card) {
  requestAnimationFrame(() => {
    const grid = card.closest(".url-cards");
    if (grid) packMasonryRows(grid);
  });
}

function createUrlCard(group, justCreatedCode, maxTitleLength) {
  const card = document.createElement("div");
  card.className = "url-card";
  card.dataset.kind = "url";

  const originalRow = createOriginalUrlRow(group.destination, group.title, { editable: true, maxTitleLength });

  const shortRow = document.createElement("div");
  shortRow.className = "url-card-row url-card-row--tiny";
  for (const shortUrlItem of group.items) {
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
    repackCardGrid(card);
  }

  generatePathBtn.addEventListener("click", () => {
    generatePathForGroup(group);
  });

  addPathBtn.addEventListener("click", () => {
    actionsContainer.textContent = "";
    const inputRow = createSuffixInputRow(group, showActionButtons);
    actionsContainer.appendChild(inputRow);
    inputRow.querySelector("input").focus();
    repackCardGrid(card);
  });

  addSubdomainBtn.addEventListener("click", () => {
    actionsContainer.textContent = "";
    const inputRow = createSubdomainInputRow(group, showActionButtons);
    actionsContainer.appendChild(inputRow);
    inputRow.querySelector("input").focus();
    repackCardGrid(card);
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
  const addressGroup = createCopyableTextGroup(item.shortUrl);
  if (item.code === justCreatedAlias) {
    addressGroup.querySelector(".url-card-copy-text").classList.add("url-card-value--flash");
  }

  const qrBtn = createQrIconButton();
  qrBtn.addEventListener("click", () => openQrModal(`mailto:${item.shortUrl}`));

  const badge = createEmailStatusBadge(item.verified);
  const deleteBtn = createDeleteEmailButton();
  deleteBtn.addEventListener("click", () => deleteEmailRedirect(item.code, item.shortUrl));
  copyRow.append(qrBtn, addressGroup, badge, deleteBtn);
  return copyRow;
}

function createAliasInputRow(group, onCancel) {
  return createInlineCodeInputRow({
    endpoint: "/api/redirects",
    buildBody: (value) => ({ value: group.destination, alias: value }),
    prefixText: null,
    suffixText: "@tiny.vin",
    placeholder: "Enter alias",
    onSuccess: async (response) => {
      const data = await response.json();
      loadRedirects({ justCreatedAlias: data.code });
    },
    onCancel,
  });
}

function createEmailCard(group, justCreatedAlias) {
  const card = document.createElement("div");
  card.className = "url-card";
  card.dataset.kind = "email";

  const destinationRow = createTitleOnlyRow(group.title || group.destination);

  const row = document.createElement("div");
  row.className = "url-card-row url-card-row--tiny";
  for (const item of group.items) {
    row.append(createEmailAliasRow(item, justCreatedAlias));
  }

  const actionsContainer = document.createElement("div");
  actionsContainer.className = "url-card-actions";
  const addAliasBtn = createAddButton("Add alias");

  function showActionButton() {
    actionsContainer.textContent = "";
    actionsContainer.append(addAliasBtn);
    repackCardGrid(card);
  }

  addAliasBtn.addEventListener("click", () => {
    actionsContainer.textContent = "";
    const inputRow = createAliasInputRow(group, showActionButton);
    actionsContainer.appendChild(inputRow);
    inputRow.querySelector("input").focus();
    repackCardGrid(card);
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
  loadResourceUsage();

  const panel = document.getElementById("history-panel");
  const container = document.getElementById("history-list");

  const data = await fetchJsonOrNull("/api/redirects");
  const allGroups = data?.redirects || [];

  container.textContent = "";

  if (allGroups.length === 0) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const cardElements = allGroups.map((group) =>
    group.kind === "url"
      ? createUrlCard(group, justCreatedCode, data.maxTitleLength)
      : createEmailCard(group, justCreatedAlias)
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

async function loadResourceUsage() {
  const container = document.getElementById("resource-usage");
  const text = document.getElementById("resource-usage-text");
  const fill = document.getElementById("resource-usage-fill");

  const data = await fetchJsonOrNull("/api/session");
  if (!data || typeof data.maxResources !== "number") {
    container.hidden = true;
    return;
  }

  const used = data.resourceCount;
  const max = data.maxResources;
  const remaining = Math.max(0, max - used);
  const percent = max > 0 ? Math.min(100, (used / max) * 100) : 0;

  text.textContent = `${used} of ${max} redirects used — ${remaining} left`;
  fill.style.width = `${percent}%`;
  container.hidden = false;
}

function initFilterRow() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
      applyRedirectFilter();
    });
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
