async function generateUrl() {
  const input = document.getElementById("url-input");
  const result = document.getElementById("url-result");
  const url = input.value.trim();

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

    result.textContent = data.shortUrl;
  } catch {
    result.textContent = "Network error, try again.";
  }
}

document.getElementById("generate-btn").addEventListener("click", generateUrl);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") generateUrl();
});
