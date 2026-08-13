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

function flattenShortUrls(urls) {
  return urls
    .flatMap((group) => group.shortUrls.map((shortUrlItem) => ({ ...shortUrlItem, originalUrl: group.originalUrl })))
    .filter((entry) => entry.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, BAR_CHART_LIMIT);
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

// World map: an equirectangular projection with the real (simplified)
// landmass outline from public-domain Natural Earth data behind a dot per
// distinct lat/lng, radius scaled by count. See world-map-path.js for the
// outline's provenance.
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
  svg.setAttribute("aria-label", "Redirected geographic locations, last 14 days");

  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", String(MAP_WIDTH));
  background.setAttribute("height", String(MAP_HEIGHT));
  background.setAttribute("class", "world-map-bg");
  svg.appendChild(background);

  const land = document.createElementNS(SVG_NS, "path");
  land.setAttribute("d", WORLD_LAND_PATH);
  land.setAttribute("class", "world-map-land");
  svg.appendChild(land);

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
  card.className = "url-card url-card--span-2";

  const header = createCardHeader("Redirected Geographic Locations", () =>
    openChartModal("Redirected Geographic Locations", () => {
      const fragment = document.createDocumentFragment();
      fragment.append(createWorldMapSvg(points));
      return fragment;
    })
  );

  card.append(header, createWorldMapSvg(points));
  return card;
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
    breakdownCards.push(createDailyChartCard(data.dailyRedirects, "Number of Redirects", "redirect"));
  }
  const urlChartEntries = flattenShortUrls(data.urlBreakdown14d || []);
  if (urlChartEntries.length > 0) {
    breakdownCards.push(createUrlBreakdownChartCard(urlChartEntries));
  }
  if (data.browsers && data.browsers.length > 0) {
    breakdownCards.push(createBrowserChartCard(data.browsers.slice(0, BAR_CHART_LIMIT)));
  }
  if (data.topReferrers && data.topReferrers.length > 0) {
    breakdownCards.push(createRefererChartCard(data.topReferrers.slice(0, BAR_CHART_LIMIT)));
  }
  if (data.mapPoints && data.mapPoints.length > 0) {
    breakdownCards.push(createWorldMapCard(data.mapPoints));
  }
  if (breakdownCards.length > 0) {
    list.append(createCardsSectionFromElements("BREAKDOWN LAST 14 DAYS", breakdownCards));
  }

  list.append(createCardsSection("TOTAL REDIRECTS BY URL", data.urls, createStatCard));
}

loadStats();
