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

async function copyTextToClipboard(text, displayEl) {
  try {
    await navigator.clipboard.writeText(text);
    displayEl.textContent = "Copied to clipboard!";
    setTimeout(() => {
      displayEl.textContent = text;
    }, 1000);
  } catch {
    displayEl.textContent = "Could not copy to clipboard";
    setTimeout(() => {
      displayEl.textContent = text;
    }, 1000);
  }
}

function createCopyIconButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn copy-link-btn";
  button.title = "Copy to clipboard";
  button.setAttribute("aria-label", "Copy to clipboard");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="9" width="13" height="13" rx="2" style="stroke-width:1.2;stroke-dasharray:none"/>
	<path d="M5.967 14.937h-1c-.575 0-1.534.072-2.15-.3C2.25 14.293 2 13.528 2 13V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1.904" style="stroke-width:1.2;stroke-dasharray:none"/>
    <g stroke-width="2.6">
	  <path d="M10.922 12.654a2.744 2.78 0 0 0 4.137.3l1.647-1.668a2.744 2.78 0 0 0-3.88-3.932l-.944.95" style="stroke-width:1.2;stroke-dasharray:none" transform="matrix(.76 0 0 .76 6.4 6.4)"/>
      <path d="M13.117 11.542a2.744 2.78 0 0 0-4.137-.3L7.333 12.91a2.744 2.78 0 0 0 3.88 3.932l.938-.951" style="stroke-width:1.2;stroke-dasharray:none" transform="matrix(.76 0 0 .76 6.4 6.4)"/>
	</g>
  </svg>`;
  return button;
}

function createCopyableTextGroup(text) {
  const group = document.createElement("span");
  group.className = "url-card-copy-group";
  group.title = "Copy to clipboard";
  const value = document.createElement("span");
  value.className = "url-card-value url-card-copy-text";
  value.textContent = text;
  const copyBtn = createCopyIconButton();
  const copy = () => copyTextToClipboard(text, value);
  value.addEventListener("click", copy);
  copyBtn.addEventListener("click", copy);
  group.addEventListener("click", copy);
  group.append(value, copyBtn);
  return group;
}
