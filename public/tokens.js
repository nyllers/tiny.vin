function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

const TOKEN_REASON_LABELS = {
  signup_bonus: "Signup bonus",
  signup_bonus_retroactive: "Signup bonus",
  "create_generated-path": "Created",
  "create_custom-path": "Created",
  create_subdomain: "Created",
  "upkeep_generated-path": "Generated path upkeep",
  "upkeep_custom-path": "Custom path upkeep",
  upkeep_subdomain: "Subdomain upkeep",
  deleted_insufficient_balance: "Deleted (insufficient balance)",
};

function describeTransaction(entry) {
  const label = TOKEN_REASON_LABELS[entry.reason] || entry.reason;
  if (entry.shortUrl && (entry.reason.startsWith("create_") || entry.reason === "deleted_insufficient_balance")) {
    return `${label}: ${entry.shortUrl}`;
  }
  return label;
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

async function loadTokens() {
  const summary = document.getElementById("tokens-summary");
  const breakdownEl = document.getElementById("tokens-breakdown");
  const historyEl = document.getElementById("tokens-history");

  const data = await fetchJsonOrNull("/api/tokens");
  if (!data) return;

  summary.textContent = "";
  summary.append(createSummaryTile("Balance", data.balance), createSummaryTile("Monthly Upkeep", data.monthlyBurn));

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

loadTokens();
