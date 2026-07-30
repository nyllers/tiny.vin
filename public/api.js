const SHORTEN_EXAMPLES = [
  { id: "generated-path", body: { url: "https://example.com" }, shortUrl: "tiny.vin/aZ3xQ72K" },
  { id: "custom-path", body: { url: "https://example.com", path: "my-page" }, shortUrl: "tiny.vin/my-page" },
  { id: "subdomain", body: { url: "https://example.com", subdomain: "my-name" }, shortUrl: "my-name.tiny.vin" },
];

function curlExample(key, body) {
  const keyPlaceholder = key || "YOUR_API_KEY";
  return [
    "curl -X POST https://tiny.vin/api/shorten \\",
    `  -H "Authorization: Bearer ${keyPlaceholder}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '${JSON.stringify(body)}'`,
  ].join("\n");
}

function responseExample(shortUrl) {
  return ["HTTP/1.1 201 Created", `Location: https://${shortUrl}`].join("\n");
}

function updateExamples(key) {
  for (const example of SHORTEN_EXAMPLES) {
    document.getElementById(`example-${example.id}`).textContent = curlExample(key, example.body);
    document.getElementById(`response-${example.id}`).textContent = responseExample(example.shortUrl);
  }
}

function setupExampleCopyButtons() {
  for (const example of SHORTEN_EXAMPLES) {
    const pre = document.getElementById(`example-${example.id}`);
    const copyBtn = createCopyIconButton();
    copyBtn.classList.add("api-example-copy");
    copyBtn.addEventListener("click", () => copyTextToClipboard(pre.textContent, pre));
    pre.parentElement.appendChild(copyBtn);
  }
}

function renderApiKeySection(key) {
  const section = document.getElementById("api-key-section");
  section.textContent = "";

  const intro = document.createElement("p");
  intro.className = "api-key-intro";

  if (!key) {
    intro.textContent = "Generate an API key to create tiny URLs from the command line.";
    const generateBtn = document.createElement("button");
    generateBtn.type = "button";
    generateBtn.className = "theme-btn active";
    generateBtn.innerHTML = "<span>Generate API Key</span>";
    generateBtn.addEventListener("click", () => createApiKey(generateBtn));
    section.append(intro, generateBtn);
  } else {
    intro.textContent = "Your API key:";
    const row = document.createElement("div");
    row.className = "url-card-copy-row api-key-row";
    const regenerateBtn = document.createElement("button");
    regenerateBtn.type = "button";
    regenerateBtn.className = "theme-btn active";
    regenerateBtn.innerHTML = "<span>Regenerate</span>";
    regenerateBtn.addEventListener("click", async () => {
      const confirmed = await confirmAction("This will invalidate your current API key.", {
        confirmLabel: "Regenerate",
      });
      if (confirmed) createApiKey(regenerateBtn);
    });
    row.append(createCopyableTextGroup(key), regenerateBtn);
    section.append(intro, row);
  }

  updateExamples(key);
}

async function createApiKey(triggerBtn) {
  triggerBtn.disabled = true;
  try {
    const response = await fetch("/api/keys", { method: "POST" });
    if (!response.ok) {
      alert("Could not create an API key, try again.");
      return;
    }
    const data = await response.json();
    renderApiKeySection(data.key);
  } catch {
    alert("Network error, try again.");
  } finally {
    triggerBtn.disabled = false;
  }
}

async function loadApiKey() {
  const data = await fetchJsonOrNull("/api/keys");
  renderApiKeySection(data ? data.key : null);
}

setupExampleCopyButtons();
loadApiKey();
