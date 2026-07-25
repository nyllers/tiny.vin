# tiny.vin

URL shortener for tiny.vin. Cloudflare Worker (static assets + API) + D1.

- `public/` — static frontend (served as assets by the Worker)
- `src/index.js` — Worker script: `POST /api/shorten` to create a short code, `GET /<code>` to redirect
- `schema.sql` — D1 table definition
- `wrangler.jsonc` — Worker config (assets binding, D1 binding)

## Deploying

This repo is connected to a Cloudflare Workers project (`tiny-vin`) via GitHub, so pushes to `main` auto-deploy. One-time setup:

1. Install Wrangler (`npm install -g wrangler`), then `wrangler login`.
2. Create the D1 database: `wrangler d1 create tiny-vin-db`, then put the returned `database_id` into `wrangler.jsonc`.
3. Apply the schema: `wrangler d1 execute tiny-vin-db --file=schema.sql --remote`.
4. In the Cloudflare dashboard, on the `tiny-vin` Workers & Pages project, enable a public URL: either turn on the `workers.dev` subdomain (Settings > Domains & Routes) or add `tiny.vin` as a custom domain.
5. If using the custom domain, point tiny.vin's DNS at Cloudflare and remove the `CNAME` file, which currently points at GitHub Pages.

Local dev (optional, needs Wrangler): `wrangler dev`.

## Login (feature/oauth-login branch)

The homepage and `POST /api/shorten` require signing in with Google or Facebook; `GET /<code>` redirects stay public so shared links keep working for anyone. There's no email allowlist — any Google or Facebook account can sign in.

Required secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `SESSION_SECRET` (any long random string, used to sign the session cookie).

1. **Google**: Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application). Add Authorized redirect URIs for every origin you'll use this from, e.g. `https://tiny.vin/auth/google/callback` and `http://localhost:8787/auth/google/callback` for local dev.
2. **Facebook**: developers.facebook.com → Create App (type: Consumer) → add the Facebook Login product → Settings → Valid OAuth Redirect URIs, same list of callback URLs as above.
3. **Local dev**: copy `.dev.vars.example` to `.dev.vars` and fill in the values (this file is gitignored, never commit real secrets). Run `wrangler dev` as usual.
4. **Production**: set each secret with `wrangler secret put NAME` (prompts for the value, doesn't touch any file).

Sign out via `/auth/logout` (linked at the bottom of the homepage).

Every successful login is recorded in D1: `login_identities` holds one row per (provider, username) pair, and `login_events` holds a timestamped row per login, referencing that identity. This is on top of the base schema — if the database was created before this branch existed, apply `migrations/0002_add_login_tracking.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0002_add_login_tracking.sql --remote`) in addition to `schema.sql`.
