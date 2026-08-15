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
    badge.textContent = "Verified";
  } else if (verified === false) {
    badge.classList.add("email-status-badge--pending");
    badge.textContent = "Pending verification";
    badge.title = "Cloudflare e-mailed a confirmation link to this address - redirects won't deliver until it's confirmed.";
  } else {
    badge.classList.add("email-status-badge--unknown");
    badge.textContent = "Status unknown";
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
    loadEmailRedirects();
  } catch {
    alert("Network error, try again.");
  }
}

function createEmailAliasRow(item) {
  const copyRow = document.createElement("div");
  copyRow.className = "url-card-copy-row";
  const addressGroup = createCopyableTextGroup(item.address);
  const badge = createEmailStatusBadge(item.verified);
  const deleteBtn = createDeleteEmailButton();
  deleteBtn.addEventListener("click", () => deleteEmailRedirect(item.alias, item.address));
  copyRow.append(addressGroup, badge, deleteBtn);
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
      loadEmailRedirects(data.alias);
    },
    onCancel,
  });
}

function createEmailCard(group, justCreatedAlias) {
  const shouldFlash = group.aliases.some((item) => item.alias === justCreatedAlias);

  const card = document.createElement("div");
  card.className = "url-card";
  if (shouldFlash) {
    card.classList.add("url-card--flash");
  }

  const destinationRow = createOriginalUrlRow(group.destination);

  const row = document.createElement("div");
  row.className = "url-card-row url-card-row--tiny";
  for (const item of group.aliases) {
    row.append(createEmailAliasRow(item));
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

  card.append(destinationRow, row, actionsContainer);
  return card;
}

async function loadEmailRedirects(justCreatedAlias) {
  const panel = document.getElementById("email-history-panel");
  const container = document.getElementById("email-history-list");

  const data = await fetchJsonOrNull("/api/emails");
  if (!data) return;

  container.textContent = "";

  if (data.redirects.length === 0) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  container.append(
    createCardsSection("EMAIL REDIRECTS", data.redirects, (item) => createEmailCard(item, justCreatedAlias))
  );
}

function updateEmailButtonState() {
  const input = document.getElementById("email-destination-input");
  const generateBtn = document.getElementById("generate-btn");
  generateBtn.disabled = input.value.trim() === "";
}

async function createEmailRedirect() {
  const input = document.getElementById("email-destination-input");
  const result = document.getElementById("result");
  const destination = input.value.trim();

  function setError(message) {
    result.textContent = message;
    result.classList.add("result-error");
  }

  function setStatus(message) {
    result.textContent = message;
    result.classList.remove("result-error");
  }

  if (!destination) {
    setError("Enter a destination address first.");
    return;
  }

  setStatus("Creating redirect...");

  try {
    const response = await fetch("/api/emails", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }

    input.value = "";
    setStatus("");
    updateEmailButtonState();

    if (data.verified === false) {
      setStatus(
        `Created. Cloudflare needs to verify ${destination} before mail will actually forward there - check that inbox for a confirmation link.`
      );
    }

    loadEmailRedirects(data.alias);
  } catch {
    setError("Network error, try again.");
  }
}

document.getElementById("generate-btn").addEventListener("click", createEmailRedirect);
document.getElementById("email-destination-input").addEventListener("input", updateEmailButtonState);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !document.getElementById("generate-btn").disabled) createEmailRedirect();
});

updateEmailButtonState();
loadEmailRedirects();
