function formatDate(ts) {
  return new Date(ts).toLocaleString();
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

// Generic bar chart: entries = [{ label, count }]. Shared by every "N per
// category, last 14 days" breakdown across the stats pages - only the
// aria-label wording and how each entry's label is formatted differ.
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

  titleEl.textContent = title;
  body.textContent = "";
  body.appendChild(buildContent());

  openModal(overlay, closeBtn);
}

function formatDayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function dailyEntries(days) {
  return days.map((d) => ({ label: formatDayLabel(d.date), count: d.count, date: d.date }));
}

function buildDailyChart(days, unitLabel) {
  return createBarChart(dailyEntries(days), {
    ariaLabel: `${unitLabel}s last ${days.length} days`,
    describeEntry: (e) => `${e.label}: ${e.count} ${unitLabel}${e.count === 1 ? "" : "s"}`,
  });
}

function createDailyChartCard(days, title, unitLabel) {
  const card = document.createElement("div");
  card.className = "url-card";

  const header = createCardHeader(title, () =>
    openChartModal(title, () => {
      const fragment = document.createDocumentFragment();
      fragment.append(buildDailyChart(days, unitLabel), createFullAxis(dailyEntries(days), (e) => e.label));
      return fragment;
    })
  );

  const chart = buildDailyChart(days, unitLabel);

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

// Shared builder for "top N, similar bar chart" breakdown cards (redirects
// per URL, per browser, per referer, per e-mail alias, per sender domain,
// etc). `labelFor`/`describeEntry` adapt it to each dataset's shape.
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

// Shared "N per category, last 14 days" breakdown card for the common case
// of plotting a flat {name, count} list (browsers, referers, sender
// domains, ...) - only the title/aria-label wording and unit noun differ.
function createNameCountChartCard(titleText, ariaLabel, items, unitLabel) {
  const entries = items.map((item) => ({ label: item.name, count: item.count }));
  return createBreakdownChartCard(titleText, entries, {
    chartAriaLabel: ariaLabel,
    labelFor: (e) => e.label,
    describeEntry: (e) => `${e.label}: ${e.count} ${unitLabel}${e.count === 1 ? "" : "s"}`,
  });
}

// Keeps only the top BAR_CHART_LIMIT entries with nonzero activity, busiest
// first - shared by the URL/e-mail stats pages' 14-day breakdown charts.
function topByCount(entries, countKey) {
  return entries
    .filter((entry) => entry[countKey] > 0)
    .sort((a, b) => b[countKey] - a[countKey])
    .slice(0, BAR_CHART_LIMIT);
}

// A "group card" pairs one parent row (an original URL, an e-mail
// destination) with a list of child items (its short URLs, its aliases),
// each shown as a labeled row with a proportional bar, plus a total badge.
// Shared by /stats and /email-stats - `kind` supplies the field accessors
// and unit noun that differ between the two.
function createStatRow(item, max, kind) {
  const row = document.createElement("div");
  row.className = "url-card-copy-row";

  const info = document.createElement("div");
  info.className = "stat-row-info";
  const value = document.createElement("span");
  value.className = "url-card-value";
  value.textContent = kind.itemLabel(item);
  const meta = document.createElement("span");
  meta.className = "stat-row-meta";
  const lastAt = kind.itemLastAt(item);
  meta.textContent = lastAt ? `Last ${kind.unitLabel}: ${formatDate(lastAt)}` : `No ${kind.unitLabel}s yet`;
  info.append(value, meta);

  const countWrap = document.createElement("div");
  countWrap.className = "stat-row-count-wrap";
  const countEl = document.createElement("span");
  countEl.className = "stat-row-count";
  const count = kind.itemCount(item);
  countEl.textContent = `${count} ${kind.unitLabel}${count === 1 ? "" : "s"}`;
  const bar = document.createElement("div");
  bar.className = "stat-bar";
  const barFill = document.createElement("div");
  barFill.className = "stat-bar-fill";
  barFill.style.width = max > 0 ? `${Math.round((count / max) * 100)}%` : "0%";
  bar.appendChild(barFill);
  countWrap.append(countEl, bar);

  row.append(info, countWrap);
  return row;
}

function createGroupStatCard(group, kind) {
  const card = document.createElement("div");
  card.className = "url-card";

  const topRow = kind.groupRow(group);

  const itemsRow = document.createElement("div");
  itemsRow.className = "url-card-row url-card-row--tiny";
  const items = kind.groupItems(group);
  const max = Math.max(...items.map(kind.itemCount), 0);
  for (const item of items) {
    itemsRow.append(createStatRow(item, max, kind));
  }

  const metaRow = document.createElement("div");
  metaRow.className = "url-card-meta-row";
  const totalBadge = document.createElement("span");
  totalBadge.className = "stat-total-badge";
  const total = kind.groupTotal(group);
  totalBadge.textContent = `${total} total ${kind.unitLabel}${total === 1 ? "" : "s"}`;
  metaRow.appendChild(totalBadge);

  card.append(topRow, itemsRow, metaRow);
  return card;
}
