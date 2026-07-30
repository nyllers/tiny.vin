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

## Login

The homepage and `POST /api/shorten` require signing in with Google; `GET /<code>` redirects stay public so shared links keep working for anyone. There's no email allowlist — any Google account can sign in. (Facebook login was dropped: Meta requires Business Verification to take a Facebook Login app out of Development mode, which doesn't fit a personal project.)

Required secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (any long random string, used to sign the session cookie).

1. **Google**: Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application). Add Authorized redirect URIs for every origin you'll use this from, e.g. `https://tiny.vin/auth/google/callback` and `http://localhost:8787/auth/google/callback` for local dev. Under OAuth consent screen, publish the app (out of "Testing" status) so any Google account can sign in, not just added test users.
2. **Local dev**: copy `.dev.vars.example` to `.dev.vars` and fill in the values (this file is gitignored, never commit real secrets). Run `wrangler dev` as usual.
3. **Production**: set each secret with `wrangler secret put NAME` (prompts for the value, doesn't touch any file).

Sign out via `/auth/logout` (linked at the bottom of the homepage).

Every successful login is recorded in D1: `login_identities` holds one row per (provider, username) pair, and `login_events` holds a timestamped row per login, referencing that identity. This is on top of the base schema — if the database was created before this branch existed, apply `migrations/0002_add_login_tracking.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0002_add_login_tracking.sql --remote`) in addition to `schema.sql`.

## API access

Signed-in accounts can create tiny URLs from the command line instead of the browser, via an API key. The `/api` page (linked from the nav) generates one while signed in — one key per account; regenerating immediately invalidates the previous one.

Send the key as `Authorization: Bearer <key>` on `POST /api/shorten`, the same endpoint the browser uses:

```bash
curl -X POST https://tiny.vin/api/shorten \
  -H "Authorization: Bearer tvk_..." \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Add `"path": "my-page"` to the body for a custom path, or `"subdomain": "my-name"` for a subdomain — same fields as picking "Add Path"/"Add Subdomain" in the browser. On success the response is `201 Created` with an empty body; the fully-qualified short URL is in the `Location` header, e.g. `Location: https://tiny.vin/aZ3xQ72K`. Errors (invalid URL, taken code, etc.) still come back as a JSON body with an `error` message.

If the database was created before this existed, apply `migrations/0009_add_api_keys.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0009_add_api_keys.sql --remote`) in addition to `schema.sql`.

## Subdomains

In addition to path-based short URLs (`tiny.vin/<code>`), a URL can also get a subdomain-based one (`<name>.tiny.vin`) via the "Add subdomain" button on each card. `urls.kind` (`'generated-path'`, `'custom-path'`, or `'subdomain'` — the first two distinguish an auto-generated code from a user-chosen pathname) distinguishes them, and `(code, kind)` is the primary key, so the same string can be used as a path and a subdomain independently.

This depends on Cloudflare routing every subdomain request to `https://tiny.vin/subdomain/<name>` (a wildcard DNS record plus a redirect rule, configured outside this repo) — the Worker only handles the resulting `/subdomain/<name>` request, looking it up with `kind = 'subdomain'` and issuing the redirect from there.

If the database was created before this feature existed, apply `migrations/0005_add_subdomain_support.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0005_add_subdomain_support.sql --remote`) in addition to `schema.sql`. This migration rebuilds the `urls` table (SQLite can't add a column to a composite primary key in place), so back up first if the data matters.

The `generated-path`/`custom-path` split is separate and newer: if the database predates it, apply `migrations/0008_split_path_kind.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0008_split_path_kind.sql --remote`) in addition to `schema.sql`. It converts every existing `kind = 'path'` row to `'generated-path'` — reclassifying specific rows to `'custom-path'` afterward is manual, one-off data entry, since the migration has no way to know which existing codes were originally hand-picked.

## Redirect statistics

Every successful redirect (path or subdomain) is logged to `redirect_events`: which code/kind was hit, a timestamp, and as much request detail as a Worker can see — IP, country, user agent, referer, the full request headers, and Cloudflare's whole `request.cf` object (geo, TLS, bot-management score, ASN, etc.), each as a JSON blob. `(code, kind)` is a foreign key into `urls(code, kind)` with `ON DELETE CASCADE`, so it's a proper many-to-one relationship (many events per short URL) and deleting a short URL cleans up its stats too — D1 enforces foreign keys by default, so this isn't just documentation. Recording happens in the background via `ctx.waitUntil()` so it never adds latency to the redirect itself, and it's best-effort (a logging failure never blocks or breaks the redirect).

The `/stats` page surfaces this data per-account: total links/redirects, redirects in the last 14 days, a breakdown of redirects per URL, and a daily count for the last 14 days rendered as a small SVG bar chart. `GET /api/stats` also computes top origin countries, top referrers (by hostname, with no referer counted as "Direct" and `tiny.vin`/its subdomains excluded as not being real external referrers), and a rough browser/device split parsed from the user agent string — the page just doesn't display these anymore, to keep it minimal.

If the database was created before this existed, apply `migrations/0006_add_redirect_events.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0006_add_redirect_events.sql --remote`) in addition to `schema.sql`.

## Change history

Every table has a matching `<table>_history` table (`login_identities_history`, `urls_history`, `login_events_history`, `redirect_events_history`, `api_keys_history`) holding the same columns plus a `history_created` timestamp. Triggers on each table copy a row's content into its history table right before an `UPDATE` or `DELETE`, so nothing has to opt in from the application code — this includes rows removed indirectly, e.g. a `redirect_events` row disappearing via `urls`' `ON DELETE CASCADE` still lands in `redirect_events_history`. History tables drop the original's primary/unique/foreign key constraints, since the same row can be changed many times over its life and a history row must never be blocked by a parent that's since been deleted itself.

If the database was created before this existed, apply `migrations/0007_add_history_tables.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0007_add_history_tables.sql --remote`) in addition to `schema.sql`.

## QR codes

Each short URL in the "Created URLs" list has a QR-code icon next to its copy-link icon. Clicking it opens a modal with a large QR code encoding `https://<shortUrl>` (the scheme is added since the stored/displayed short URL never includes one). QR generation is entirely client-side and offline — `public/qrcode-lib.js` vendors [kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT license, unmodified) rather than calling a third-party image API, so the destination URL never leaves the browser.

Clicking the QR code itself copies it to the clipboard as a PNG (rendered via the library's `renderTo2dContext` onto an offscreen canvas, then `canvas.toBlob` + the Clipboard API — no server round-trip). The URL underneath the QR code reuses the same copy-group styling and copy-link icon as the short URL in its card, so both look and behave identically.
