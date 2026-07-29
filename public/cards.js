async function fetchJsonOrNull(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function createOriginalUrlRow(originalUrl) {
  const row = document.createElement("div");
  row.className = "url-card-row";
  const value = document.createElement("span");
  value.className = "url-card-value url-card-value--original";
  value.title = originalUrl;
  value.textContent = originalUrl;
  row.append(value);
  return row;
}

function createCardsSection(headingText, items, renderItem) {
  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = headingText;
  const grid = document.createElement("div");
  grid.className = "url-cards";
  for (const item of items) {
    grid.appendChild(renderItem(item));
  }
  const fragment = document.createDocumentFragment();
  fragment.append(heading, grid);
  return fragment;
}
