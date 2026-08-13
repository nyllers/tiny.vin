function createEmailStatRow(aliasItem, maxMessages) {
  const row = document.createElement("div");
  row.className = "url-card-copy-row";

  const info = document.createElement("div");
  info.className = "stat-row-info";
  const value = document.createElement("span");
  value.className = "url-card-value";
  value.textContent = aliasItem.address;
  const meta = document.createElement("span");
  meta.className = "stat-row-meta";
  meta.textContent = aliasItem.lastMessageAt ? `Last message: ${formatDate(aliasItem.lastMessageAt)}` : "No messages yet";
  info.append(value, meta);

  const countWrap = document.createElement("div");
  countWrap.className = "stat-row-count-wrap";
  const count = document.createElement("span");
  count.className = "stat-row-count";
  count.textContent = `${aliasItem.messages} message${aliasItem.messages === 1 ? "" : "s"}`;
  const bar = document.createElement("div");
  bar.className = "stat-bar";
  const barFill = document.createElement("div");
  barFill.className = "stat-bar-fill";
  barFill.style.width = maxMessages > 0 ? `${Math.round((aliasItem.messages / maxMessages) * 100)}%` : "0%";
  bar.appendChild(barFill);
  countWrap.append(count, bar);

  row.append(info, countWrap);
  return row;
}

function createEmailStatCard(group) {
  const card = document.createElement("div");
  card.className = "url-card";

  const destinationRow = createOriginalUrlRow(group.destination);

  const aliasRow = document.createElement("div");
  aliasRow.className = "url-card-row url-card-row--tiny";
  const maxMessages = Math.max(...group.aliases.map((a) => a.messages), 0);
  for (const aliasItem of group.aliases) {
    aliasRow.append(createEmailStatRow(aliasItem, maxMessages));
  }

  const metaRow = document.createElement("div");
  metaRow.className = "url-card-meta-row";
  const totalBadge = document.createElement("span");
  totalBadge.className = "stat-total-badge";
  totalBadge.textContent = `${group.totalMessages} total message${group.totalMessages === 1 ? "" : "s"}`;
  metaRow.appendChild(totalBadge);

  card.append(destinationRow, aliasRow, metaRow);
  return card;
}

function flattenAliasBreakdown(entries) {
  return entries
    .filter((entry) => entry.messages > 0)
    .sort((a, b) => b.messages - a.messages)
    .slice(0, BAR_CHART_LIMIT);
}

function createAliasBreakdownChartCard(entries) {
  const barEntries = entries.map((e) => ({ ...e, count: e.messages }));
  return createBreakdownChartCard("Messages per Alias", barEntries, {
    chartAriaLabel: "Messages per alias",
    labelFor: (e) => e.alias,
    describeEntry: (e) => `${e.address} (${e.destination}): ${e.count} message${e.count === 1 ? "" : "s"}`,
  });
}

function createSenderDomainChartCard(domains) {
  const entries = domains.map((d) => ({ label: d.name, count: d.count }));
  return createBreakdownChartCard("Messages by Sender Domain", entries, {
    chartAriaLabel: "Messages by sender domain",
    labelFor: (e) => e.label,
    describeEntry: (e) => `${e.label}: ${e.count} message${e.count === 1 ? "" : "s"}`,
  });
}

async function loadEmailStats() {
  const summary = document.getElementById("email-stats-summary");
  const panel = document.getElementById("email-stats-panel");
  const list = document.getElementById("email-stats-list");

  const data = await fetchJsonOrNull("/api/email-stats");
  if (!data) return;

  const recentMessages = data.dailyMessages.reduce((sum, day) => sum + day.count, 0);

  summary.textContent = "";
  summary.append(
    createSummaryTile("Aliases", data.totalAliases),
    createSummaryTile("Messages", data.totalMessages),
    createSummaryTile("Messages Last 14 Days", recentMessages),
    createSummaryTile("Failed to Forward", data.totalFailedForwards)
  );

  list.textContent = "";
  panel.hidden = false;

  if (data.redirects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "stats-empty";
    empty.textContent = "You haven't created any e-mail redirects yet.";
    list.append(empty);
    return;
  }

  const breakdownCards = [];
  if (data.dailyMessages.some((d) => d.count > 0)) {
    breakdownCards.push(createDailyChartCard(data.dailyMessages, "Messages Received", "message"));
  }
  const aliasChartEntries = flattenAliasBreakdown(data.aliasBreakdown14d || []);
  if (aliasChartEntries.length > 0) {
    breakdownCards.push(createAliasBreakdownChartCard(aliasChartEntries));
  }
  if (data.senderDomains && data.senderDomains.length > 0) {
    breakdownCards.push(createSenderDomainChartCard(data.senderDomains.slice(0, BAR_CHART_LIMIT)));
  }
  if (breakdownCards.length > 0) {
    list.append(createCardsSectionFromElements("BREAKDOWN LAST 14 DAYS", breakdownCards));
  }

  list.append(createCardsSection("TOTAL MESSAGES BY DESTINATION", data.redirects, createEmailStatCard));
}

loadEmailStats();
