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
const CHART_WIDTH = 220;
const CHART_HEIGHT = 64;
const CHART_BAR_GAP = 2;

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

// Generic bar chart: entries = [{ label, count }]. Used by the daily chart,
// the per-URL breakdown, and the new browser/referer breakdowns alike -
// only the aria-label wording and how each entry's label is formatted differ.
function createBarChart(entries, { ariaLabel, describeEntry }) {
  const barCount = entries.length;
  const barWidth = (CHART_WIDTH - CHART_BAR_GAP * (barCount - 1)) / barCount;
  const maxCount = Math.max(...entries.map((e) => e.count), 1);
  const labelSpace = 11;
  const baseline_y = CHART_HEIGHT - 1;
  const plotHeight = baseline_y - labelSpace;
  const peakIndex = entries.reduce((best, e, i) => (e.count > entries[best].count ? i : best), 0);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "daily-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ariaLabel);

  const baseline = document.createElementNS(SVG_NS, "line");
  baseline.setAttribute("x1", "0");
  baseline.setAttribute("x2", String(CHART_WIDTH));
  baseline.setAttribute("y1", String(baseline_y));
  baseline.setAttribute("y2", String(baseline_y));
  baseline.setAttribute("class", "daily-chart-baseline");
  svg.appendChild(baseline);

  entries.forEach((entry, i) => {
    const x = i * (barWidth + CHART_BAR_GAP);
    const barHeight = entry.count > 0 ? Math.max((entry.count / maxCount) * (plotHeight - 2), 3) : 0;
    const barTop = baseline_y - barHeight;

    const col = document.createElementNS(SVG_NS, "g");
    col.setAttribute("class", "daily-chart-col");

    if (barHeight > 0) {
      const bar = document.createElementNS(SVG_NS, "path");
      bar.setAttribute("class", "daily-chart-bar");
      bar.setAttribute("d", roundedTopBarPath(x, barTop, barWidth, barHeight, 4));
      col.appendChild(bar);
    }

    if (entry.count > 0 && i === peakIndex) {
      const peakLabel = document.createElementNS(SVG_NS, "text");
      peakLabel.setAttribute("class", "chart-value-label");
      peakLabel.setAttribute("x", String(x + barWidth / 2));
      peakLabel.setAttribute("y", String(barTop - 3));
      peakLabel.setAttribute("text-anchor", "middle");
      peakLabel.textContent = String(entry.count);
      col.appendChild(peakLabel);
    }

    const hit = document.createElementNS(SVG_NS, "rect");
    hit.setAttribute("class", "daily-chart-hit");
    hit.setAttribute("x", String(x));
    hit.setAttribute("y", "0");
    hit.setAttribute("width", String(barWidth));
    hit.setAttribute("height", String(CHART_HEIGHT));
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "img");
    const label = describeEntry(entry);
    hit.setAttribute("aria-label", label);

    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = label;
    hit.appendChild(titleEl);

    col.appendChild(hit);
    svg.appendChild(col);
  });

  return svg;
}

// Compact axis: truncates each entry's label to fit the available space,
// used in the small card view.
function createCompactAxis(entries, labelFor, maxTotalChars) {
  const axis = document.createElement("div");
  axis.className = "url-chart-axis";
  const perEntryChars = entries.length === 0 ? maxTotalChars : Math.floor(maxTotalChars / entries.length);
  for (const entry of entries) {
    const span = document.createElement("span");
    const text = labelFor(entry);
    span.textContent = perEntryChars <= 3 ? " " : text.length > perEntryChars ? `${text.slice(0, perEntryChars - 1)}…` : text;
    axis.append(span);
  }
  return axis;
}

// Full axis: every label shown in full, wrapping instead of truncating.
// Used in the expanded modal view, which has the width to spare.
function createFullAxis(entries, labelFor) {
  const axis = document.createElement("div");
  axis.className = "url-chart-axis url-chart-axis--wide";
  for (const entry of entries) {
    const span = document.createElement("span");
    span.textContent = labelFor(entry);
    axis.append(span);
  }
  return axis;
}

function createExpandButton(onExpand) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn chart-expand-btn";
  button.title = "Expand";
  button.setAttribute("aria-label", "Expand chart");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 3h6v6"></path>
    <path d="M9 21H3v-6"></path>
    <path d="M21 3l-7 7"></path>
    <path d="M3 21l7-7"></path>
  </svg>`;
  button.addEventListener("click", onExpand);
  return button;
}

function createCardHeader(titleText, onExpand) {
  const header = document.createElement("div");
  header.className = "breakdown-card-header";
  const title = document.createElement("p");
  title.className = "breakdown-card-title";
  title.textContent = titleText;
  header.append(title, createExpandButton(onExpand));
  return header;
}

function openChartModal(title, buildContent) {
  const overlay = document.getElementById("chart-modal-overlay");
  const titleEl = document.getElementById("chart-modal-title");
  const body = document.getElementById("chart-modal-body");
  const closeBtn = document.getElementById("chart-modal-close");
  const previouslyFocused = document.activeElement;

  titleEl.textContent = title;
  body.textContent = "";
  body.appendChild(buildContent());
  overlay.hidden = false;
  closeBtn.focus();

  function close() {
    overlay.hidden = true;
    closeBtn.removeEventListener("click", close);
    overlay.removeEventListener("click", onOverlayClick);
    document.removeEventListener("keydown", onKeydown);
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  }

  function onOverlayClick(event) {
    if (event.target === overlay) close();
  }

  function onKeydown(event) {
    if (event.key === "Escape") close();
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", onOverlayClick);
  document.addEventListener("keydown", onKeydown);
}

function dailyEntries(days) {
  return days.map((d) => ({ label: formatDayLabel(d.date), count: d.count, date: d.date }));
}

function buildDailyChart(days) {
  return createBarChart(dailyEntries(days), {
    ariaLabel: `Redirects last ${days.length} days`,
    describeEntry: (e) => `${e.label}: ${e.count} redirect${e.count === 1 ? "" : "s"}`,
  });
}

function createDailyChartCard(days) {
  const card = document.createElement("div");
  card.className = "url-card";

  const header = createCardHeader("Redirects Last 14 Days", () =>
    openChartModal("Redirects Last 14 Days", () => {
      const fragment = document.createDocumentFragment();
      fragment.append(buildDailyChart(days), createFullAxis(dailyEntries(days), (e) => e.label));
      return fragment;
    })
  );

  const chart = buildDailyChart(days);

  const axis = document.createElement("div");
  axis.className = "daily-chart-axis";
  const firstLabel = document.createElement("span");
  firstLabel.textContent = formatDayLabel(days[0].date);
  const lastLabel = document.createElement("span");
  lastLabel.textContent = formatDayLabel(days[days.length - 1].date);
  axis.append(firstLabel, lastLabel);

  card.append(header, chart, axis);
  return card;
}

const BAR_CHART_LIMIT = 10;
const BAR_CHART_LABEL_MAX_CHARS = 32;

function flattenShortUrls(urls) {
  return urls
    .flatMap((group) => group.shortUrls.map((shortUrlItem) => ({ ...shortUrlItem, originalUrl: group.originalUrl })))
    .filter((entry) => entry.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, BAR_CHART_LIMIT);
}

// Shared builder for the three "top N, similar bar chart" cards: redirects
// per URL, per browser, and per referer. `labelFor`/`describeEntry` adapt it
// to each dataset's shape.
function createBreakdownChartCard(titleText, entries, { chartAriaLabel, labelFor, describeEntry, modalTitle }) {
  const card = document.createElement("div");
  card.className = "url-card";

  const barEntries = entries.map((e) => ({ ...e, count: e.count ?? e.clicks }));

  const header = createCardHeader(titleText, () =>
    openChartModal(modalTitle || titleText, () => {
      const fragment = document.createDocumentFragment();
      fragment.append(
        createBarChart(barEntries, { ariaLabel: chartAriaLabel, describeEntry }),
        createFullAxis(barEntries, labelFor)
      );
      return fragment;
    })
  );

  const chart = createBarChart(barEntries, { ariaLabel: chartAriaLabel, describeEntry });
  const axis = createCompactAxis(barEntries, labelFor, BAR_CHART_LABEL_MAX_CHARS);

  card.append(header, chart, axis);
  return card;
}

function createUrlBreakdownChartCard(entries) {
  return createBreakdownChartCard("Redirects per URL", entries, {
    chartAriaLabel: "Redirects per URL",
    labelFor: (e) => e.code,
    describeEntry: (e) => `${e.shortUrl} (${e.originalUrl}): ${e.count} redirect${e.count === 1 ? "" : "s"}`,
  });
}

function createBrowserChartCard(browsers) {
  const entries = browsers.map((b) => ({ label: b.name, count: b.count }));
  return createBreakdownChartCard("Redirects by Browser", entries, {
    chartAriaLabel: "Redirects by browser",
    labelFor: (e) => e.label,
    describeEntry: (e) => `${e.label}: ${e.count} redirect${e.count === 1 ? "" : "s"}`,
  });
}

function createRefererChartCard(referrers) {
  const entries = referrers.map((r) => ({ label: r.name, count: r.count }));
  return createBreakdownChartCard("Redirects by Referer", entries, {
    chartAriaLabel: "Redirects by referer",
    labelFor: (e) => e.label,
    describeEntry: (e) => `${e.label}: ${e.count} redirect${e.count === 1 ? "" : "s"}`,
  });
}

// World map: a plain equirectangular graticule (no coastline data bundled
// with the project) with a dot per distinct lat/lng, radius scaled by count.
const MAP_WIDTH = 360;
const MAP_HEIGHT = 180;

function projectLatLng(lat, lng) {
  return { x: lng + 180, y: 90 - lat };
}

function createWorldMapSvg(points) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("class", "world-map");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Redirect locations, last 14 days");

  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", String(MAP_WIDTH));
  background.setAttribute("height", String(MAP_HEIGHT));
  background.setAttribute("class", "world-map-bg");
  svg.appendChild(background);

  for (let lng = -180; lng <= 180; lng += 30) {
    const x = lng + 180;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("y1", "0");
    line.setAttribute("y2", String(MAP_HEIGHT));
    line.setAttribute("class", lng === 0 ? "world-map-grid world-map-grid--prime" : "world-map-grid");
    svg.appendChild(line);
  }

  for (let lat = -90; lat <= 90; lat += 30) {
    const y = 90 - lat;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("x2", String(MAP_WIDTH));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", lat === 0 ? "world-map-grid world-map-grid--equator" : "world-map-grid");
    svg.appendChild(line);
  }

  const border = document.createElementNS(SVG_NS, "rect");
  border.setAttribute("x", "0.5");
  border.setAttribute("y", "0.5");
  border.setAttribute("width", String(MAP_WIDTH - 1));
  border.setAttribute("height", String(MAP_HEIGHT - 1));
  border.setAttribute("class", "world-map-border");
  svg.appendChild(border);

  const maxCount = Math.max(...points.map((p) => p.count), 1);
  for (const point of points) {
    const { x, y } = projectLatLng(point.lat, point.lng);
    const radius = 1.5 + Math.sqrt(point.count / maxCount) * 3.5;

    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("r", String(radius));
    dot.setAttribute("class", "world-map-dot");

    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = `${point.count} redirect${point.count === 1 ? "" : "s"}`;
    dot.appendChild(titleEl);

    svg.appendChild(dot);
  }

  return svg;
}

function createWorldMapCard(points) {
  const card = document.createElement("div");
  card.className = "url-card";

  const header = createCardHeader("Redirect Locations", () =>
    openChartModal("Redirect Locations", () => {
      const fragment = document.createDocumentFragment();
      fragment.append(createWorldMapSvg(points));
      return fragment;
    })
  );

  card.append(header, createWorldMapSvg(points));
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
  if (data.mapPoints && data.mapPoints.length > 0) {
    breakdownCards.push(createWorldMapCard(data.mapPoints));
  }
  if (data.browsers && data.browsers.length > 0) {
    breakdownCards.push(createBrowserChartCard(data.browsers.slice(0, BAR_CHART_LIMIT)));
  }
  if (data.topReferrers && data.topReferrers.length > 0) {
    breakdownCards.push(createRefererChartCard(data.topReferrers.slice(0, BAR_CHART_LIMIT)));
  }
  if (breakdownCards.length > 0) {
    list.append(createCardsSectionFromElements("BREAKDOWN", breakdownCards));
  }

  list.append(createCardsSection("REDIRECTS BY URL", data.urls, createStatCard));
}

loadStats();
