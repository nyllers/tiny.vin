const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const APP_AUTH_TOKEN_MAX_AGE = 120; // 2 minutes - just long enough to reach the app via redirect

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payloadStr, secret) {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadStr));
  return base64UrlEncode(new Uint8Array(signature));
}

async function verifyPayload(payloadStr, signatureB64, secret) {
  const key = await importKey(secret);
  try {
    return await crypto.subtle.verify("HMAC", key, base64UrlDecode(signatureB64), new TextEncoder().encode(payloadStr));
  } catch {
    return false;
  }
}

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

async function createSessionCookie(user, secret) {
  const payload = {
    email: user.email,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(payloadB64, secret);
  const value = `${payloadB64}.${signature}`;
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// Shared by the session cookie and the app-auth token below: both are just a
// base64url JSON payload plus an HMAC signature, verified the same way.
async function verifySignedValue(value, secret) {
  if (!value) return null;

  const [payloadB64, signature] = value.split(".");
  if (!payloadB64 || !signature) return null;

  const valid = await verifyPayload(payloadB64, signature, secret);
  if (!valid) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

async function getSession(request, secret) {
  const cookies = parseCookies(request);
  return verifySignedValue(cookies[SESSION_COOKIE], secret);
}

function randomState() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(18)));
}

// Short-lived, single-purpose token handed to the Android app via a redirect
// after it completes Google sign-in in a Custom Tab (see /auth/google/callback
// and /app/auth-exchange). Deliberately separate from the session cookie: it's
// URL-borne rather than HttpOnly, so it stays valid for minutes, not weeks.
async function createAppAuthToken(email, secret) {
  const payload = { email, exp: Math.floor(Date.now() / 1000) + APP_AUTH_TOKEN_MAX_AGE };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

async function verifyAppAuthToken(token, secret) {
  return verifySignedValue(token, secret);
}

export {
  parseCookies,
  createSessionCookie,
  clearSessionCookie,
  getSession,
  randomState,
  createAppAuthToken,
  verifyAppAuthToken,
};
