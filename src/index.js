import { buildAuthorizeUrl, exchangeCodeForToken, fetchUserInfo } from "./providers.js";
import { parseCookies, createSessionCookie, clearSessionCookie, getSession, randomState } from "./session.js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LENGTH = 8;
const MAX_ATTEMPTS = 5;
const CODE_PATTERN = /^\/([A-Za-z0-9]{1,32})$/;
const AUTH_PATTERN = /^\/auth\/google\/(start|callback)$/;
const DELETE_URL_PATTERN = /^\/api\/urls\/([A-Za-z0-9]+)$/;
const RESERVED_CODES = new Set(["login"]);

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
  <title>Tiny VIN</title>
  <meta name="description" content="Tiny VIN is a simple link-shortening tool. Signing in with Google lets us identify your account by your Google email address and name, so you can create, view, and delete your own short links. No other data is requested, and anyone can follow a shortened link without signing in.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://tiny.vin">
  <meta property="og:site_name" content="Tiny VIN">
  <meta property="og:title" content="Tiny VIN">
  <meta property="og:description" content="Tiny VIN is a simple link-shortening tool. Signing in with Google lets us identify your account by your Google email address and name, so you can create, view, and delete your own short links. No other data is requested, and anyone can follow a shortened link without signing in.">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main class="panel">
    <h1>Tiny VIN</h1>
    <div class="login-buttons">
      <a class="provider-btn" href="/auth/google/start">
        <svg class="provider-icon" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
          <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
          <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
          <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
        </svg>
        <span>Sign in with Google</span>
      </a>
    </div>
    ${message ? `<p class="login-error">${message}</p>` : ""}
    <p class="login-subtitle">Tiny VIN is a simple link-shortening tool. Signing in with Google lets us identify your account by your Google email address and name, so you can create, view, and delete your own short links. No other data is requested, and anyone can follow a shortened link without signing in.</p>
  </main>
  <p class="legal-links"><a href="/privacy.html">Privacy Policy</a> &middot; <a href="/terms.html">Terms of Service</a></p>
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

function validateSuffix(input) {
  if (!/^[A-Za-z0-9]{1,32}$/.test(input)) {
    return { error: "Custom short URLs can only contain letters and numbers (1-32 characters)." };
  }

  if (RESERVED_CODES.has(input.toLowerCase())) {
    return { error: `"${input}" is reserved, try another.` };
  }

  return { code: input };
}

async function handleShorten(request, env, session) {
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

  const customSuffix = typeof body.code === "string" ? body.code.trim() : "";
  let customCode = null;
  if (customSuffix) {
    const suffixValidation = validateSuffix(customSuffix);
    if (suffixValidation.error) {
      return jsonResponse({ error: suffixValidation.error }, 400);
    }
    customCode = suffixValidation.code;
  }

  const createdBy = await getOrCreateIdentityId(env, session.provider, session.email);

  if (customCode) {
    try {
      await env.DB.prepare(
        "INSERT INTO urls (code, original_url, created_at, created_by) VALUES (?, ?, ?, ?)"
      )
        .bind(customCode, validation.url, Date.now(), createdBy)
        .run();
      return jsonResponse({
        code: customCode,
        originalUrl: validation.url,
        shortUrl: `https://tiny.vin/${customCode}`,
      });
    } catch {
      return jsonResponse({ error: `"${customCode}" is already taken, try another.` }, 409);
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      await env.DB.prepare(
        "INSERT INTO urls (code, original_url, created_at, created_by) VALUES (?, ?, ?, ?)"
      )
        .bind(code, validation.url, Date.now(), createdBy)
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

async function getIdentityId(env, provider, username) {
  const identity = await env.DB.prepare(
    "SELECT id FROM login_identities WHERE provider = ? AND username = ?"
  )
    .bind(provider, username)
    .first();

  return identity ? identity.id : null;
}

async function handleHistory(env, session) {
  const identityId = await getIdentityId(env, session.provider, session.email);

  const { results } = await env.DB.prepare(
    "SELECT code, original_url, created_at FROM urls WHERE created_by = ? ORDER BY created_at DESC"
  )
    .bind(identityId)
    .all();

  const groups = new Map();
  for (const row of results) {
    if (!groups.has(row.original_url)) {
      groups.set(row.original_url, []);
    }
    groups.get(row.original_url).push({
      code: row.code,
      shortUrl: `https://tiny.vin/${row.code}`,
      createdAt: row.created_at,
    });
  }

  return jsonResponse({
    urls: Array.from(groups, ([originalUrl, shortUrls]) => ({
      originalUrl,
      createdAt: shortUrls[0].createdAt,
      shortUrls,
    })),
  });
}

async function handleDeleteUrl(code, env, session) {
  const identityId = await getIdentityId(env, session.provider, session.email);

  const result = await env.DB.prepare(
    "DELETE FROM urls WHERE code = ? AND created_by = ?"
  )
    .bind(code, identityId)
    .run();

  if (!result.meta.changes) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  return jsonResponse({ ok: true });
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

function handleAuthStart(url, env) {
  const state = randomState();
  const redirectUri = `${url.origin}/auth/google/callback`;
  const authorizeUrl = buildAuthorizeUrl(env, redirectUri, state);

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl,
      "set-cookie": `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
}

async function getOrCreateIdentityId(env, provider, username) {
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

  return identity.id;
}

async function recordLogin(env, provider, username, ipAddress) {
  try {
    const identityId = await getOrCreateIdentityId(env, provider, username);

    await env.DB.prepare(
      "INSERT INTO login_events (identity_id, logged_in_at, ip_address) VALUES (?, ?, ?)"
    )
      .bind(identityId, Date.now(), ipAddress)
      .run();
  } catch {
    // login tracking is best-effort; never block sign-in over it
  }
}

async function handleAuthCallback(url, request, env) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request);

  if (!code || !state || !cookies.oauth_state || cookies.oauth_state !== state) {
    return Response.redirect(`${url.origin}/login?error=state_mismatch`, 302);
  }

  try {
    const redirectUri = `${url.origin}/auth/google/callback`;
    const accessToken = await exchangeCodeForToken(env, redirectUri, code);
    const user = await fetchUserInfo(accessToken);

    if (!user.email) throw new Error("No email returned by provider");

    const ipAddress = request.headers.get("CF-Connecting-IP");
    await recordLogin(env, user.provider, user.email, ipAddress);

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
      const [, step] = authMatch;
      if (step === "start") return handleAuthStart(url, env);
      return handleAuthCallback(url, request, env);
    }

    const codeMatch = url.pathname.match(CODE_PATTERN);
    if (request.method === "GET" && codeMatch) {
      return handleRedirect(codeMatch[1], env);
    }

    if (request.method === "POST" && url.pathname === "/api/shorten") {
      const session = await getSession(request, env.SESSION_SECRET);
      if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
      return handleShorten(request, env, session);
    }

    if (request.method === "GET" && url.pathname === "/api/history") {
      const session = await getSession(request, env.SESSION_SECRET);
      if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
      return handleHistory(env, session);
    }

    const deleteMatch = url.pathname.match(DELETE_URL_PATTERN);
    if (request.method === "DELETE" && deleteMatch) {
      const session = await getSession(request, env.SESSION_SECRET);
      if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
      return handleDeleteUrl(deleteMatch[1], env, session);
    }

    if (url.pathname === "/") {
      const session = await getSession(request, env.SESSION_SECRET);
      if (!session) return htmlResponse(loginPage());
    }

    return env.ASSETS.fetch(request);
  },
};
