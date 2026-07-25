let currentShortUrl = "";

function validateUrl(input) {
  if (!input.includes("://")) {
    if (/\s/.test(input)) {
      return { error: "That doesn't look like a URL. Try a format like: https://example.com" };
    }
    return { error: `Missing "http://" or "https://" at the start. Try: https://${input}` };
  }

  const scheme = input.slice(0, input.indexOf("://")).toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return {
      error: `"${scheme}://" links aren't supported, only http:// and https://. Try: https://example.com`,
    };
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { error: "That doesn't look like a valid URL. Try a format like: https://example.com/page" };
  }

  if (!parsed.hostname || (!parsed.hostname.includes(".") && parsed.hostname !== "localhost")) {
    return {
      error: `"${parsed.hostname}" doesn't look like a real domain. Try a format like: https://example.com`,
    };
  }

  return { url: parsed.href };
}

async function generateUrl() {
  const input = document.getElementById("url-input");
  const result = document.getElementById("url-result");
  const copyBtn = document.getElementById("copy-btn");
  const url = input.value.trim();

  currentShortUrl = "";
  copyBtn.hidden = true;

  if (!url) {
    result.textContent = "Enter a URL first.";
    return;
  }

  const validation = validateUrl(url);
  if (validation.error) {
    result.textContent = validation.error;
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
    copyBtn.hidden = false;
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
document.getElementById("copy-btn").addEventListener("click", copyResult);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") generateUrl();
});
