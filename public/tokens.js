function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

const TOKEN_REASON_LABELS = {
  signup_bonus: "Signup bonus",
  signup_bonus_retroactive: "Signup bonus",
  purchase: "Purchased tokens",
  "create_generated-path": "Created",
  "create_custom-path": "Created",
  create_subdomain: "Created",
  "upkeep_generated-path": "Generated path upkeep",
  "upkeep_custom-path": "Custom path upkeep",
  upkeep_subdomain: "Subdomain upkeep",
  "reactivate_generated-path": "Reactivated",
  "reactivate_custom-path": "Reactivated",
  reactivate_subdomain: "Reactivated",
  deactivated_insufficient_balance: "Deactivated (insufficient balance)",
  purged_after_grace_period: "Removed (grace period expired)",
};

const URL_REFERENCING_REASONS = new Set([
  "create_generated-path",
  "create_custom-path",
  "create_subdomain",
  "reactivate_generated-path",
  "reactivate_custom-path",
  "reactivate_subdomain",
  "deactivated_insufficient_balance",
  "purged_after_grace_period",
]);

function describeTransaction(entry) {
  const label = TOKEN_REASON_LABELS[entry.reason] || entry.reason;
  return entry.shortUrl && URL_REFERENCING_REASONS.has(entry.reason) ? `${label}: ${entry.shortUrl}` : label;
}

function createBreakdownRow(entry) {
  const row = document.createElement("div");
  row.className = "token-line-item";

  const label = document.createElement("span");
  label.className = "token-line-label";
  label.textContent =
    entry.kind === "generated-path"
      ? `Generated paths (${entry.billableCount} of ${entry.count} beyond your first ${entry.freeLimit} free)`
      : entry.shortUrl;

  const cost = document.createElement("span");
  cost.className = "token-line-cost";
  cost.textContent = `${entry.monthlyCost} token${entry.monthlyCost === 1 ? "" : "s"}/mo`;

  row.append(label, cost);
  return row;
}

function createHistoryRow(entry) {
  const row = document.createElement("div");
  row.className = "token-history-row";

  const info = document.createElement("div");
  info.className = "token-history-info";
  const reason = document.createElement("span");
  reason.className = "url-card-value";
  reason.textContent = describeTransaction(entry);
  const date = document.createElement("span");
  date.className = "stat-row-meta";
  date.textContent = formatDate(entry.createdAt);
  info.append(reason, date);

  const amount = document.createElement("span");
  amount.className = `token-history-amount ${entry.amount >= 0 ? "token-history-amount--credit" : "token-history-amount--debit"}`;
  amount.textContent = `${entry.amount >= 0 ? "+" : ""}${entry.amount}`;

  row.append(info, amount);
  return row;
}

function createEmptyMessage(text) {
  const empty = document.createElement("p");
  empty.className = "stats-empty";
  empty.textContent = text;
  return empty;
}

async function buyTokens(tokens, button) {
  button.disabled = true;
  try {
    const response = await fetch("/api/tokens/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokens }),
    });
    const data = await response.json();
    if (!response.ok || !data.url) {
      alert(data.error || "Could not start checkout, try again.");
      button.disabled = false;
      return;
    }
    window.location.href = data.url;
  } catch {
    alert("Network error, try again.");
    button.disabled = false;
  }
}

function createPackageButton(pkg) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "token-package";

  const tokens = document.createElement("span");
  tokens.className = "token-package-tokens";
  tokens.textContent = `${pkg.tokens} tokens`;

  const price = document.createElement("span");
  price.className = "token-package-price";
  price.textContent = `$${(pkg.priceUsdCents / 100).toFixed(2)}`;

  button.append(tokens, price);
  button.addEventListener("click", () => buyTokens(pkg.tokens, button));
  return button;
}

function showPurchaseStatus() {
  const statusEl = document.getElementById("purchase-status");
  const purchase = new URLSearchParams(window.location.search).get("purchase");

  if (purchase === "success") {
    statusEl.textContent = "Purchase complete — your tokens will appear shortly.";
    statusEl.hidden = false;
  } else if (purchase === "cancelled") {
    statusEl.textContent = "Checkout cancelled.";
    statusEl.hidden = false;
  }
}

async function loadTokens() {
  const summary = document.getElementById("tokens-summary");
  const packagesEl = document.getElementById("token-packages");
  const breakdownEl = document.getElementById("tokens-breakdown");
  const historyEl = document.getElementById("tokens-history");

  const data = await fetchJsonOrNull("/api/tokens");
  if (!data) return;

  summary.textContent = "";
  summary.append(createSummaryTile("Balance", data.balance), createSummaryTile("Monthly Upkeep", data.monthlyBurn));

  packagesEl.textContent = "";
  packagesEl.append(...data.packages.map(createPackageButton));

  breakdownEl.textContent = "";
  if (data.breakdown.length === 0) {
    breakdownEl.append(createEmptyMessage("Nothing currently costs you monthly upkeep."));
  } else {
    breakdownEl.append(...data.breakdown.map(createBreakdownRow));
  }

  historyEl.textContent = "";
  if (data.history.length === 0) {
    historyEl.append(createEmptyMessage("No token activity yet."));
  } else {
    historyEl.append(...data.history.map(createHistoryRow));
  }
}

showPurchaseStatus();
loadTokens();
