const PROVIDERS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scope: "openid email profile",
  },
  facebook: {
    authorizeUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    userInfoUrl: "https://graph.facebook.com/me",
    scope: "email",
  },
};

function clientIdFor(provider, env) {
  return provider === "google" ? env.GOOGLE_CLIENT_ID : env.FACEBOOK_CLIENT_ID;
}

function clientSecretFor(provider, env) {
  return provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.FACEBOOK_CLIENT_SECRET;
}

function buildAuthorizeUrl(provider, env, redirectUri, state) {
  const config = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: clientIdFor(provider, env),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

async function exchangeCodeForToken(provider, env, redirectUri, code) {
  const config = PROVIDERS[provider];

  if (provider === "facebook") {
    const params = new URLSearchParams({
      client_id: clientIdFor(provider, env),
      client_secret: clientSecretFor(provider, env),
      redirect_uri: redirectUri,
      code,
    });
    const response = await fetch(`${config.tokenUrl}?${params.toString()}`);
    if (!response.ok) throw new Error("Facebook token exchange failed");
    const data = await response.json();
    return data.access_token;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientIdFor(provider, env),
      client_secret: clientSecretFor(provider, env),
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error("Google token exchange failed");
  const data = await response.json();
  return data.access_token;
}

async function fetchUserInfo(provider, accessToken) {
  const config = PROVIDERS[provider];

  if (provider === "facebook") {
    const params = new URLSearchParams({ fields: "id,name,email", access_token: accessToken });
    const response = await fetch(`${config.userInfoUrl}?${params.toString()}`);
    if (!response.ok) throw new Error("Facebook user info request failed");
    const data = await response.json();
    return { email: data.email, name: data.name, provider };
  }

  const response = await fetch(config.userInfoUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Google user info request failed");
  const data = await response.json();
  return { email: data.email, name: data.name, provider };
}

export { buildAuthorizeUrl, exchangeCodeForToken, fetchUserInfo };
