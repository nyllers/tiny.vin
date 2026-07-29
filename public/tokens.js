function applyTokenPrices() {
  if (!window.TOKEN_COSTS) return;
  document.querySelectorAll("[data-price-kind]").forEach((el) => {
    const cost = window.TOKEN_COSTS[el.getAttribute("data-price-kind")];
    if (cost) el.textContent = `${cost.create} tokens`;
  });
}

async function loadTokenIndicator() {
  const indicator = document.getElementById("token-indicator");

  const data = await fetchJsonOrNull("/api/tokens");
  if (!data) return;

  window.TOKEN_COSTS = data.costs;
  applyTokenPrices();

  if (!indicator) return;

  const monthsText =
    data.monthsRemaining === null
      ? "no ongoing costs"
      : `lasts ~${data.monthsRemaining} month${data.monthsRemaining === 1 ? "" : "s"}`;

  indicator.textContent = `${data.balance} token${data.balance === 1 ? "" : "s"} · ${monthsText}`;
  indicator.hidden = false;
}

loadTokenIndicator();
