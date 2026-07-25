const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LENGTH = 12;
const MAX_ATTEMPTS = 5;
const CODE_PATTERN = /^\/([A-Za-z0-9]{12})$/;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function generateCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

async function handleShorten(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return jsonResponse({ error: "Missing url" }, 400);
  }

  try {
    new URL(url);
  } catch {
    return jsonResponse({ error: "Invalid URL" }, 400);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      await env.DB.prepare(
        "INSERT INTO urls (code, original_url, created_at) VALUES (?, ?, ?)"
      )
        .bind(code, url, Date.now())
        .run();
      return jsonResponse({
        code,
        originalUrl: url,
        shortUrl: `https://tiny.vin/${code}`,
      });
    } catch {
      // code collision, retry with a new random code
    }
  }

  return jsonResponse({ error: "Could not generate a unique code, try again" }, 500);
}

async function handleRedirect(code, env) {
  const row = await env.DB.prepare(
    "SELECT original_url FROM urls WHERE code = ?"
  )
    .bind(code)
    .first();

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  return Response.redirect(row.original_url, 302);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/shorten") {
      return handleShorten(request, env);
    }

    const codeMatch = url.pathname.match(CODE_PATTERN);
    if (request.method === "GET" && codeMatch) {
      return handleRedirect(codeMatch[1], env);
    }

    return env.ASSETS.fetch(request);
  },
};
