const GOOGLE = {
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
  scope: "openid email profile",
};

function buildAuthorizeUrl(env, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE.scope,
    state,
  });
  return `${GOOGLE.authorizeUrl}?${params.toString()}`;
}

async function exchangeCodeForToken(env, redirectUri, code) {
  const response = await fetch(GOOGLE.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error("Google token exchange failed");
  const data = await response.json();
  return data.access_token;
}

async function fetchUserInfo(accessToken) {
  const response = await fetch(GOOGLE.userInfoUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Google user info request failed");
  const data = await response.json();
  return { email: data.email, name: data.name };
}

export { buildAuthorizeUrl, exchangeCodeForToken, fetchUserInfo };
