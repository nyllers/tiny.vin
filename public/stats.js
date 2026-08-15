const URL_STAT_KIND = {
  unitLabel: "redirect",
  itemLabel: (s) => s.shortUrl,
  itemCount: (s) => s.clicks,
  itemLastAt: (s) => s.lastClickAt,
  groupRow: (g) => createOriginalUrlRow(g.originalUrl),
  groupItems: (g) => g.shortUrls,
  groupTotal: (g) => g.totalClicks,
};

function createStatCard(group) {
  return createGroupStatCard(group, URL_STAT_KIND);
}

function flattenShortUrls(urls) {
  return topByCount(
    urls.flatMap((group) => group.shortUrls.map((shortUrlItem) => ({ ...shortUrlItem, originalUrl: group.originalUrl }))),
    "clicks"
  );
}

function createUrlBreakdownChartCard(entries) {
  return createBreakdownChartCard("Redirects per URL", entries, {
    chartAriaLabel: "Redirects per URL",
    labelFor: (e) => e.code,
    describeEntry: (e) => `${e.shortUrl} (${e.originalUrl}): ${e.count} redirect${e.count === 1 ? "" : "s"}`,
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
    breakdownCards.push(
      createNameCountChartCard("Redirects by Browser", "Redirects by browser", data.browsers.slice(0, BAR_CHART_LIMIT), "redirect")
    );
  }
  if (data.topReferrers && data.topReferrers.length > 0) {
    breakdownCards.push(
      createNameCountChartCard("Redirects by Referer", "Redirects by referer", data.topReferrers.slice(0, BAR_CHART_LIMIT), "redirect")
    );
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
