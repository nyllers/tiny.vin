const EMAIL_STAT_KIND = {
  unitLabel: "message",
  itemLabel: (a) => a.address,
  itemCount: (a) => a.messages,
  itemLastAt: (a) => a.lastMessageAt,
  groupRow: (g) => createOriginalUrlRow(g.destination),
  groupItems: (g) => g.aliases,
  groupTotal: (g) => g.totalMessages,
};

function createEmailStatCard(group) {
  return createGroupStatCard(group, EMAIL_STAT_KIND);
}

function flattenAliasBreakdown(entries) {
  return topByCount(entries, "messages");
}

function createAliasBreakdownChartCard(entries) {
  const barEntries = entries.map((e) => ({ ...e, count: e.messages }));
  return createBreakdownChartCard("Messages per Alias", barEntries, {
    chartAriaLabel: "Messages per alias",
    labelFor: (e) => e.alias,
    describeEntry: (e) => `${e.address} (${e.destination}): ${e.count} message${e.count === 1 ? "" : "s"}`,
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
    breakdownCards.push(
      createNameCountChartCard(
        "Messages by Sender Domain",
        "Messages by sender domain",
        data.senderDomains.slice(0, BAR_CHART_LIMIT),
        "message"
      )
    );
  }
  if (breakdownCards.length > 0) {
    list.append(createCardsSectionFromElements("BREAKDOWN LAST 14 DAYS", breakdownCards));
  }

  list.append(createCardsSection("TOTAL MESSAGES BY DESTINATION", data.redirects, createEmailStatCard));
}

loadEmailStats();
