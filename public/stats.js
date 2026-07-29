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
const CATEGORY_CHART_WIDTH = 220;
const CATEGORY_CHART_TOP_LABEL_SPACE = 10;
const CATEGORY_CHART_PLOT_HEIGHT = 32;
const CATEGORY_CHART_BOTTOM_LABEL_SPACE = 22;
const CATEGORY_CHART_BASELINE_Y = CATEGORY_CHART_TOP_LABEL_SPACE + CATEGORY_CHART_PLOT_HEIGHT;
const CATEGORY_CHART_HEIGHT = CATEGORY_CHART_BASELINE_Y + CATEGORY_CHART_BOTTOM_LABEL_SPACE;
const CATEGORY_CHART_BAR_GAP = 3;

function shrinkSvgTextToFit(el, maxWidth) {
  const fullText = el.getAttribute("data-full-text");
  let text = fullText;
  el.textContent = text;
  while (text.length > 1 && el.getComputedTextLength() > maxWidth) {
    text = text.slice(0, -1);
    el.textContent = `${text}…`;
  }
}

function createCategoryChart(rows, ariaLabel) {
  const barCount = rows.length;
  const barWidth = (CATEGORY_CHART_WIDTH - CATEGORY_CHART_BAR_GAP * (barCount - 1)) / barCount;
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  const peakIndex = rows.reduce((best, row, i) => (row.count > rows[best].count ? i : best), 0);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${CATEGORY_CHART_WIDTH} ${CATEGORY_CHART_HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "category-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ariaLabel);

  const baseline = document.createElementNS(SVG_NS, "line");
  baseline.setAttribute("x1", "0");
  baseline.setAttribute("x2", String(CATEGORY_CHART_WIDTH));
  baseline.setAttribute("y1", String(CATEGORY_CHART_BASELINE_Y));
  baseline.setAttribute("y2", String(CATEGORY_CHART_BASELINE_Y));
  baseline.setAttribute("class", "category-chart-baseline");
  svg.appendChild(baseline);

  rows.forEach((row, i) => {
    const x = i * (barWidth + CATEGORY_CHART_BAR_GAP);
    const centerX = x + barWidth / 2;
    const barHeight = row.count > 0 ? Math.max((row.count / maxCount) * (CATEGORY_CHART_PLOT_HEIGHT - 2), 3) : 0;
    const barTop = CATEGORY_CHART_BASELINE_Y - barHeight;

    const col = document.createElementNS(SVG_NS, "g");
    col.setAttribute("class", "category-chart-col");

    if (barHeight > 0) {
      const bar = document.createElementNS(SVG_NS, "path");
      bar.setAttribute("class", "category-chart-bar");
      bar.setAttribute("d", roundedTopBarPath(x, barTop, barWidth, barHeight, 3));
      col.appendChild(bar);
    }

    if (row.count > 0 && i === peakIndex) {
      const peakLabel = document.createElementNS(SVG_NS, "text");
      peakLabel.setAttribute("class", "chart-value-label");
      peakLabel.setAttribute("x", String(centerX));
      peakLabel.setAttribute("y", String(barTop - 3));
      peakLabel.setAttribute("text-anchor", "middle");
      peakLabel.textContent = String(row.count);
      col.appendChild(peakLabel);
    }

    const nameLabel = document.createElementNS(SVG_NS, "text");
    nameLabel.setAttribute("class", "category-chart-name-label");
    nameLabel.setAttribute("x", String(centerX));
    nameLabel.setAttribute("y", String(CATEGORY_CHART_BASELINE_Y + 15));
    nameLabel.setAttribute("text-anchor", "middle");
    nameLabel.setAttribute("data-full-text", row.name);
    nameLabel.setAttribute("data-max-width", String(barWidth + CATEGORY_CHART_BAR_GAP));
    nameLabel.textContent = row.name;
    col.appendChild(nameLabel);

    const hit = document.createElementNS(SVG_NS, "rect");
    hit.setAttribute("class", "category-chart-hit");
    hit.setAttribute("x", String(x));
    hit.setAttribute("y", "0");
    hit.setAttribute("width", String(barWidth));
    hit.setAttribute("height", String(CATEGORY_CHART_HEIGHT));
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "img");
    const description = `${row.name}: ${row.count} redirect${row.count === 1 ? "" : "s"}`;
    hit.setAttribute("aria-label", description);

    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = description;
    hit.appendChild(titleEl);

    col.appendChild(hit);
    svg.appendChild(col);
  });

  return svg;
}

function createCategoryChartCard(title, rows) {
  const card = document.createElement("div");
  card.className = "url-card breakdown-card";

  const titleEl = document.createElement("p");
  titleEl.className = "breakdown-card-title";
  titleEl.textContent = title;

  const chart = createCategoryChart(rows, `${title} by redirect count`);

  card.append(titleEl, chart);
  return card;
}
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
  svg.setAttribute("aria-label", "Redirects per day for the last 14 days");

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
  card.className = "url-card breakdown-card";

  const title = document.createElement("p");
  title.className = "breakdown-card-title";
  title.textContent = "Last 14 Days";

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

  const breakdowns = [];
  if (data.dailyRedirects.some((d) => d.count > 0)) {
    breakdowns.push({ type: "daily", days: data.dailyRedirects });
  }
  for (const [title, rows] of [
    ["Top Origin Countries", data.topCountries],
    ["Top Referrers", data.topReferrers],
    ["Browsers", data.browsers],
    ["Devices", data.devices],
  ]) {
    if (rows.some((row) => row.count > 0)) {
      breakdowns.push({ type: "list", title, rows });
    }
  }

  if (breakdowns.length > 0) {
    list.append(
      createCardsSection("BREAKDOWN", breakdowns, (breakdown) =>
        breakdown.type === "daily" ? createDailyChartCard(breakdown.days) : createCategoryChartCard(breakdown.title, breakdown.rows)
      )
    );
    document.querySelectorAll(".category-chart-name-label").forEach((el) => {
      shrinkSvgTextToFit(el, parseFloat(el.getAttribute("data-max-width")));
    });
  }

  list.append(createCardsSection("REDIRECTS BY URL", data.urls, createStatCard));
}

loadStats();
