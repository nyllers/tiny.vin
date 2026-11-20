// QR Codes page: enter a URL, get a card with the page's title and a QR code
// in a modal. No short link is created and nothing is stored on the server -
// the server only looks up the title (POST /api/url-info). The list of cards
// lives in this browser's localStorage, keyed by the signed-in account so
// two people sharing a browser don't see each other's list. Below it, a
// read-only card for each short URL created on the Redirects page.

const QR_STORAGE_PREFIX = "tinyvin.qrCodes:";

let storageKey = QR_STORAGE_PREFIX;
let qrCodes = [];

function loadQrCodes() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((item) => item && typeof item.url === "string" && typeof item.title === "string");
  } catch {
    return [];
  }
}

function saveQrCodes() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(qrCodes));
  } catch {
    // Storage unavailable or full (e.g. a private window) - the list still
    // works for this visit, it just won't be there next time.
  }
}

// Heading, URL and a "Show QR code" button; `onDelete` adds a Delete button
// (omitted for cards that shouldn't be deletable from this page).
function createQrCard({ kind, watermark, url, title, justAdded = false, onDelete }) {
  const card = document.createElement("div");
  card.className = "url-card";
  card.dataset.kind = kind;

  const originalRow = createOriginalUrlRow(url, title);
  if (justAdded) originalRow.querySelector(".url-card-value--original").classList.add("url-card-value--flash");

  const actionsRow = document.createElement("div");
  actionsRow.className = "url-card-row qr-card-actions";
  const copyRow = document.createElement("div");
  copyRow.className = "url-card-copy-row";

  const qrBtn = createQrIconButton({ label: "Show QR code" });
  qrBtn.addEventListener("click", () => openQrModal(url));
  copyRow.append(qrBtn);

  if (onDelete) {
    const deleteBtn = createDeleteIconButton("Delete this QR code");
    deleteBtn.addEventListener("click", onDelete);
    copyRow.append(deleteBtn);
  }

  actionsRow.append(copyRow);
  card.append(createKindWatermark(watermark), originalRow, actionsRow);
  return card;
}

function renderQrCodes({ justAdded } = {}) {
  const panel = document.getElementById("qr-panel");
  const container = document.getElementById("qr-list");

  container.textContent = "";
  panel.hidden = qrCodes.length === 0;
  if (qrCodes.length === 0) return;

  container.append(
    createCardsGrid(
      qrCodes.map((item) =>
        createQrCard({
          kind: "qr",
          watermark: "qr",
          url: item.url,
          title: item.title,
          justAdded: item.url === justAdded,
          onDelete: () => deleteQrCode(item),
        })
      )
    )
  );
}

// One read-only card per short URL created on the Redirects page (generated
// paths, custom paths and subdomains; e-mail aliases aren't URLs). There's no
// Delete here on purpose - removing one would delete the redirect itself,
// which is managed on the Redirects page.
async function loadTinyUrls() {
  const panel = document.getElementById("tiny-panel");
  const container = document.getElementById("tiny-list");

  const data = await fetchJsonOrNull("/api/redirects");
  const cards = (data?.redirects ?? [])
    .filter((group) => group.kind === "url")
    .flatMap((group) =>
      group.items.map((item) =>
        createQrCard({
          kind: "tiny",
          watermark: "url",
          url: `https://${item.shortUrl}`,
          title: group.title || new URL(group.destination).hostname,
        })
      )
    );

  container.textContent = "";
  panel.hidden = cards.length === 0;
  if (cards.length > 0) container.append(createCardsGrid(cards));
}

async function deleteQrCode(item) {
  const confirmed = await confirmDelete(`This will delete the QR code for ${item.url}`);
  if (!confirmed) return;

  qrCodes = qrCodes.filter((other) => other.url !== item.url);
  saveQrCodes();
  renderQrCodes();
}

function updateQrButtonState() {
  document.getElementById("qr-btn").disabled = document.getElementById("qr-input").value.trim() === "";
}

async function addQrCode() {
  const input = document.getElementById("qr-input");
  const button = document.getElementById("qr-btn");
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
    setError("Enter a URL first.");
    return;
  }

  setStatus("Looking up the page...");
  button.disabled = true;

  try {
    const response = await fetch("/api/url-info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(response.status === 401 ? "Your session has expired - sign in again." : data.error || "Something went wrong.");
      return;
    }

    // One card per URL: adding one that's already there moves it to the top.
    qrCodes = [{ url: data.url, title: data.title, createdAt: Date.now() }, ...qrCodes.filter((item) => item.url !== data.url)];
    saveQrCodes();
    input.value = "";
    setStatus("");
    renderQrCodes({ justAdded: data.url });
  } catch {
    setError("Network error, try again.");
  } finally {
    updateQrButtonState();
  }
}

async function initQrPage() {
  loadTinyUrls();

  const session = await fetchJsonOrNull("/api/session");
  storageKey = QR_STORAGE_PREFIX + (session?.email ?? "");
  qrCodes = loadQrCodes();
  renderQrCodes();
}

document.getElementById("qr-btn").addEventListener("click", addQrCode);
document.getElementById("qr-input").addEventListener("input", updateQrButtonState);
document.getElementById("qr-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !document.getElementById("qr-btn").disabled) addQrCode();
});

initInfoPopovers();
updateQrButtonState();
initQrPage();
