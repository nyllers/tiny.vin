import { buildAuthorizeUrl, exchangeCodeForToken, fetchUserInfo } from "./providers.js";
import {
  parseCookies,
  createSessionCookie,
  clearSessionCookie,
  getSession,
  randomState,
  createAppAuthToken,
  verifyAppAuthToken,
} from "./session.js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UPPERCASE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_LENGTH = 8;
const MAX_ATTEMPTS = 5;
const CODE_PATTERN = /^\/([A-Za-z0-9]{1,32})$/;
const SUBDOMAIN_REDIRECT_PATTERN = /^\/subdomain\/([a-z0-9-]{1,63})$/;
const AUTH_PATTERN = /^\/auth\/google\/(start|callback)$/;
const DELETE_URL_PATTERN = /^\/api\/urls\/([A-Za-z0-9-]+)$/;
const DELETE_EMAIL_PATTERN = /^\/api\/emails\/([a-z0-9-]+)$/;
const RESERVED_CODES = new Set([
  "login",
  "subdomain",
  "stats",
  "privacy",
  "terms",
  "api",
  "emails",
  "email-stats",
  "app",
]);
const PROTECTED_PAGES = new Set([
  "/",
  "/stats",
  "/stats.html",
  "/api",
  "/api.html",
  "/emails",
  "/emails.html",
  "/email-stats",
  "/email-stats.html",
]);
const API_KEY_PATTERN = /^tvk_[0-9a-f]{48}$/;
const VALID_KINDS = new Set(["generated-path", "custom-path", "subdomain"]);
const MIN_CUSTOM_PATH_LENGTH = 4;
const MIN_CUSTOM_PATH_LENGTH_ADMIN = 1;
const MAX_RESOURCES = 10;
const MAX_RESOURCES_ADMIN = 100;
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_DOMAIN = "tiny.vin";
const EMAIL_ALIAS_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const EMAIL_ALIAS_LENGTH = 8;

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

function generateEmailAlias() {
  let alias = "";
  for (let i = 0; i < EMAIL_ALIAS_LENGTH; i++) {
    alias += EMAIL_ALIAS_CHARS[Math.floor(Math.random() * EMAIL_ALIAS_CHARS.length)];
  }
  return alias;
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
    <a class="wordmark" href="/">
      <span>tiny</span>
      <span><span class="accent-dot">.</span>vin</span>
    </a>
  </div>
  <div class="theme-toggle" role="group" aria-label="Theme"></div>
  <div class="donate-nav"></div>
  <script src="/header.js"></script>
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
  <script src="https://www.paypalobjects.com/donate/sdk/donate-sdk.js" charset="UTF-8" onload="renderDonateButton()"></script>
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

// Shared by custom paths (letters+digits+hyphen) and subdomains
// (lowercase-only) - they differ only in allowed case, max length, and the
// noun used in the error message, so the exact wording stays per-caller.
function validateHandle(input, { minLength, maxLength, allowUppercase, noun }) {
  const validChars = (allowUppercase ? /^[A-Za-z0-9-]+$/ : /^[a-z0-9-]+$/).test(input);
  const noEdgeHyphen = input[0] !== "-" && input[input.length - 1] !== "-";
  if (!validChars || !noEdgeHyphen || input.length < minLength || input.length > maxLength) {
    const caseWord = allowUppercase ? "letters" : "lowercase letters";
    return {
      error: `${noun} can only contain ${caseWord}, numbers, and hyphens (not at the start or end), ${minLength}-${maxLength} characters.`,
    };
  }

  if (RESERVED_CODES.has(allowUppercase ? input.toLowerCase() : input)) {
    return { error: `"${input}" is reserved, try another.` };
  }

  return { code: input };
}

function validateSuffix(input, minLength) {
  return validateHandle(input, { minLength, maxLength: 32, allowUppercase: true, noun: "Custom short URLs" });
}

function validateSubdomain(input, minLength) {
  return validateHandle(input, { minLength, maxLength: 63, allowUppercase: false, noun: "Subdomains" });
}

function validateEmailAlias(input) {
  const validation = validateHandle(input, { minLength: 1, maxLength: 64, allowUppercase: false, noun: "Aliases" });
  return validation.error ? validation : { alias: validation.code };
}

function validateDestinationEmail(input) {
  if (!EMAIL_ADDRESS_PATTERN.test(input) || input.length > 254) {
    return { error: "That doesn't look like a valid e-mail address." };
  }

  if (input.toLowerCase().endsWith(`@${EMAIL_DOMAIN}`)) {
    return { error: `Can't redirect to another ${EMAIL_DOMAIN} address.` };
  }

  return { email: input.toLowerCase() };
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

  const createdBy = await getOrCreateIdentityId(env, session.email);
  const admin = await isAdmin(env, session.email);

  const maxResources = admin ? MAX_RESOURCES_ADMIN : MAX_RESOURCES;
  const resourceCount = await countUrlsAndEmails(env, createdBy);
  if (resourceCount >= maxResources) {
    return jsonResponse(
      {
        error: `You've reached the maximum of ${maxResources} URLs and/or e-mail aliases. Delete one before creating another.`,
      },
      403
    );
  }

  const customSuffix = typeof body.path === "string" ? body.path.trim() : "";
  const customSubdomain = typeof body.subdomain === "string" ? body.subdomain.trim() : "";
  const minCustomPathLength = admin ? MIN_CUSTOM_PATH_LENGTH_ADMIN : MIN_CUSTOM_PATH_LENGTH;

  let customCode = null;
  if (customSuffix) {
    const suffixValidation = validateSuffix(customSuffix, minCustomPathLength);
    if (suffixValidation.error) {
      return jsonResponse({ error: suffixValidation.error }, 400);
    }
    customCode = suffixValidation.code;
  }

  let subdomainCode = null;
  if (customSubdomain) {
    const subdomainValidation = validateSubdomain(customSubdomain, minCustomPathLength);
    if (subdomainValidation.error) {
      return jsonResponse({ error: subdomainValidation.error }, 400);
    }
    subdomainCode = subdomainValidation.code;
  }

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

async function isAdmin(env, email) {
  const identity = await env.DB.prepare("SELECT role FROM login_identities WHERE email = ?")
    .bind(email)
    .first();

  return identity?.role === "admin";
}

async function countUrlsAndEmails(env, identityId) {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM urls WHERE created_by = ?) +
       (SELECT COUNT(*) FROM email_redirects WHERE created_by = ?) AS cnt`
  )
    .bind(identityId, identityId)
    .first();

  return row.cnt;
}

// Mail only reaches this Worker's email() handler for a given alias if a
// Cloudflare Email Routing rule points that address at it - there's no
// catch-all-to-Worker option, so each alias needs its own rule (see
// createWorkerEmailRule below). Combined with destination-address
// verification (Cloudflare forwards fail silently to unverified addresses),
// this means CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_ZONE_ID
// are required for this feature to do anything at all - without them,
// handleCreateEmailRedirect refuses to create redirects (see README).
const CLOUDFLARE_WORKER_NAME = "tiny-vin";

function hasCloudflareApiCredentials(env) {
  return Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ZONE_ID);
}

async function cloudflareApiRequest(env, path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

async function listDestinationAddresses(env) {
  return cloudflareApiRequest(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/routing/addresses?per_page=100`);
}

// Registers `email` as a destination address if the account doesn't already
// know about it, which makes Cloudflare send it a verification link. Safe
// to call repeatedly - a no-op if the address is already registered.
async function ensureDestinationRegistered(env, email) {
  const existing = await listDestinationAddresses(env);
  const match = existing.find((address) => address.email.toLowerCase() === email);
  if (match) return Boolean(match.verified);

  await cloudflareApiRequest(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/routing/addresses`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return false;
}

async function getVerifiedDestinations(env) {
  const addresses = await listDestinationAddresses(env);
  return new Set(addresses.filter((address) => address.verified).map((address) => address.email.toLowerCase()));
}

// Email Routing Rules live under the zone (unlike the account-scoped
// Addresses API above) - a catch-all rule can't target a Worker, only
// "forward"/"drop", so each alias gets its own literal-match rule instead.
async function createWorkerEmailRule(env, alias) {
  const rule = await cloudflareApiRequest(env, `/zones/${env.CLOUDFLARE_ZONE_ID}/email/routing/rules`, {
    method: "POST",
    body: JSON.stringify({
      name: `tiny.vin redirect: ${alias}`,
      enabled: true,
      matchers: [{ type: "literal", field: "to", value: `${alias}@${EMAIL_DOMAIN}` }],
      actions: [{ type: "worker", value: [CLOUDFLARE_WORKER_NAME] }],
    }),
  });
  return rule.id;
}

async function deleteWorkerEmailRule(env, ruleId) {
  await cloudflareApiRequest(env, `/zones/${env.CLOUDFLARE_ZONE_ID}/email/routing/rules/${ruleId}`, {
    method: "DELETE",
  });
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

// Shared by the "regenerate" button on /api (always mints a fresh key) and
// the Android app's post-sign-in exchange (reuses one if it already exists).
async function getOrCreateApiKey(env, email, { forceRegenerate = false } = {}) {
  const identityId = await getOrCreateIdentityId(env, email);

  if (!forceRegenerate) {
    const existing = await env.DB.prepare("SELECT key FROM api_keys WHERE identity_id = ?").bind(identityId).first();
    if (existing) return existing.key;
  }

  const key = generateApiKey();
  await env.DB.prepare(
    `INSERT INTO api_keys (identity_id, key, created_at) VALUES (?, ?, ?)
     ON CONFLICT (identity_id) DO UPDATE SET key = excluded.key, created_at = excluded.created_at`
  )
    .bind(identityId, key, Date.now())
    .run();

  return key;
}

async function handleCreateApiKey(env, session) {
  const key = await getOrCreateApiKey(env, session.email, { forceRegenerate: true });
  return jsonResponse({ key });
}

async function handleAppAuthExchange(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const payload = await verifyAppAuthToken(body.token, env.SESSION_SECRET);
  if (!payload) return jsonResponse({ error: "Invalid or expired token" }, 401);

  const key = await getOrCreateApiKey(env, payload.email);
  return jsonResponse({ key });
}

function appAuthCallbackPage(url) {
  const error = url.searchParams.get("error");
  const message = error
    ? LOGIN_ERRORS[error] || "Something went wrong signing in. Please try again in the app."
    : url.searchParams.get("token")
      ? "Signed in — return to the tiny.vin app to finish."
      : "Nothing to do here — open the tiny.vin app to sign in.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tiny.vin</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main>
    <h1>tiny.vin</h1>
    <p>${message}</p>
  </main>
</body>
</html>`;
}

function groupBy(rows, keyFn, buildEntry) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(buildEntry(row));
  }
  return groups;
}

// Shared by handleHistory/handleListEmailRedirects: group rows, tag each
// group with its most recent item's createdAt, and sort groups newest-first.
function groupedByCreatedAtDesc(rows, keyFn, buildEntry, keyName, itemsName) {
  const groups = groupBy(rows, keyFn, buildEntry);
  return Array.from(groups, ([key, items]) => ({
    [keyName]: key,
    createdAt: items[items.length - 1].createdAt,
    [itemsName]: items,
  })).sort((a, b) => b.createdAt - a.createdAt);
}

async function handleHistory(env, session) {
  const identityId = await getIdentityId(env, session.email);

  const { results } = await env.DB.prepare(
    "SELECT code, kind, original_url, created_at FROM urls WHERE created_by = ? ORDER BY created_at DESC"
  )
    .bind(identityId)
    .all();

  const urls = groupedByCreatedAtDesc(
    results,
    (row) => row.original_url,
    (row) => ({ code: row.code, kind: row.kind, shortUrl: formatShortUrl(row.code, row.kind), createdAt: row.created_at }),
    "originalUrl",
    "shortUrls"
  );

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

// Zero-fills a per-day count series for the last STATS_WINDOW_DAYS, from
// sparse {day, cnt} rows (days with no activity simply don't have a row).
function buildDailySeries(dailyRows) {
  const byDate = new Map(dailyRows.map((row) => [row.day, row.cnt]));
  const series = [];
  for (let i = STATS_WINDOW_DAYS - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push({ date, count: byDate.get(date) || 0 });
  }
  return series;
}

async function handleStats(env, session) {
  const identityId = await getIdentityId(env, session.email);
  const cutoff = Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // Lifetime per-URL click counts/last-click, for the "Total Redirects by
  // URL" cards - deliberately not windowed, unlike every chart below.
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

  // Same shape, windowed to the last 14 days, feeding only the "Redirects
  // per URL" chart (a bar chart, so it follows the same window as the rest).
  const { results: recentResults } = await env.DB.prepare(
    `SELECT u.code, u.kind, u.original_url,
            COUNT(re.id) AS clicks
     FROM urls u
     LEFT JOIN redirect_events re
       ON re.code = u.code AND re.kind = u.kind AND re.requested_at >= ?
     WHERE u.created_by = ?
     GROUP BY u.code, u.kind`
  )
    .bind(cutoff, identityId)
    .all();

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

  const dailyRedirects = buildDailySeries(dailyRows);

  const groups = groupBy(results, (row) => row.original_url, (row) => ({
    code: row.code,
    kind: row.kind,
    shortUrl: formatShortUrl(row.code, row.kind),
    createdAt: row.created_at,
    clicks: row.clicks,
    lastClickAt: row.last_click,
  }));

  let totalClicksLifetime = 0;
  const urls = Array.from(groups, ([originalUrl, shortUrls]) => {
    const groupTotal = shortUrls.reduce((sum, s) => sum + s.clicks, 0);
    totalClicksLifetime += groupTotal;
    return { originalUrl, totalClicks: groupTotal, shortUrls };
  }).sort((a, b) => b.totalClicks - a.totalClicks);

  const recentGroups = groupBy(recentResults, (row) => row.original_url, (row) => ({
    code: row.code,
    kind: row.kind,
    shortUrl: formatShortUrl(row.code, row.kind),
    clicks: row.clicks,
  }));
  const urlBreakdown14d = Array.from(recentGroups, ([originalUrl, shortUrls]) => ({
    originalUrl,
    totalClicks: shortUrls.reduce((sum, s) => sum + s.clicks, 0),
    shortUrls,
  })).sort((a, b) => b.totalClicks - a.totalClicks);

  return jsonResponse({
    totalLinks: results.length,
    totalClicks: totalClicksLifetime,
    topCountries: topCountryRows.map((row) => ({ name: row.country, count: row.cnt })),
    topReferrers: topCounts(referrerCounts, 10),
    browsers: topCounts(browserCounts, 10),
    devices: topCounts(deviceCounts, 10),
    dailyRedirects,
    mapPoints: mapPointRows.map((row) => ({ lat: row.lat, lng: row.lng, count: row.cnt })),
    urlBreakdown14d,
    urls,
  });
}

async function handleEmailStats(env, session) {
  const identityId = await getIdentityId(env, session.email);
  const cutoff = Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // Lifetime per-alias message counts/last-message, for the "Total Messages
  // by Destination" cards - deliberately not windowed, unlike every chart
  // below.
  const { results } = await env.DB.prepare(
    `SELECT er.alias, er.destination, er.created_at,
            COUNT(ee.id) AS messages,
            SUM(CASE WHEN ee.forwarded = 1 THEN 1 ELSE 0 END) AS forwarded,
            MAX(ee.requested_at) AS last_message
     FROM email_redirects er
     LEFT JOIN email_redirect_events ee ON ee.alias = er.alias
     WHERE er.created_by = ?
     GROUP BY er.alias
     ORDER BY er.created_at DESC`
  )
    .bind(identityId)
    .all();

  // Same shape, windowed to the last 14 days, feeding only the "Messages
  // per Alias" chart.
  const { results: recentResults } = await env.DB.prepare(
    `SELECT er.alias, er.destination,
            COUNT(ee.id) AS messages
     FROM email_redirects er
     LEFT JOIN email_redirect_events ee
       ON ee.alias = er.alias AND ee.requested_at >= ?
     WHERE er.created_by = ?
     GROUP BY er.alias`
  )
    .bind(cutoff, identityId)
    .all();

  const { results: dailyRows } = await env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', ee.requested_at / 1000, 'unixepoch') AS day,
            COUNT(*) AS cnt
     FROM email_redirect_events ee
     JOIN email_redirects er ON er.alias = ee.alias
     WHERE er.created_by = ? AND ee.requested_at >= ?
     GROUP BY day`
  )
    .bind(identityId, cutoff)
    .all();

  const { results: eventRows } = await env.DB.prepare(
    `SELECT ee.from_address AS from_address
     FROM email_redirect_events ee
     JOIN email_redirects er ON er.alias = ee.alias
     WHERE er.created_by = ? AND ee.requested_at >= ?`
  )
    .bind(identityId, cutoff)
    .all();

  const senderDomainCounts = new Map();
  for (const row of eventRows) {
    const domain = row.from_address && row.from_address.includes("@") ? row.from_address.split("@")[1].toLowerCase() : "Unknown";
    senderDomainCounts.set(domain, (senderDomainCounts.get(domain) || 0) + 1);
  }

  const dailyMessages = buildDailySeries(dailyRows);

  const totalMessagesLifetime = results.reduce((sum, row) => sum + row.messages, 0);
  const totalForwardedLifetime = results.reduce((sum, row) => sum + row.forwarded, 0);

  const groups = groupBy(results, (row) => row.destination, (row) => ({
    alias: row.alias,
    address: `${row.alias}@${EMAIL_DOMAIN}`,
    messages: row.messages,
    lastMessageAt: row.last_message,
  }));

  const redirects = Array.from(groups, ([destination, aliases]) => ({
    destination,
    totalMessages: aliases.reduce((sum, a) => sum + a.messages, 0),
    aliases,
  })).sort((a, b) => b.totalMessages - a.totalMessages);

  const aliasBreakdown14d = recentResults.map((row) => ({
    alias: row.alias,
    address: `${row.alias}@${EMAIL_DOMAIN}`,
    destination: row.destination,
    messages: row.messages,
  }));

  return jsonResponse({
    totalAliases: results.length,
    totalMessages: totalMessagesLifetime,
    totalFailedForwards: totalMessagesLifetime - totalForwardedLifetime,
    senderDomains: topCounts(senderDomainCounts, 10),
    dailyMessages,
    aliasBreakdown14d,
    redirects,
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

// Creates the Cloudflare routing rule and the email_redirects row for one
// alias. Returns { ok: true } on success; on failure returns { error:
// "cloudflare" } (rule creation itself failed) or { error: "conflict" }
// (alias already taken - the just-created rule is cleaned up) so the two
// callers below can tell a real Cloudflare-side failure apart from a
// generated-alias collision worth retrying.
async function createEmailRedirectRow(env, { alias, destination, createdBy }) {
  let ruleId;
  try {
    ruleId = await createWorkerEmailRule(env, alias);
  } catch {
    return { error: "cloudflare" };
  }

  try {
    await env.DB.prepare(
      "INSERT INTO email_redirects (alias, destination, cloudflare_rule_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(alias, destination, ruleId, Date.now(), createdBy)
      .run();
  } catch {
    await deleteWorkerEmailRule(env, ruleId).catch(() => {});
    return { error: "conflict" };
  }

  return { ok: true };
}

async function handleCreateEmailRedirect(request, env, session) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const aliasInput = typeof body.alias === "string" ? body.alias.trim().toLowerCase() : "";
  const destinationInput = typeof body.destination === "string" ? body.destination.trim() : "";

  let alias = null;
  if (aliasInput) {
    const aliasValidation = validateEmailAlias(aliasInput);
    if (aliasValidation.error) {
      return jsonResponse({ error: aliasValidation.error }, 400);
    }
    alias = aliasValidation.alias;
  }

  const destinationValidation = validateDestinationEmail(destinationInput);
  if (destinationValidation.error) {
    return jsonResponse({ error: destinationValidation.error }, 400);
  }

  if (!hasCloudflareApiCredentials(env)) {
    return jsonResponse({ error: "E-mail redirects aren't set up on this server yet." }, 503);
  }

  const { email: destination } = destinationValidation;
  const createdBy = await getOrCreateIdentityId(env, session.email);
  const admin = await isAdmin(env, session.email);

  const maxResources = admin ? MAX_RESOURCES_ADMIN : MAX_RESOURCES;
  const resourceCount = await countUrlsAndEmails(env, createdBy);
  if (resourceCount >= maxResources) {
    return jsonResponse(
      {
        error: `You've reached the maximum of ${maxResources} URLs and/or e-mail aliases. Delete one before creating another.`,
      },
      403
    );
  }

  let verified = null;
  try {
    verified = await ensureDestinationRegistered(env, destination);
  } catch {
    // Best-effort - the redirect can still be created even if this call
    // fails; verification status just won't be known yet.
  }

  if (alias) {
    const result = await createEmailRedirectRow(env, { alias, destination, createdBy });
    if (result.error === "cloudflare") {
      return jsonResponse({ error: "Could not set up the redirect with Cloudflare, try again." }, 502);
    }
    if (result.error === "conflict") {
      return jsonResponse({ error: `"${alias}@${EMAIL_DOMAIN}" is already taken, try another.` }, 409);
    }
    return jsonResponse({ alias, destination, verified }, 201);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = generateEmailAlias();
    const result = await createEmailRedirectRow(env, { alias: candidate, destination, createdBy });
    if (result.error === "cloudflare") {
      return jsonResponse({ error: "Could not set up the redirect with Cloudflare, try again." }, 502);
    }
    if (!result.error) {
      return jsonResponse({ alias: candidate, destination, verified }, 201);
    }
    // alias collision, retry with a new random alias
  }

  return jsonResponse({ error: "Could not generate a unique alias, try again" }, 500);
}

async function handleListEmailRedirects(env, session) {
  const identityId = await getIdentityId(env, session.email);

  const { results } = await env.DB.prepare(
    "SELECT alias, destination, created_at FROM email_redirects WHERE created_by = ? ORDER BY created_at DESC"
  )
    .bind(identityId)
    .all();

  let verifiedDestinations = null;
  if (hasCloudflareApiCredentials(env)) {
    try {
      verifiedDestinations = await getVerifiedDestinations(env);
    } catch {
      // Best-effort - fall back to unknown verification status below.
    }
  }

  const redirects = groupedByCreatedAtDesc(
    results,
    (row) => row.destination,
    (row) => ({
      alias: row.alias,
      address: `${row.alias}@${EMAIL_DOMAIN}`,
      createdAt: row.created_at,
      verified: verifiedDestinations ? verifiedDestinations.has(row.destination) : null,
    }),
    "destination",
    "aliases"
  );

  return jsonResponse({ redirects });
}

async function handleDeleteEmailRedirect(alias, env, session) {
  const identityId = await getIdentityId(env, session.email);

  const row = await env.DB.prepare(
    "SELECT cloudflare_rule_id FROM email_redirects WHERE alias = ? AND created_by = ?"
  )
    .bind(alias, identityId)
    .first();

  if (!row) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  await env.DB.prepare("DELETE FROM email_redirects WHERE alias = ? AND created_by = ?")
    .bind(alias, identityId)
    .run();

  if (row.cloudflare_rule_id && hasCloudflareApiCredentials(env)) {
    try {
      await deleteWorkerEmailRule(env, row.cloudflare_rule_id);
    } catch {
      // Best-effort - a leftover Cloudflare rule is harmless: the alias is
      // gone from D1, so the email() handler will reject mail for it anyway.
    }
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

async function recordEmailRedirectEvent(env, { alias, destination, message, forwarded, rejectReason }) {
  try {
    const headers = JSON.stringify(Object.fromEntries(message.headers.entries()));
    const subject = message.headers.get("subject");
    const messageId = message.headers.get("message-id");

    await env.DB.prepare(
      `INSERT INTO email_redirect_events
        (alias, destination, from_address, subject, message_id, size, forwarded, reject_reason, headers, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        alias,
        destination,
        message.from,
        subject,
        messageId,
        message.rawSize,
        forwarded ? 1 : 0,
        rejectReason,
        headers,
        Date.now()
      )
      .run();
  } catch {
    // stats are best-effort; never block a forward over it
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

  // ?client=app marks a sign-in started by the Android app (via a Custom Tab)
  // rather than a normal browser visit, via a cookie so it survives the round
  // trip to Google and back. handleAuthCallback reads it to decide whether to
  // hand the result back to the app instead of the browser.
  const headers = new Headers({ location: authorizeUrl });
  headers.append("set-cookie", `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  if (url.searchParams.get("client") === "app") {
    headers.append("set-cookie", `oauth_client=app; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  }

  return new Response(null, { status: 302, headers });
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
  const isApp = cookies.oauth_client === "app";
  const failureTarget = isApp ? `${url.origin}/app/auth-callback` : `${url.origin}/login`;

  if (!code || !state || !cookies.oauth_state || cookies.oauth_state !== state) {
    return Response.redirect(`${failureTarget}?error=state_mismatch`, 302);
  }

  try {
    const redirectUri = `${env.SITE_URL}/auth/google/callback`;
    const accessToken = await exchangeCodeForToken(env, redirectUri, code);
    const user = await fetchUserInfo(accessToken);

    if (!user.email) throw new Error("No email returned by provider");

    const ipAddress = request.headers.get("CF-Connecting-IP");
    await recordLogin(env, user.email, ipAddress);

    const sessionCookie = await createSessionCookie(user, env.SESSION_SECRET);

    // The app can't read this HttpOnly session cookie, so it also gets a
    // short-lived signed token in the redirect URL, which it exchanges for
    // an API key at /app/auth-exchange. The browser-facing session cookie is
    // still set here too, in case this callback is ever hit outside the app.
    const location = isApp
      ? `${url.origin}/app/auth-callback?token=${await createAppAuthToken(user.email, env.SESSION_SECRET)}`
      : `${url.origin}/`;

    return new Response(null, {
      status: 302,
      headers: {
        location,
        "set-cookie": sessionCookie,
      },
    });
  } catch {
    return Response.redirect(`${failureTarget}?error=oauth_failed`, 302);
  }
}

// Routes that are just "exact method+path, run this handler under this auth
// wrapper" - each handler ignores the args it doesn't need, so they can all
// share one shape. Pattern-based routes (redirects, deletes with a query
// param) stay as explicit checks below since they need extra logic.
const SIMPLE_ROUTES = new Map([
  ["POST /api/urls", { auth: withAuthOrApiKey, run: (request, env, session) => handleShorten(request, env, session) }],
  ["GET /api/keys", { auth: withAuth, run: (request, env, session) => handleGetApiKey(env, session) }],
  ["POST /api/keys", { auth: withAuth, run: (request, env, session) => handleCreateApiKey(env, session) }],
  ["GET /api/history", { auth: withAuth, run: (request, env, session) => handleHistory(env, session) }],
  ["GET /api/stats", { auth: withAuth, run: (request, env, session) => handleStats(env, session) }],
  ["GET /api/email-stats", { auth: withAuth, run: (request, env, session) => handleEmailStats(env, session) }],
  [
    "POST /api/emails",
    { auth: withAuthOrApiKey, run: (request, env, session) => handleCreateEmailRedirect(request, env, session) },
  ],
  ["GET /api/emails", { auth: withAuth, run: (request, env, session) => handleListEmailRedirects(env, session) }],
]);

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

    if (url.pathname === "/app/auth-callback" && request.method === "GET") {
      return htmlResponse(appAuthCallbackPage(url));
    }

    if (url.pathname === "/app/auth-exchange" && request.method === "POST") {
      return handleAppAuthExchange(request, env);
    }

    const subdomainMatch = url.pathname.match(SUBDOMAIN_REDIRECT_PATTERN);
    if (request.method === "GET" && subdomainMatch) {
      return handleRedirect(subdomainMatch[1], ["subdomain"], env, ctx, request);
    }

    const codeMatch = url.pathname.match(CODE_PATTERN);
    if (request.method === "GET" && codeMatch && !RESERVED_CODES.has(codeMatch[1].toLowerCase())) {
      return handleRedirect(codeMatch[1], ["generated-path", "custom-path"], env, ctx, request);
    }

    const route = SIMPLE_ROUTES.get(`${request.method} ${url.pathname}`);
    if (route) {
      return route.auth(request, env, (session) => route.run(request, env, session));
    }

    const deleteMatch = url.pathname.match(DELETE_URL_PATTERN);
    if (request.method === "DELETE" && deleteMatch) {
      const kindParam = url.searchParams.get("kind");
      const kind = VALID_KINDS.has(kindParam) ? kindParam : "generated-path";
      return withAuth(request, env, (session) => handleDeleteUrl(deleteMatch[1], kind, env, session));
    }

    const deleteEmailMatch = url.pathname.match(DELETE_EMAIL_PATTERN);
    if (request.method === "DELETE" && deleteEmailMatch) {
      return withAuth(request, env, (session) => handleDeleteEmailRedirect(deleteEmailMatch[1], env, session));
    }

    if (PROTECTED_PAGES.has(url.pathname)) {
      const session = await getSession(request, env.SESSION_SECRET);
      if (!session) return htmlResponse(loginPage());
    }

    return env.ASSETS.fetch(request);
  },

  async email(message, env, ctx) {
    const alias = message.to.split("@")[0].toLowerCase();

    const row = await env.DB.prepare("SELECT destination FROM email_redirects WHERE alias = ?")
      .bind(alias)
      .first();

    if (!row) {
      message.setReject("No such address");
      return;
    }

    let forwarded = true;
    let rejectReason = null;
    try {
      await message.forward(row.destination);
    } catch {
      forwarded = false;
      rejectReason = "Unable to forward this message";
      message.setReject(rejectReason);
    }

    ctx.waitUntil(
      recordEmailRedirectEvent(env, { alias, destination: row.destination, message, forwarded, rejectReason })
    );
  },
};
