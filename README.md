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

The homepage and `POST /api/shorten` require signing in with Google; `GET /<code>` redirects stay public so shared links keep working for anyone. There's no email allowlist — any Google account can sign in. (Facebook login was dropped: Meta requires Business Verification to take a Facebook Login app out of Development mode, which doesn't fit a personal project.)

Required secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (any long random string, used to sign the session cookie).

1. **Google**: Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application). Add Authorized redirect URIs for every origin you'll use this from, e.g. `https://tiny.vin/auth/google/callback` and `http://localhost:8787/auth/google/callback` for local dev. Under OAuth consent screen, publish the app (out of "Testing" status) so any Google account can sign in, not just added test users.
2. **Local dev**: copy `.dev.vars.example` to `.dev.vars` and fill in the values (this file is gitignored, never commit real secrets). Run `wrangler dev` as usual.
3. **Production**: set each secret with `wrangler secret put NAME` (prompts for the value, doesn't touch any file).

Sign out via `/auth/logout` (linked at the bottom of the homepage).

Every successful login is recorded in D1: `login_identities` holds one row per (provider, username) pair, and `login_events` holds a timestamped row per login, referencing that identity. This is on top of the base schema — if the database was created before this branch existed, apply `migrations/0002_add_login_tracking.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0002_add_login_tracking.sql --remote`) in addition to `schema.sql`.

## Subdomains

In addition to path-based short URLs (`tiny.vin/<code>`), a URL can also get a subdomain-based one (`<name>.tiny.vin`) via the "Add subdomain" button on each card. `urls.kind` (`'path'` or `'subdomain'`) distinguishes the two, and `(code, kind)` is the primary key, so the same string can be used as both a path and a subdomain independently.

This depends on Cloudflare routing every subdomain request to `https://tiny.vin/subdomain/<name>` (a wildcard DNS record plus a redirect rule, configured outside this repo) — the Worker only handles the resulting `/subdomain/<name>` request, looking it up with `kind = 'subdomain'` and issuing the redirect from there.

If the database was created before this feature existed, apply `migrations/0005_add_subdomain_support.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0005_add_subdomain_support.sql --remote`) in addition to `schema.sql`. This migration rebuilds the `urls` table (SQLite can't add a column to a composite primary key in place), so back up first if the data matters.
