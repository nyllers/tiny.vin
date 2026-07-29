import { buildAuthorizeUrl, exchangeCodeForToken, fetchUserInfo } from "./providers.js";
import { parseCookies, createSessionCookie, clearSessionCookie, getSession, randomState } from "./session.js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UPPERCASE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_LENGTH = 8;
const MAX_ATTEMPTS = 5;
const CODE_PATTERN = /^\/([A-Za-z0-9]{1,32})$/;
const SUBDOMAIN_REDIRECT_PATTERN = /^\/subdomain\/([a-z0-9-]{1,63})$/;
const AUTH_PATTERN = /^\/auth\/google\/(start|callback)$/;
const DELETE_URL_PATTERN = /^\/api\/urls\/([A-Za-z0-9-]+)$/;
const RESERVED_CODES = new Set(["login", "subdomain", "stats", "privacy", "terms"]);
const PROTECTED_PAGES = new Set(["/", "/stats", "/stats.html"]);

const VALID_KINDS = new Set(["generated-path", "custom-path", "subdomain"]);
const TOKEN_COSTS = {
  "generated-path": { create: 10, upkeep: 1 },
  "custom-path": { create: 25, upkeep: 10 },
  subdomain: { create: 50, upkeep: 20 },
};
const SIGNUP_BONUS_TOKENS = 100;
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const LOGIN_ERRORS = {
  oauth_failed: "Something went wrong signing in. Please try again.",
  state_mismatch: "Your sign-in request expired. Please try again.",
};

const SITE_DESCRIPTION =
  "tiny.vin is a simple URL-shortening tool. Signing in with Google lets us identify your account by your Google email address and name, so you can create, view, and delete your own tiny URLs. No other data is requested, and anyone can follow a tiny URL without signing in.";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withAuth(request, env, handler) {
  const session = await getSession(request, env.SESSION_SECRET);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  return handler(session);
}

function generateCode() {
  const forcedUppercaseIndex = Math.floor(Math.random() * CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (i === forcedUppercaseIndex) {
      code += UPPERCASE_CHARS[Math.floor(Math.random() * UPPERCASE_CHARS.length)];
    } else {
      code += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
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
  <title>tiny.vin</title>
  <meta name="description" content="${SITE_DESCRIPTION}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://tiny.vin">
  <meta property="og:site_name" content="tiny.vin">
  <meta property="og:title" content="tiny.vin">
  <meta property="og:description" content="${SITE_DESCRIPTION}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
  <script src="/theme-init.js"></script>
</head>
<body>
  <div class="site-nav">
    <a class="wordmark" href="/">tin<span class="accent-dot">y.v</span>in</a>
  </div>
  <div class="theme-toggle" role="group" aria-label="Theme">
    <button type="button" class="theme-btn" data-theme-value="light">Light</button>
    <button type="button" class="theme-btn" data-theme-value="dark">Dark</button>
  </div>
  <main class="panel">
    <p class="heading-large">tiny<span class="heading-large-accent-dot">.</span>vin</p>
    <p class="login-instruction">Sign in and paste or enter a URL to shorten it. Then share it &ndash; it's available to everyone!</p>
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
    <details class="info-toggle">
      <summary>What is tiny.vin?</summary>
      <p>${SITE_DESCRIPTION}</p>
    </details>
  </main>
  <p class="legal-links"><a href="/privacy.html">Privacy Policy</a> &middot; <a href="/terms.html">Terms of Service</a></p>
  <footer>Simple project by Anders &amp; Claude</footer>
  <script src="/theme.js"></script>
</body>
</html>`;
}

function htmlResponse(body, extraHeaders = {}) {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders },
  });
}

function isValidHostname(hostname) {
  return Boolean(hostname) && (hostname.includes(".") || hostname === "localhost");
}

async function urlExists(url) {
  const headers = { "user-agent": "Mozilla/5.0 (compatible; TinyVINBot/1.0; +https://tiny.vin)" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const headResponse = await fetch(url, { method: "HEAD", redirect: "follow", headers, signal: controller.signal });
    if (headResponse.ok) return true;

    const getResponse = await fetch(url, { method: "GET", redirect: "follow", headers, signal: controller.signal });
    return getResponse.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function validateUrl(input) {
  if (!input.includes("://")) {
    if (/\s/.test(input)) {
      return { error: "That doesn't look like a URL. Try a format like: https://example.com" };
    }

    let parsed;
    try {
      parsed = new URL(`https://${input}`);
    } catch {
      return { error: "That doesn't look like a valid URL. Try a format like: https://example.com/page" };
    }

    if (!isValidHostname(parsed.hostname)) {
      return {
        error: `"${parsed.hostname}" doesn't look like a real domain. Try a format like: https://example.com`,
      };
    }

    const httpsUrl = `https://${input}`;
    const httpUrl = `http://${input}`;
    const foundUrl = (await urlExists(httpsUrl)) ? httpsUrl : (await urlExists(httpUrl)) ? httpUrl : null;

    if (!foundUrl) {
      return { error: `We couldn't find a live webpage at "${input}". Double check the address and try again.` };
    }

    if (foundUrl.length <= 10) {
      return { error: "The given URL is already teeny-weeny!" };
    }

    return { url: foundUrl };
  }

  const scheme = input.slice(0, input.indexOf("://")).toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return {
      error: `"${scheme}://" URLs aren't supported, only http:// and https://. Try: https://example.com`,
    };
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { error: "That doesn't look like a valid URL. Try a format like: https://example.com/page" };
  }

  if (!isValidHostname(parsed.hostname)) {
    return {
      error: `"${parsed.hostname}" doesn't look like a real domain. Try a format like: https://example.com`,
    };
  }

  if (input.length <= 10) {
    return { error: "The given URL is already teeny-weeny!" };
  }

  if (!(await urlExists(input))) {
    return { error: "We couldn't find a live webpage at that address. Double check it and try again." };
  }

  return { url: input };
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

function validateSubdomain(input) {
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(input)) {
    return {
      error:
        "Subdomains can only contain lowercase letters, numbers, and hyphens (not at the start or end), 1-63 characters.",
    };
  }

  if (RESERVED_CODES.has(input)) {
    return { error: `"${input}" is reserved, try another.` };
  }

  return { code: input };
}

function formatShortUrl(code, kind) {
  return kind === "subdomain" ? `${code}.tiny.vin` : `tiny.vin/${code}`;
}

async function insertUrl(env, { code, kind, originalUrl, createdBy, createdAt, paidThroughAt }) {
  await env.DB.prepare(
    "INSERT INTO urls (code, kind, original_url, created_at, created_by, paid_through_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(code, kind, originalUrl, createdAt, createdBy, paidThroughAt)
    .run();
}

function shortUrlResponse(code, kind, originalUrl) {
  return jsonResponse({ code, kind, originalUrl, shortUrl: formatShortUrl(code, kind) });
}

async function getTokenBalance(env, identityId) {
  const row = await env.DB.prepare("SELECT token_balance FROM login_identities WHERE id = ?")
    .bind(identityId)
    .first();
  return row ? row.token_balance : 0;
}

async function logTokenEvent(env, identityId, amount, reason, { code = null, kind = null } = {}) {
  await env.DB.prepare(
    "INSERT INTO token_transactions (identity_id, amount, reason, code, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(identityId, amount, reason, code, kind, Date.now())
    .run();
}

async function debitTokens(env, identityId, amount, reason, extra = {}) {
  await env.DB.prepare("UPDATE login_identities SET token_balance = token_balance - ? WHERE id = ?")
    .bind(amount, identityId)
    .run();
  await logTokenEvent(env, identityId, -amount, reason, extra);
}

async function createShortUrl(env, { code, kind, originalUrl, createdBy }) {
  const cost = TOKEN_COSTS[kind].create;
  const balance = await getTokenBalance(env, createdBy);
  if (balance < cost) {
    return { insufficientBalance: true, balance, cost };
  }

  const now = Date.now();
  try {
    await insertUrl(env, { code, kind, originalUrl, createdBy, createdAt: now, paidThroughAt: now + ONE_MONTH_MS });
  } catch {
    return { conflict: true };
  }

  await debitTokens(env, createdBy, cost, `create_${kind}`, { code, kind });
  return { ok: true };
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

  const validation = await validateUrl(url);
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

  const customSubdomain = typeof body.subdomain === "string" ? body.subdomain.trim() : "";
  let subdomainCode = null;
  if (customSubdomain) {
    const subdomainValidation = validateSubdomain(customSubdomain);
    if (subdomainValidation.error) {
      return jsonResponse({ error: subdomainValidation.error }, 400);
    }
    subdomainCode = subdomainValidation.code;
  }

  const createdBy = await getOrCreateIdentityId(env, session.provider, session.email);

  if (subdomainCode) {
    const result = await createShortUrl(env, { code: subdomainCode, kind: "subdomain", originalUrl: validation.url, createdBy });
    if (result.insufficientBalance) {
      return jsonResponse(
        { error: `Adding a subdomain costs ${result.cost} tokens, but you only have ${result.balance}.` },
        402
      );
    }
    if (result.conflict) {
      return jsonResponse({ error: `"${subdomainCode}.tiny.vin" is already taken, try another.` }, 409);
    }
    return shortUrlResponse(subdomainCode, "subdomain", validation.url);
  }

  if (customCode) {
    const result = await createShortUrl(env, { code: customCode, kind: "custom-path", originalUrl: validation.url, createdBy });
    if (result.insufficientBalance) {
      return jsonResponse(
        { error: `Adding a custom path costs ${result.cost} tokens, but you only have ${result.balance}.` },
        402
      );
    }
    if (result.conflict) {
      return jsonResponse({ error: `"${customCode}" is already taken, try another.` }, 409);
    }
    return shortUrlResponse(customCode, "custom-path", validation.url);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode();
    const result = await createShortUrl(env, { code, kind: "generated-path", originalUrl: validation.url, createdBy });
    if (result.insufficientBalance) {
      return jsonResponse(
        { error: `Creating a tiny URL costs ${result.cost} tokens, but you only have ${result.balance}.` },
        402
      );
    }
    if (result.conflict) continue;
    return shortUrlResponse(code, "generated-path", validation.url);
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
    "SELECT code, kind, original_url, created_at FROM urls WHERE created_by = ? ORDER BY created_at DESC"
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
      kind: row.kind,
      shortUrl: formatShortUrl(row.code, row.kind),
      createdAt: row.created_at,
    });
  }

  const urls = Array.from(groups, ([originalUrl, shortUrls]) => ({
    originalUrl,
    createdAt: shortUrls[shortUrls.length - 1].createdAt,
    shortUrls,
  }));

  urls.sort((a, b) => b.createdAt - a.createdAt);

  return jsonResponse({ urls });
}

function normalizeReferrer(referer) {
  if (!referer) return "Direct";
  try {
    const hostname = new URL(referer).hostname.replace(/^www\./, "");
    return hostname || "Direct";
  } catch {
    return "Direct";
  }
}

function parseUserAgent(userAgent) {
  if (!userAgent) return { browser: "Unknown", device: "Unknown" };
  if (/bot|crawl|spider|slurp/i.test(userAgent)) return { browser: "Bot", device: "Bot" };

  let browser = "Other";
  if (/Edg\//.test(userAgent)) browser = "Edge";
  else if (/OPR\/|Opera/.test(userAgent)) browser = "Opera";
  else if (/Chrome\//.test(userAgent)) browser = "Chrome";
  else if (/Firefox\//.test(userAgent)) browser = "Firefox";
  else if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) browser = "Safari";

  let device = "Desktop";
  if (/iPad|Tablet/i.test(userAgent)) device = "Tablet";
  else if (/Mobi|Android|iPhone/i.test(userAgent)) device = "Mobile";

  return { browser, device };
}

function topCounts(counts, limit) {
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function handleTokens(env, session) {
  const identityId = await getIdentityId(env, session.provider, session.email);
  const balance = await getTokenBalance(env, identityId);

  const { results } = await env.DB.prepare(
    "SELECT kind, COUNT(*) AS cnt FROM urls WHERE created_by = ? AND paid_through_at IS NOT NULL GROUP BY kind"
  )
    .bind(identityId)
    .all();

  let monthlyBurn = 0;
  for (const row of results) {
    monthlyBurn += TOKEN_COSTS[row.kind].upkeep * row.cnt;
  }

  const monthsRemaining = monthlyBurn > 0 ? Math.floor(balance / monthlyBurn) : null;

  return jsonResponse({ balance, costs: TOKEN_COSTS, monthlyBurn, monthsRemaining });
}

async function handleStats(env, session) {
  const identityId = await getIdentityId(env, session.provider, session.email);

  const { results } = await env.DB.prepare(
    `SELECT u.code, u.kind, u.original_url, u.created_at,
            COUNT(re.id) AS clicks,
            MAX(re.requested_at) AS last_click
     FROM urls u
     LEFT JOIN redirect_events re ON re.code = u.code AND re.kind = u.kind
     WHERE u.created_by = ?
     GROUP BY u.code, u.kind
     ORDER BY u.created_at DESC`
  )
    .bind(identityId)
    .all();

  const { results: topCountryRows } = await env.DB.prepare(
    `SELECT re.country AS country, COUNT(*) AS cnt
     FROM redirect_events re
     JOIN urls u ON u.code = re.code AND u.kind = re.kind
     WHERE u.created_by = ? AND re.country IS NOT NULL
     GROUP BY re.country
     ORDER BY cnt DESC
     LIMIT 5`
  )
    .bind(identityId)
    .all();

  const dailyWindowDays = 14;
  const dailyCutoff = Date.now() - dailyWindowDays * 24 * 60 * 60 * 1000;
  const { results: dailyRows } = await env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', re.requested_at / 1000, 'unixepoch') AS day,
            COUNT(*) AS cnt
     FROM redirect_events re
     JOIN urls u ON u.code = re.code AND u.kind = re.kind
     WHERE u.created_by = ? AND re.requested_at >= ?
     GROUP BY day`
  )
    .bind(identityId, dailyCutoff)
    .all();

  const { results: eventRows } = await env.DB.prepare(
    `SELECT re.referer AS referer, re.user_agent AS user_agent
     FROM redirect_events re
     JOIN urls u ON u.code = re.code AND u.kind = re.kind
     WHERE u.created_by = ?`
  )
    .bind(identityId)
    .all();

  const referrerCounts = new Map();
  const browserCounts = new Map();
  const deviceCounts = new Map();
  for (const row of eventRows) {
    const referrer = normalizeReferrer(row.referer);
    const isOwnSite = referrer === "tiny.vin" || referrer.endsWith(".tiny.vin");
    if (!isOwnSite) {
      referrerCounts.set(referrer, (referrerCounts.get(referrer) || 0) + 1);
    }

    const { browser, device } = parseUserAgent(row.user_agent);
    browserCounts.set(browser, (browserCounts.get(browser) || 0) + 1);
    deviceCounts.set(device, (deviceCounts.get(device) || 0) + 1);
  }

  const dailyByDate = new Map(dailyRows.map((row) => [row.day, row.cnt]));
  const dailyRedirects = [];
  for (let i = dailyWindowDays - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dailyRedirects.push({ date, count: dailyByDate.get(date) || 0 });
  }

  const groups = new Map();
  let totalClicks = 0;
  for (const row of results) {
    totalClicks += row.clicks;
    if (!groups.has(row.original_url)) {
      groups.set(row.original_url, { originalUrl: row.original_url, totalClicks: 0, shortUrls: [] });
    }
    const group = groups.get(row.original_url);
    group.totalClicks += row.clicks;
    group.shortUrls.push({
      code: row.code,
      kind: row.kind,
      shortUrl: formatShortUrl(row.code, row.kind),
      createdAt: row.created_at,
      clicks: row.clicks,
      lastClickAt: row.last_click,
    });
  }

  const urls = Array.from(groups.values()).sort((a, b) => b.totalClicks - a.totalClicks);

  return jsonResponse({
    totalLinks: results.length,
    totalClicks,
    topCountries: topCountryRows.map((row) => ({ name: row.country, count: row.cnt })),
    topReferrers: topCounts(referrerCounts, 5),
    browsers: topCounts(browserCounts, 10),
    devices: topCounts(deviceCounts, 10),
    dailyRedirects,
    urls,
  });
}

async function handleDeleteUrl(code, kind, env, session) {
  const identityId = await getIdentityId(env, session.provider, session.email);

  const result = await env.DB.prepare(
    "DELETE FROM urls WHERE code = ? AND kind = ? AND created_by = ?"
  )
    .bind(code, kind, identityId)
    .run();

  if (!result.meta.changes) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  return jsonResponse({ ok: true });
}

async function recordRedirectEvent(env, { code, kind, request }) {
  try {
    const headers = JSON.stringify(Object.fromEntries(request.headers.entries()));
    const cfData = JSON.stringify(request.cf || {});
    const ipAddress = request.headers.get("CF-Connecting-IP");
    const userAgent = request.headers.get("User-Agent");
    const referer = request.headers.get("Referer");
    const country = request.cf?.country || null;

    await env.DB.prepare(
      `INSERT INTO redirect_events
        (code, kind, requested_at, ip_address, country, user_agent, referer, headers, cf_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(code, kind, Date.now(), ipAddress, country, userAgent, referer, headers, cfData)
      .run();
  } catch {
    // stats are best-effort; never block a redirect over it
  }
}

async function handleRedirect(code, kinds, env, ctx, request) {
  const placeholders = kinds.map(() => "?").join(", ");
  const row = await env.DB.prepare(
    `SELECT kind, original_url FROM urls WHERE code = ? AND kind IN (${placeholders})`
  )
    .bind(code, ...kinds)
    .first();

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  ctx.waitUntil(recordRedirectEvent(env, { code, kind: row.kind, request }));

  return Response.redirect(row.original_url, 302);
}

function handleAuthStart(url, env) {
  const state = randomState();
  const redirectUri = `${env.SITE_URL}/auth/google/callback`;
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
  const result = await env.DB.prepare(
    "INSERT INTO login_identities (provider, username, token_balance) VALUES (?, ?, ?) ON CONFLICT (provider, username) DO NOTHING"
  )
    .bind(provider, username, SIGNUP_BONUS_TOKENS)
    .run();

  const identityId = await getIdentityId(env, provider, username);

  if (result.meta.changes > 0) {
    await logTokenEvent(env, identityId, SIGNUP_BONUS_TOKENS, "signup_bonus");
  }

  return identityId;
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
    const redirectUri = `${env.SITE_URL}/auth/google/callback`;
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

async function runMonthlyBilling(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT code, kind, created_by, paid_through_at FROM urls WHERE paid_through_at IS NOT NULL AND paid_through_at <= ?"
  )
    .bind(now)
    .all();

  for (const row of results) {
    let paidThroughAt = row.paid_through_at;
    let deleted = false;

    while (paidThroughAt <= now) {
      const upkeepCost = TOKEN_COSTS[row.kind].upkeep;
      const balance = await getTokenBalance(env, row.created_by);
      if (balance < upkeepCost) {
        await env.DB.prepare("DELETE FROM urls WHERE code = ? AND kind = ?").bind(row.code, row.kind).run();
        await logTokenEvent(env, row.created_by, 0, "deleted_insufficient_balance", { code: row.code, kind: row.kind });
        deleted = true;
        break;
      }
      await debitTokens(env, row.created_by, upkeepCost, `upkeep_${row.kind}`, { code: row.code, kind: row.kind });
      paidThroughAt += ONE_MONTH_MS;
    }

    if (!deleted) {
      await env.DB.prepare("UPDATE urls SET paid_through_at = ? WHERE code = ? AND kind = ?")
        .bind(paidThroughAt, row.code, row.kind)
        .run();
    }
  }
}

export default {
  async fetch(request, env, ctx) {
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

    const subdomainMatch = url.pathname.match(SUBDOMAIN_REDIRECT_PATTERN);
    if (request.method === "GET" && subdomainMatch) {
      return handleRedirect(subdomainMatch[1], ["subdomain"], env, ctx, request);
    }

    const codeMatch = url.pathname.match(CODE_PATTERN);
    if (request.method === "GET" && codeMatch && !RESERVED_CODES.has(codeMatch[1].toLowerCase())) {
      return handleRedirect(codeMatch[1], ["generated-path", "custom-path"], env, ctx, request);
    }

    if (request.method === "POST" && url.pathname === "/api/shorten") {
      return withAuth(request, env, (session) => handleShorten(request, env, session));
    }

    if (request.method === "GET" && url.pathname === "/api/history") {
      return withAuth(request, env, (session) => handleHistory(env, session));
    }

    if (request.method === "GET" && url.pathname === "/api/stats") {
      return withAuth(request, env, (session) => handleStats(env, session));
    }

    if (request.method === "GET" && url.pathname === "/api/tokens") {
      return withAuth(request, env, (session) => handleTokens(env, session));
    }

    const deleteMatch = url.pathname.match(DELETE_URL_PATTERN);
    if (request.method === "DELETE" && deleteMatch) {
      const kindParam = url.searchParams.get("kind");
      const kind = VALID_KINDS.has(kindParam) ? kindParam : "generated-path";
      return withAuth(request, env, (session) => handleDeleteUrl(deleteMatch[1], kind, env, session));
    }

    if (PROTECTED_PAGES.has(url.pathname)) {
      const session = await getSession(request, env.SESSION_SECRET);
      if (!session) return htmlResponse(loginPage());
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMonthlyBilling(env));
  },
};
