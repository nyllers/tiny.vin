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
const RESERVED_CODES = new Set(["login", "subdomain", "stats", "privacy", "terms", "api"]);
const PROTECTED_PAGES = new Set(["/", "/stats", "/stats.html", "/api", "/api.html"]);
const API_KEY_PATTERN = /^tvk_[0-9a-f]{48}$/;
const VALID_KINDS = new Set(["generated-path", "custom-path", "subdomain"]);

const LOGIN_ERRORS = {
  oauth_failed: "Something went wrong signing in. Please try again.",
  state_mismatch: "Your sign-in request expired. Please try again.",
};

const SITE_DESCRIPTION =
  "tiny.vin is a simple URL-shortening tool. Signing in with Google lets us identify your account by your Google email address and name, so you can create, view, and delete your own tiny URLs. No other data is requested, and anyone can follow a tiny URL without signing in.";

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

async function withAuth(request, env, handler) {
  const session = await getSession(request, env.SESSION_SECRET);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  return handler(session);
}

async function withAuthOrApiKey(request, env, handler) {
  const authHeader = request.headers.get("Authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (bearerMatch) {
    const identity = await getIdentityByApiKey(env, bearerMatch[1]);
    if (!identity) return jsonResponse({ error: "Invalid API key" }, 401);
    return handler(identity);
  }
  return withAuth(request, env, handler);
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

function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `tvk_${hex}`;
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
  <div class="donate-nav">
    <div id="donate-button-container"></div>
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
  <script src="https://www.paypalobjects.com/donate/sdk/donate-sdk.js" charset="UTF-8"></script>
  <script src="/donate-button.js"></script>
</body>
</html>`;
}

function htmlResponse(body) {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
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

async function insertUrl(env, { code, kind, originalUrl, createdBy }) {
  await env.DB.prepare(
    "INSERT INTO urls (code, kind, original_url, created_at, created_by) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(code, kind, originalUrl, Date.now(), createdBy)
    .run();
}

function shortUrlResponse(code, kind) {
  const shortUrl = formatShortUrl(code, kind);
  return new Response(null, { status: 201, headers: { Location: `https://${shortUrl}` } });
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

  const customSuffix = typeof body.path === "string" ? body.path.trim() : "";
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

  const createdBy = await getOrCreateIdentityId(env, session.email);

  if (subdomainCode) {
    try {
      await insertUrl(env, { code: subdomainCode, kind: "subdomain", originalUrl: validation.url, createdBy });
      return shortUrlResponse(subdomainCode, "subdomain");
    } catch {
      return jsonResponse({ error: `"${subdomainCode}.tiny.vin" is already taken, try another.` }, 409);
    }
  }

  if (customCode) {
    try {
      await insertUrl(env, { code: customCode, kind: "custom-path", originalUrl: validation.url, createdBy });
      return shortUrlResponse(customCode, "custom-path");
    } catch {
      return jsonResponse({ error: `"${customCode}" is already taken, try another.` }, 409);
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      await insertUrl(env, { code, kind: "generated-path", originalUrl: validation.url, createdBy });
      return shortUrlResponse(code, "generated-path");
    } catch {
      // code collision, retry with a new random code
    }
  }

  return jsonResponse({ error: "Could not generate a unique code, try again" }, 500);
}

async function getIdentityId(env, email) {
  const identity = await env.DB.prepare("SELECT id FROM login_identities WHERE email = ?")
    .bind(email)
    .first();

  return identity ? identity.id : null;
}

async function getIdentityByApiKey(env, key) {
  if (!API_KEY_PATTERN.test(key)) return null;

  const identity = await env.DB.prepare(
    `SELECT li.email
     FROM api_keys ak
     JOIN login_identities li ON li.id = ak.identity_id
     WHERE ak.key = ?`
  )
    .bind(key)
    .first();

  return identity ? { email: identity.email } : null;
}

async function handleGetApiKey(env, session) {
  const identityId = await getIdentityId(env, session.email);
  const row = identityId
    ? await env.DB.prepare("SELECT key FROM api_keys WHERE identity_id = ?").bind(identityId).first()
    : null;

  return jsonResponse({ key: row ? row.key : null });
}

async function handleCreateApiKey(env, session) {
  const identityId = await getOrCreateIdentityId(env, session.email);
  const key = generateApiKey();

  await env.DB.prepare(
    `INSERT INTO api_keys (identity_id, key, created_at) VALUES (?, ?, ?)
     ON CONFLICT (identity_id) DO UPDATE SET key = excluded.key, created_at = excluded.created_at`
  )
    .bind(identityId, key, Date.now())
    .run();

  return jsonResponse({ key });
}

function groupByOriginalUrl(rows, buildEntry) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.original_url)) {
      groups.set(row.original_url, []);
    }
    groups.get(row.original_url).push(buildEntry(row));
  }
  return groups;
}

async function handleHistory(env, session) {
  const identityId = await getIdentityId(env, session.email);

  const { results } = await env.DB.prepare(
    "SELECT code, kind, original_url, created_at FROM urls WHERE created_by = ? ORDER BY created_at DESC"
  )
    .bind(identityId)
    .all();

  const groups = groupByOriginalUrl(results, (row) => ({
    code: row.code,
    kind: row.kind,
    shortUrl: formatShortUrl(row.code, row.kind),
    createdAt: row.created_at,
  }));

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

const STATS_WINDOW_DAYS = 14;

async function handleStats(env, session) {
  const identityId = await getIdentityId(env, session.email);
  const cutoff = Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // Per-URL click counts/last-click power both the "Redirects per URL" chart
  // and the individual URL cards' mini bars, so both stay windowed the same way.
  const { results } = await env.DB.prepare(
    `SELECT u.code, u.kind, u.original_url, u.created_at,
            COUNT(re.id) AS clicks,
            MAX(re.requested_at) AS last_click
     FROM urls u
     LEFT JOIN redirect_events re
       ON re.code = u.code AND re.kind = u.kind AND re.requested_at >= ?
     WHERE u.created_by = ?
     GROUP BY u.code, u.kind
     ORDER BY u.created_at DESC`
  )
    .bind(cutoff, identityId)
    .all();

  // The top "Redirects" summary tile is a lifetime count, deliberately not
  // windowed, so it needs its own unfiltered query.
  const { results: lifetimeRows } = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt
     FROM redirect_events re
     JOIN urls u ON u.code = re.code AND u.kind = re.kind
     WHERE u.created_by = ?`
  )
    .bind(identityId)
    .all();
  const totalClicksLifetime = lifetimeRows[0]?.cnt || 0;

  const { results: topCountryRows } = await env.DB.prepare(
    `SELECT re.country AS country, COUNT(*) AS cnt
     FROM redirect_events re
     JOIN urls u ON u.code = re.code AND u.kind = re.kind
     WHERE u.created_by = ? AND re.country IS NOT NULL AND re.requested_at >= ?
     GROUP BY re.country
     ORDER BY cnt DESC
     LIMIT 5`
  )
    .bind(identityId, cutoff)
    .all();

  const { results: dailyRows } = await env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', re.requested_at / 1000, 'unixepoch') AS day,
            COUNT(*) AS cnt
     FROM redirect_events re
     JOIN urls u ON u.code = re.code AND u.kind = re.kind
     WHERE u.created_by = ? AND re.requested_at >= ?
     GROUP BY day`
  )
    .bind(identityId, cutoff)
    .all();

  const { results: eventRows } = await env.DB.prepare(
    `SELECT re.referer AS referer, re.user_agent AS user_agent
     FROM redirect_events re
     JOIN urls u ON u.code = re.code AND u.kind = re.kind
     WHERE u.created_by = ? AND re.requested_at >= ?`
  )
    .bind(identityId, cutoff)
    .all();

  const { results: mapPointRows } = await env.DB.prepare(
    `SELECT re.latitude AS lat, re.longitude AS lng, COUNT(*) AS cnt
     FROM redirect_events re
     JOIN urls u ON u.code = re.code AND u.kind = re.kind
     WHERE u.created_by = ? AND re.requested_at >= ?
       AND re.latitude IS NOT NULL AND re.longitude IS NOT NULL
     GROUP BY re.latitude, re.longitude`
  )
    .bind(identityId, cutoff)
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
  for (let i = STATS_WINDOW_DAYS - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dailyRedirects.push({ date, count: dailyByDate.get(date) || 0 });
  }

  const groups = groupByOriginalUrl(results, (row) => ({
    code: row.code,
    kind: row.kind,
    shortUrl: formatShortUrl(row.code, row.kind),
    createdAt: row.created_at,
    clicks: row.clicks,
    lastClickAt: row.last_click,
  }));

  const urls = Array.from(groups, ([originalUrl, shortUrls]) => {
    const groupTotal = shortUrls.reduce((sum, s) => sum + s.clicks, 0);
    return { originalUrl, totalClicks: groupTotal, shortUrls };
  }).sort((a, b) => b.totalClicks - a.totalClicks);

  return jsonResponse({
    totalLinks: results.length,
    totalClicks: totalClicksLifetime,
    topCountries: topCountryRows.map((row) => ({ name: row.country, count: row.cnt })),
    topReferrers: topCounts(referrerCounts, 10),
    browsers: topCounts(browserCounts, 10),
    devices: topCounts(deviceCounts, 10),
    dailyRedirects,
    mapPoints: mapPointRows.map((row) => ({ lat: row.lat, lng: row.lng, count: row.cnt })),
    urls,
  });
}

async function handleDeleteUrl(code, kind, env, session) {
  const identityId = await getIdentityId(env, session.email);

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
    const latitude = request.cf?.latitude != null ? Number(request.cf.latitude) : null;
    const longitude = request.cf?.longitude != null ? Number(request.cf.longitude) : null;

    await env.DB.prepare(
      `INSERT INTO redirect_events
        (code, kind, requested_at, ip_address, country, user_agent, referer, headers, cf_data, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(code, kind, Date.now(), ipAddress, country, userAgent, referer, headers, cfData, latitude, longitude)
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

async function getOrCreateIdentityId(env, email) {
  await env.DB.prepare("INSERT INTO login_identities (email) VALUES (?) ON CONFLICT (email) DO NOTHING")
    .bind(email)
    .run();

  return getIdentityId(env, email);
}

async function recordLogin(env, email, ipAddress) {
  try {
    const identityId = await getOrCreateIdentityId(env, email);

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
    await recordLogin(env, user.email, ipAddress);

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

    if (request.method === "POST" && url.pathname === "/api/urls") {
      return withAuthOrApiKey(request, env, (session) => handleShorten(request, env, session));
    }

    if (request.method === "GET" && url.pathname === "/api/keys") {
      return withAuth(request, env, (session) => handleGetApiKey(env, session));
    }

    if (request.method === "POST" && url.pathname === "/api/keys") {
      return withAuth(request, env, (session) => handleCreateApiKey(env, session));
    }

    if (request.method === "GET" && url.pathname === "/api/history") {
      return withAuth(request, env, (session) => handleHistory(env, session));
    }

    if (request.method === "GET" && url.pathname === "/api/stats") {
      return withAuth(request, env, (session) => handleStats(env, session));
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
};
