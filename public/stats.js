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

  const metaRow = document.createElement("div");
  metaRow.className = "url-card-meta-row";
  const totalBadge = document.createElement("span");
  totalBadge.className = "stat-total-badge";
  totalBadge.textContent = `${group.totalClicks} total redirect${group.totalClicks === 1 ? "" : "s"}`;
  metaRow.appendChild(totalBadge);

  const originalRow = document.createElement("div");
  originalRow.className = "url-card-row";
  const originalValue = document.createElement("span");
  originalValue.className = "url-card-value url-card-value--original";
  originalValue.title = group.originalUrl;
  originalValue.textContent = group.originalUrl;
  originalRow.append(originalValue);

  const shortRow = document.createElement("div");
  shortRow.className = "url-card-row url-card-row--tiny";
  const maxClicks = Math.max(...group.shortUrls.map((s) => s.clicks), 0);
  for (const shortUrlItem of group.shortUrls) {
    shortRow.append(createStatRow(shortUrlItem, maxClicks));
  }

  card.append(metaRow, originalRow, shortRow);
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

  try {
    const response = await fetch("/api/stats");
    if (!response.ok) return;
    const data = await response.json();

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

    const heading = document.createElement("h2");
    heading.className = "section-heading";
    heading.textContent = "REDIRECTS BY URL";
    const cards = document.createElement("div");
    cards.className = "url-cards";
    for (const group of data.urls) {
      cards.appendChild(createStatCard(group));
    }
    list.append(heading, cards);
  } catch {
    // stats are a nice-to-have; a failed fetch shouldn't break the page
  }
}

loadStats();
