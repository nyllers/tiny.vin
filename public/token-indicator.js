async function loadTokenIndicator() {
  const indicator = document.getElementById("token-indicator");
  if (!indicator) return;

  const data = await fetchJsonOrNull("/api/tokens");
  if (!data) return;

  const monthsRemaining = data.monthlyBurn > 0 ? Math.floor(data.balance / data.monthlyBurn) : null;
  const monthsText =
    monthsRemaining === null ? "no ongoing costs" : `lasts ~${monthsRemaining} month${monthsRemaining === 1 ? "" : "s"}`;

  indicator.textContent = `${data.balance} token${data.balance === 1 ? "" : "s"} · ${monthsText}`;
  indicator.hidden = false;
}

loadTokenIndicator();
