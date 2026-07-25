import { buildAuthorizeUrl, exchangeCodeForToken, fetchUserInfo } from "./providers.js";
import { parseCookies, createSessionCookie, clearSessionCookie, getSession, randomState } from "./session.js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LENGTH = 12;
const MAX_ATTEMPTS = 5;
const CODE_PATTERN = /^\/([A-Za-z0-9]{12})$/;
const AUTH_PATTERN = /^\/auth\/(google|facebook)\/(start|callback)$/;

const LOGIN_ERRORS = {
  oauth_failed: "Something went wrong signing in. Please try again.",
  state_mismatch: "Your sign-in request expired. Please try again.",
};

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

function loginPage(errorCode) {
  const message = LOGIN_ERRORS[errorCode];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tiny.vin — Sign in</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main>
    <h1>Tiny URL</h1>
    <p class="login-subtitle">Sign in to create short URLs</p>
    ${message ? `<p class="login-error">${message}</p>` : ""}
    <div class="login-buttons">
      <a class="provider-btn google-btn" href="/auth/google/start">Continue with Google</a>
      <a class="provider-btn facebook-btn" href="/auth/facebook/start">Continue with Facebook</a>
    </div>
  </main>
  <footer>Simple project by Anders &amp; Claude</footer>
</body>
</html>`;
}

function htmlResponse(body, extraHeaders = {}) {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders },
  });
}

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

  const validation = validateUrl(url);
  if (validation.error) {
    return jsonResponse({ error: validation.error }, 400);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      await env.DB.prepare(
        "INSERT INTO urls (code, original_url, created_at) VALUES (?, ?, ?)"
      )
        .bind(code, validation.url, Date.now())
        .run();
      return jsonResponse({
        code,
        originalUrl: validation.url,
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

function handleAuthStart(provider, url, env) {
  const state = randomState();
  const redirectUri = `${url.origin}/auth/${provider}/callback`;
  const authorizeUrl = buildAuthorizeUrl(provider, env, redirectUri, state);

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl,
      "set-cookie": `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
}

async function recordLogin(env, provider, username, ipAddress) {
  try {
    await env.DB.prepare(
      "INSERT INTO login_identities (provider, username) VALUES (?, ?) ON CONFLICT (provider, username) DO NOTHING"
    )
      .bind(provider, username)
      .run();

    const identity = await env.DB.prepare(
      "SELECT id FROM login_identities WHERE provider = ? AND username = ?"
    )
      .bind(provider, username)
      .first();

    await env.DB.prepare(
      "INSERT INTO login_events (identity_id, logged_in_at, ip_address) VALUES (?, ?, ?)"
    )
      .bind(identity.id, Date.now(), ipAddress)
      .run();
  } catch {
    // login tracking is best-effort; never block sign-in over it
  }
}

async function handleAuthCallback(provider, url, request, env) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request);

  if (!code || !state || !cookies.oauth_state || cookies.oauth_state !== state) {
    return Response.redirect(`${url.origin}/login?error=state_mismatch`, 302);
  }

  try {
    const redirectUri = `${url.origin}/auth/${provider}/callback`;
    const accessToken = await exchangeCodeForToken(provider, env, redirectUri, code);
    const user = await fetchUserInfo(provider, accessToken);

    if (!user.email) throw new Error("No email returned by provider");

    const ipAddress = request.headers.get("CF-Connecting-IP");
    await recordLogin(env, provider, user.email, ipAddress);

    const sessionCookie = await createSessionCookie(user, env.SESSION_SECRET);

    return new Response(null, {
      status: 302,
      headers: {
        location: `${url.origin}/`,
        "set-cookie": sessionCookie,
      },
    });
  } catch {
    return Response.redirect(`${url.origin}/login?error=oauth_failed`, 302);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/login") {
      return htmlResponse(loginPage(url.searchParams.get("error")));
    }

    if (url.pathname === "/auth/logout") {
      return new Response(null, {
        status: 302,
        headers: { location: "/login", "set-cookie": clearSessionCookie() },
      });
    }

    const authMatch = url.pathname.match(AUTH_PATTERN);
    if (authMatch && request.method === "GET") {
      const [, provider, step] = authMatch;
      if (step === "start") return handleAuthStart(provider, url, env);
      return handleAuthCallback(provider, url, request, env);
    }

    const codeMatch = url.pathname.match(CODE_PATTERN);
    if (request.method === "GET" && codeMatch) {
      return handleRedirect(codeMatch[1], env);
    }

    if (request.method === "POST" && url.pathname === "/api/shorten") {
      const session = await getSession(request, env.SESSION_SECRET);
      if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
      return handleShorten(request, env);
    }

    if (url.pathname === "/") {
      const session = await getSession(request, env.SESSION_SECRET);
      if (!session) return Response.redirect(`${url.origin}/login`, 302);
    }

    return env.ASSETS.fetch(request);
  },
};
