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

const SVG_NS = "http://www.w3.org/2000/svg";
const DAILY_CHART_WIDTH = 220;
const DAILY_CHART_HEIGHT = 64;
const DAILY_CHART_BAR_GAP = 2;

function roundedTopBarPath(x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  if (r === 0) {
    return `M${x},${y + height} L${x},${y} L${x + width},${y} L${x + width},${y + height} Z`;
  }
  return (
    `M${x},${y + height} ` +
    `L${x},${y + r} ` +
    `Q${x},${y} ${x + r},${y} ` +
    `L${x + width - r},${y} ` +
    `Q${x + width},${y} ${x + width},${y + r} ` +
    `L${x + width},${y + height} Z`
  );
}

function createDailyChart(days) {
  const barCount = days.length;
  const barWidth = (DAILY_CHART_WIDTH - DAILY_CHART_BAR_GAP * (barCount - 1)) / barCount;
  const maxCount = Math.max(...days.map((d) => d.count), 1);
  const labelSpace = 11;
  const baseline_y = DAILY_CHART_HEIGHT - 1;
  const plotHeight = baseline_y - labelSpace;
  const peakIndex = days.reduce((best, d, i) => (d.count > days[best].count ? i : best), 0);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${DAILY_CHART_WIDTH} ${DAILY_CHART_HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "daily-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Redirects last 14 days");

  const baseline = document.createElementNS(SVG_NS, "line");
  baseline.setAttribute("x1", "0");
  baseline.setAttribute("x2", String(DAILY_CHART_WIDTH));
  baseline.setAttribute("y1", String(baseline_y));
  baseline.setAttribute("y2", String(baseline_y));
  baseline.setAttribute("class", "daily-chart-baseline");
  svg.appendChild(baseline);

  days.forEach((day, i) => {
    const x = i * (barWidth + DAILY_CHART_BAR_GAP);
    const barHeight = day.count > 0 ? Math.max((day.count / maxCount) * (plotHeight - 2), 3) : 0;
    const barTop = baseline_y - barHeight;

    const col = document.createElementNS(SVG_NS, "g");
    col.setAttribute("class", "daily-chart-col");

    if (barHeight > 0) {
      const bar = document.createElementNS(SVG_NS, "path");
      bar.setAttribute("class", "daily-chart-bar");
      bar.setAttribute("d", roundedTopBarPath(x, barTop, barWidth, barHeight, 4));
      col.appendChild(bar);
    }

    if (day.count > 0 && i === peakIndex) {
      const peakLabel = document.createElementNS(SVG_NS, "text");
      peakLabel.setAttribute("class", "chart-value-label");
      peakLabel.setAttribute("x", String(x + barWidth / 2));
      peakLabel.setAttribute("y", String(barTop - 3));
      peakLabel.setAttribute("text-anchor", "middle");
      peakLabel.textContent = String(day.count);
      col.appendChild(peakLabel);
    }

    const hit = document.createElementNS(SVG_NS, "rect");
    hit.setAttribute("class", "daily-chart-hit");
    hit.setAttribute("x", String(x));
    hit.setAttribute("y", "0");
    hit.setAttribute("width", String(barWidth));
    hit.setAttribute("height", String(DAILY_CHART_HEIGHT));
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "img");
    const label = `${formatDayLabel(day.date)}: ${day.count} redirect${day.count === 1 ? "" : "s"}`;
    hit.setAttribute("aria-label", label);

    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = label;
    hit.appendChild(titleEl);

    col.appendChild(hit);
    svg.appendChild(col);
  });

  return svg;
}

function createDailyChartCard(days) {
  const card = document.createElement("div");
  card.className = "url-card";

  const title = document.createElement("p");
  title.className = "breakdown-card-title";
  title.textContent = "Redirects Last 14 Days";

  const chart = createDailyChart(days);

  const axis = document.createElement("div");
  axis.className = "daily-chart-axis";
  const firstLabel = document.createElement("span");
  firstLabel.textContent = formatDayLabel(days[0].date);
  const lastLabel = document.createElement("span");
  lastLabel.textContent = formatDayLabel(days[days.length - 1].date);
  axis.append(firstLabel, lastLabel);

  card.append(title, chart, axis);
  return card;
}

const URL_CHART_LIMIT = 10;
const URL_CHART_LABEL_MAX_CHARS = 32;

function truncateCode(code, maxChars) {
  if (maxChars <= 3) return " ";
  return code.length > maxChars ? `${code.slice(0, maxChars - 1)}…` : code;
}

function flattenShortUrls(urls) {
  return urls
    .flatMap((group) => group.shortUrls.map((shortUrlItem) => ({ ...shortUrlItem, originalUrl: group.originalUrl })))
    .filter((entry) => entry.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, URL_CHART_LIMIT);
}

function createUrlBreakdownChart(entries) {
  const barCount = entries.length;
  const barWidth = (DAILY_CHART_WIDTH - DAILY_CHART_BAR_GAP * (barCount - 1)) / barCount;
  const maxCount = Math.max(...entries.map((e) => e.clicks), 1);
  const labelSpace = 11;
  const baseline_y = DAILY_CHART_HEIGHT - 1;
  const plotHeight = baseline_y - labelSpace;
  const peakIndex = entries.reduce((best, e, i) => (e.clicks > entries[best].clicks ? i : best), 0);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${DAILY_CHART_WIDTH} ${DAILY_CHART_HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "daily-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Redirects per URL");

  const baseline = document.createElementNS(SVG_NS, "line");
  baseline.setAttribute("x1", "0");
  baseline.setAttribute("x2", String(DAILY_CHART_WIDTH));
  baseline.setAttribute("y1", String(baseline_y));
  baseline.setAttribute("y2", String(baseline_y));
  baseline.setAttribute("class", "daily-chart-baseline");
  svg.appendChild(baseline);

  entries.forEach((entry, i) => {
    const x = i * (barWidth + DAILY_CHART_BAR_GAP);
    const barHeight = Math.max((entry.clicks / maxCount) * (plotHeight - 2), 3);
    const barTop = baseline_y - barHeight;

    const col = document.createElementNS(SVG_NS, "g");
    col.setAttribute("class", "daily-chart-col");

    const bar = document.createElementNS(SVG_NS, "path");
    bar.setAttribute("class", "daily-chart-bar");
    bar.setAttribute("d", roundedTopBarPath(x, barTop, barWidth, barHeight, 4));
    col.appendChild(bar);

    if (i === peakIndex) {
      const peakLabel = document.createElementNS(SVG_NS, "text");
      peakLabel.setAttribute("class", "chart-value-label");
      peakLabel.setAttribute("x", String(x + barWidth / 2));
      peakLabel.setAttribute("y", String(barTop - 3));
      peakLabel.setAttribute("text-anchor", "middle");
      peakLabel.textContent = String(entry.clicks);
      col.appendChild(peakLabel);
    }

    const hit = document.createElementNS(SVG_NS, "rect");
    hit.setAttribute("class", "daily-chart-hit");
    hit.setAttribute("x", String(x));
    hit.setAttribute("y", "0");
    hit.setAttribute("width", String(barWidth));
    hit.setAttribute("height", String(DAILY_CHART_HEIGHT));
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "img");
    const label = `${entry.shortUrl} (${entry.originalUrl}): ${entry.clicks} redirect${entry.clicks === 1 ? "" : "s"}`;
    hit.setAttribute("aria-label", label);

    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = label;
    hit.appendChild(titleEl);

    col.appendChild(hit);
    svg.appendChild(col);
  });

  return svg;
}

function createUrlBreakdownChartCard(entries) {
  const card = document.createElement("div");
  card.className = "url-card";

  const title = document.createElement("p");
  title.className = "breakdown-card-title";
  title.textContent = "Redirects per URL";

  const chart = createUrlBreakdownChart(entries);

  const codeLabelMaxChars =
    entries.length === 0 ? URL_CHART_LABEL_MAX_CHARS : Math.floor(URL_CHART_LABEL_MAX_CHARS / entries.length);
  const axis = document.createElement("div");
  axis.className = "url-chart-axis";
  for (const entry of entries) {
    const span = document.createElement("span");
    span.textContent = truncateCode(entry.code, codeLabelMaxChars);
    axis.append(span);
  }

  card.append(title, chart, axis);
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

  const recentClicks = data.dailyRedirects.reduce((sum, day) => sum + day.count, 0);

  summary.textContent = "";
  summary.append(
    createSummaryTile("URLs", data.totalLinks),
    createSummaryTile("Redirects", data.totalClicks),
    createSummaryTile("Redirects Last 14 Days", recentClicks)
  );

  list.textContent = "";
  panel.hidden = false;

  if (data.urls.length === 0) {
    const empty = document.createElement("p");
    empty.className = "stats-empty";
    empty.textContent = "You haven't created any tiny URLs yet.";
    list.append(empty);
    return;
  }

  const breakdownCards = [];
  if (data.dailyRedirects.some((d) => d.count > 0)) {
    breakdownCards.push(createDailyChartCard(data.dailyRedirects));
  }
  const urlChartEntries = flattenShortUrls(data.urls);
  if (urlChartEntries.length > 0) {
    breakdownCards.push(createUrlBreakdownChartCard(urlChartEntries));
  }
  if (breakdownCards.length > 0) {
    list.append(createCardsSectionFromElements("BREAKDOWN", breakdownCards));
  }

  list.append(createCardsSection("REDIRECTS BY URL", data.urls, createStatCard));
}

loadStats();
