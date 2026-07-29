function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

function createStatRow(shortUrlItem, maxClicks) {
  const row = document.createElement("div");
  row.className = "url-card-copy-row";

  const info = document.createElement("div");
  info.className = "stat-row-info";
  const value = document.createElement("span");
  value.className = "url-card-value";
  value.textContent = shortUrlItem.shortUrl;
  const meta = document.createElement("span");
  meta.className = "stat-row-meta";
  meta.textContent = shortUrlItem.lastClickAt ? `Last redirect: ${formatDate(shortUrlItem.lastClickAt)}` : "No redirects yet";
  info.append(value, meta);

  const countWrap = document.createElement("div");
  countWrap.className = "stat-row-count-wrap";
  const count = document.createElement("span");
  count.className = "stat-row-count";
  count.textContent = `${shortUrlItem.clicks} redirect${shortUrlItem.clicks === 1 ? "" : "s"}`;
  const bar = document.createElement("div");
  bar.className = "stat-bar";
  const barFill = document.createElement("div");
  barFill.className = "stat-bar-fill";
  barFill.style.width = maxClicks > 0 ? `${Math.round((shortUrlItem.clicks / maxClicks) * 100)}%` : "0%";
  bar.appendChild(barFill);
  countWrap.append(count, bar);

  row.append(info, countWrap);
  return row;
}

function createStatCard(group) {
  const card = document.createElement("div");
  card.className = "url-card";

  const originalRow = createOriginalUrlRow(group.originalUrl);

  const shortRow = document.createElement("div");
  shortRow.className = "url-card-row url-card-row--tiny";
  const maxClicks = Math.max(...group.shortUrls.map((s) => s.clicks), 0);
  for (const shortUrlItem of group.shortUrls) {
    shortRow.append(createStatRow(shortUrlItem, maxClicks));
  }

  const metaRow = document.createElement("div");
  metaRow.className = "url-card-meta-row";
  const totalBadge = document.createElement("span");
  totalBadge.className = "stat-total-badge";
  totalBadge.textContent = `${group.totalClicks} total redirect${group.totalClicks === 1 ? "" : "s"}`;
  metaRow.appendChild(totalBadge);

  card.append(originalRow, shortRow, metaRow);
  return card;
}

function formatDayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function createBreakdownRow(label, count, max) {
  const row = document.createElement("div");
  row.className = "breakdown-row";

  const labelEl = document.createElement("span");
  labelEl.className = "breakdown-row-label";
  labelEl.title = label;
  labelEl.textContent = label;

  const countWrap = document.createElement("div");
  countWrap.className = "stat-row-count-wrap";
  const countEl = document.createElement("span");
  countEl.className = "stat-row-count";
  countEl.textContent = count;
  const bar = document.createElement("div");
  bar.className = "stat-bar";
  const barFill = document.createElement("div");
  barFill.className = "stat-bar-fill";
  barFill.style.width = max > 0 ? `${Math.round((count / max) * 100)}%` : "0%";
  bar.appendChild(barFill);
  countWrap.append(countEl, bar);

  row.append(labelEl, countWrap);
  return row;
}

function createBreakdownCard(breakdown) {
  const card = document.createElement("div");
  card.className = "url-card breakdown-card";

  const title = document.createElement("p");
  title.className = "breakdown-card-title";
  title.textContent = breakdown.title;

  const list = document.createElement("div");
  list.className = "breakdown-list";
  const max = Math.max(...breakdown.rows.map((row) => row.count), 0);
  for (const row of breakdown.rows) {
    list.appendChild(createBreakdownRow(row.name, row.count, max));
  }

  card.append(title, list);
  return card;
}

function createSummaryTile(label, value) {
  const tile = document.createElement("div");
  tile.className = "stat-tile";
  const valueEl = document.createElement("span");
  valueEl.className = "stat-tile-value";
  valueEl.textContent = value;
  const labelEl = document.createElement("span");
  labelEl.className = "stat-tile-label";
  labelEl.textContent = label;
  tile.append(valueEl, labelEl);
  return tile;
}

async function loadStats() {
  const summary = document.getElementById("stats-summary");
  const panel = document.getElementById("stats-panel");
  const list = document.getElementById("stats-list");

  const data = await fetchJsonOrNull("/api/stats");
  if (!data) return;

  summary.textContent = "";
  summary.append(createSummaryTile("URLs", data.totalLinks), createSummaryTile("Redirects", data.totalClicks));
  if (data.topCountry) {
    summary.appendChild(createSummaryTile("Top Country", data.topCountry));
  }

  list.textContent = "";
  panel.hidden = false;

  if (data.urls.length === 0) {
    const empty = document.createElement("p");
    empty.className = "stats-empty";
    empty.textContent = "You haven't created any tiny URLs yet.";
    list.append(empty);
    return;
  }

  const breakdowns = [
    { title: "Last 14 Days", rows: data.dailyRedirects.map((d) => ({ name: formatDayLabel(d.date), count: d.count })) },
    { title: "Top Countries", rows: data.topCountries },
    { title: "Top Referrers", rows: data.topReferrers },
    { title: "Browsers", rows: data.browsers },
    { title: "Devices", rows: data.devices },
  ].filter((breakdown) => breakdown.rows.some((row) => row.count > 0));

  if (breakdowns.length > 0) {
    list.append(createCardsSection("BREAKDOWN", breakdowns, createBreakdownCard));
  }

  list.append(createCardsSection("REDIRECTS BY URL", data.urls, createStatCard));
}

loadStats();
