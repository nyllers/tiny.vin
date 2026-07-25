let currentShortUrl = "";

async function generateUrl() {
  const input = document.getElementById("url-input");
  const result = document.getElementById("url-result");
  const url = input.value.trim();

  currentShortUrl = "";

  if (!url) {
    result.textContent = "Enter a URL first.";
    return;
  }

  result.textContent = "Generating...";

  try {
    const response = await fetch("/api/shorten", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();

    if (!response.ok) {
      result.textContent = data.error || "Something went wrong.";
      return;
    }

    currentShortUrl = data.shortUrl;
    result.textContent = data.shortUrl;
    result.title = "Click to copy";
  } catch {
    result.textContent = "Network error, try again.";
  }
}

async function copyResult() {
  const result = document.getElementById("url-result");
  if (!currentShortUrl || result.textContent !== currentShortUrl) return;

  try {
    await navigator.clipboard.writeText(currentShortUrl);
    result.textContent = "Copied!";
    setTimeout(() => {
      result.textContent = currentShortUrl;
    }, 1000);
  } catch {
    result.textContent = "Could not copy, select the text manually.";
  }
}

document.getElementById("generate-btn").addEventListener("click", generateUrl);
document.getElementById("url-result").addEventListener("click", copyResult);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") generateUrl();
});
