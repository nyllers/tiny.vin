# tiny.vin

URL shortener for tiny.vin. Cloudflare Worker (static assets + API) + D1.

- `public/` — static frontend (served as assets by the Worker)
- `src/index.js` — Worker script: `POST /api/urls` to create a short code, `GET /<code>` to redirect
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

The homepage and `POST /api/urls` require signing in with Google; `GET /<code>` redirects stay public so shared links keep working for anyone. There's no email allowlist — any Google account can sign in. (Facebook login was dropped: Meta requires Business Verification to take a Facebook Login app out of Development mode, which doesn't fit a personal project.)

Required secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (any long random string, used to sign the session cookie).

1. **Google**: Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application). Add Authorized redirect URIs for every origin you'll use this from, e.g. `https://tiny.vin/auth/google/callback` and `http://localhost:8787/auth/google/callback` for local dev. Under OAuth consent screen, publish the app (out of "Testing" status) so any Google account can sign in, not just added test users.
2. **Local dev**: copy `.dev.vars.example` to `.dev.vars` and fill in the values (this file is gitignored, never commit real secrets). Run `wrangler dev` as usual.
3. **Production**: set each secret with `wrangler secret put NAME` (prompts for the value, doesn't touch any file).

Sign out via `/auth/logout` (linked at the bottom of the homepage).

Every successful login is recorded in D1: `login_identities` holds one row per email address, and `login_events` holds a timestamped row per login, referencing that identity. This is on top of the base schema — if the database was created before this branch existed, apply `migrations/0002_add_login_tracking.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0002_add_login_tracking.sql --remote`) in addition to `schema.sql`.

`login_identities` originally also had a `provider` column (this project has only ever supported Google sign-in, so it never carried real information) and its email column was originally named `username`. If the database predates this cleanup, apply `migrations/0010_login_identities_email.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0010_login_identities_email.sql --remote`) in addition to `schema.sql`. This migration rebuilds `login_identities` and `login_identities_history` (SQLite can't drop a column that's part of a UNIQUE constraint or referenced by a trigger), so back up first if the data matters.

`login_identities.role` distinguishes regular users (`'user'`, the default for every new signup) from administrators (`'admin'`). It's purely a label now — every permission it used to gate (the resource cap, the minimum custom-path length) has its own column instead, both independently tunable per account regardless of role. There's no UI for any of this yet — promote an account (and typically raise its limits alongside it) by hand:

```bash
wrangler d1 execute tiny-vin-db --remote --command "UPDATE login_identities SET role = 'admin', max_resources = 100, min_custom_path_length = 1 WHERE email = 'you@example.com'"
```

If the database was created before this existed, apply `migrations/0012_add_login_identities_role.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0012_add_login_identities_role.sql --remote`) in addition to `schema.sql`. This migration also promotes every account that already existed at the time it runs to `'admin'`, since there was no user/admin distinction before it — review who that affects before running it against production.

`login_identities.max_resources` caps how many URLs and/or e-mail aliases (`urls` rows + `email_redirects` rows, added together) an account can hold at once — 10 by default for every new signup, the same as every regular account had before this was a column. Tune it per account by hand the same way as `role` above (they're independent — bumping `role` to `'admin'` alone no longer raises this). Both `POST /api/urls` and `POST /api/emails` check the combined count against this column before creating (or adding a path/subdomain/alias to an existing one) and return `403` once at the limit — deleting a URL or an alias frees up a slot.

If the database was created before this existed, apply `migrations/0015_add_login_identities_max_resources.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0015_add_login_identities_max_resources.sql --remote`) in addition to `schema.sql`. This migration backfills every existing `admin` account to 100, preserving the effective limit the old hardcoded constants gave them.

`login_identities.min_custom_path_length` sets the minimum length `POST /api/urls` accepts for a custom `path` or `subdomain` — 5 by default for every new signup. Tune it per account the same way as `max_resources` above.

If the database was created before this existed, apply `migrations/0016_add_login_identities_min_custom_path_length.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0016_add_login_identities_min_custom_path_length.sql --remote`) in addition to `schema.sql`. This migration backfills every existing `admin` account to 1, preserving the effective minimum the old hardcoded constants gave them.

## API access

Signed-in accounts can create tiny URLs from the command line instead of the browser, via an API key. The `/api` page (linked from the nav) generates one while signed in — one key per account; regenerating immediately invalidates the previous one.

Send the key as `Authorization: Bearer <key>` on `POST /api/urls`, the same endpoint the browser uses:

```bash
curl -X POST https://tiny.vin/api/urls \
  -H "Authorization: Bearer tvk_..." \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Add `"path": "my-page"` to the body for a custom path, or `"subdomain": "my-name"` for a subdomain — same fields as picking "Add Path"/"Add Subdomain" in the browser. On success the response is `201 Created` with an empty body; the fully-qualified short URL is in the `Location` header, e.g. `Location: https://tiny.vin/aZ3xQ72K`. Errors (invalid URL, taken code, etc.) still come back as a JSON body with an `error` message.

If the database was created before this existed, apply `migrations/0009_add_api_keys.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0009_add_api_keys.sql --remote`) in addition to `schema.sql`.

The same key also works on `POST /api/emails`, for creating e-mail redirects from the command line:

```bash
curl -X POST https://tiny.vin/api/emails \
  -H "Authorization: Bearer tvk_..." \
  -H "Content-Type: application/json" \
  -d '{"alias": "newsletter", "destination": "you@example.com"}'
```

`alias` is optional — omit it for a random 8-character one, the same idea as leaving off `path`/`subdomain` for URLs. On success the response is `201 Created` with a JSON body (`{"alias", "destination", "verified"}` — see "E-mail redirects" above for what `verified` means and why Cloudflare credentials are required for this to work at all). `GET /api/emails` (list) and `DELETE /api/emails/<alias>` stay session-only, same as the equivalent URL endpoints - only creation is exposed to API keys.

## Subdomains

In addition to path-based short URLs (`tiny.vin/<code>`), a URL can also get a subdomain-based one (`<name>.tiny.vin`) via the "Add subdomain" button on each card. `urls.kind` (`'generated-path'`, `'custom-path'`, or `'subdomain'` — the first two distinguish an auto-generated code from a user-chosen pathname) distinguishes them, and `(code, kind)` is the primary key, so the same string can be used as a path and a subdomain independently.

This depends on Cloudflare routing every subdomain request to `https://tiny.vin/subdomain/<name>` (a wildcard DNS record plus a redirect rule, configured outside this repo) — the Worker only handles the resulting `/subdomain/<name>` request, looking it up with `kind = 'subdomain'` and issuing the redirect from there.

If the database was created before this feature existed, apply `migrations/0005_add_subdomain_support.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0005_add_subdomain_support.sql --remote`) in addition to `schema.sql`. This migration rebuilds the `urls` table (SQLite can't add a column to a composite primary key in place), so back up first if the data matters.

The `generated-path`/`custom-path` split is separate and newer: if the database predates it, apply `migrations/0008_split_path_kind.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0008_split_path_kind.sql --remote`) in addition to `schema.sql`. It converts every existing `kind = 'path'` row to `'generated-path'` — reclassifying specific rows to `'custom-path'` afterward is manual, one-off data entry, since the migration has no way to know which existing codes were originally hand-picked.

## E-mail redirects

The `/emails` page (linked from the nav) lets a signed-in account redirect `<alias>@tiny.vin` to any other e-mail address — `email_redirects` holds one row per alias (`alias` is the primary key, same relationship `urls.code` has to the domain), with `alias@tiny.vin` reserved words checked against the same `RESERVED_CODES` set used for paths. If the database was created before this existed, apply `migrations/0013_add_email_redirects.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0013_add_email_redirects.sql --remote`) in addition to `schema.sql`.

Mirroring the URL page: the top form only asks for a destination address and generates a random 8-character lowercase alphanumeric alias (`generateEmailAlias` in `src/index.js`), retrying on collision the same way `generateCode` does for URLs. Multiple aliases can point at the same destination — cards group by destination the same way URL cards group by original URL, and each card's "Add alias" button reveals an inline input (mirroring "Add Path"/"Add Subdomain" on the URL page) for attaching another chosen alias to that destination without re-entering it.

**This needs Cloudflare Email Routing enabled on the zone**, which isn't part of this repo: enable it with `wrangler email routing enable tiny.vin`, or Dashboard → **Email Service** → **Email Routing** → **Enable**. This adds the required MX/TXT records. (On tiny.vin this has already been done.)

Cloudflare's catch-all rule only supports **forward** or **drop** actions — it can't target a Worker, so there's no single rule that routes every address through `email_redirects`. Instead, `handleCreateEmailRedirect` creates one **Email Routing Rule** per alias via the API (a literal match on `<alias>@tiny.vin` → action **Send to Worker** → `tiny-vin`), and `handleDeleteEmailRedirect` deletes it again when the redirect is removed. The rule's id is stored in `email_redirects.cloudflare_rule_id`. The Worker's `email()` export (in `src/index.js`) then just looks up the recipient's local part in `email_redirects` and calls `message.forward()`.

This makes Cloudflare API credentials **required**, not optional — without them there's no way to wire a new alias up to the Worker at all, so `POST /api/emails` returns `503` rather than silently creating a redirect that can never receive mail. Three values are needed:

- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID` (the zone id for `tiny.vin`) — both visible on the domain's Cloudflare dashboard Overview page.
- `CLOUDFLARE_API_TOKEN`, a token scoped to both **Account → Email Routing Addresses → Edit** and **Zone → Email Routing Rules → Edit** (routing rules are zone-scoped; destination addresses are account-scoped — two different permission groups on the same token).

**Destinations must also be verified by Cloudflare before mail actually forwards there** — forwarding to an unverified address fails silently (no bounce to the sender), which is a platform anti-spam rule, not something this app can skip. With credentials configured, creating a redirect automatically registers the destination with Cloudflare (triggering their verification e-mail if it's a new address) and the page shows each redirect's live verified/pending status.

Every message that matches a known alias is logged to `email_redirect_events`, mirroring `redirect_events` for URLs: sender address, subject, `Message-ID`, size in bytes, the full MIME headers as a JSON blob, whether `message.forward()` succeeded, and a reject reason if it didn't — useful for confirming a message actually reached this Worker and was handed off to Cloudflare, when delivery issues turn out to be on the receiving mail provider's side instead. `alias` is a foreign key into `email_redirects(alias)` with `ON DELETE CASCADE`, so deleting a redirect cleans up its event history too. The raw message body is deliberately not stored. Recording happens via `ctx.waitUntil()`, is best-effort, and only runs for messages that match an existing alias (unmatched addresses are rejected without being logged, same as a 404 short URL isn't logged). If the database predates this, apply `migrations/0014_add_email_redirect_events.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0014_add_email_redirect_events.sql --remote`) in addition to `schema.sql`.

## Redirect statistics

Every successful redirect (path or subdomain) is logged to `redirect_events`: which code/kind was hit, a timestamp, and as much request detail as a Worker can see — IP, country, latitude/longitude, user agent, referer, the full request headers, and Cloudflare's whole `request.cf` object (geo, TLS, bot-management score, ASN, etc.), each as a JSON blob. `(code, kind)` is a foreign key into `urls(code, kind)` with `ON DELETE CASCADE`, so it's a proper many-to-one relationship (many events per short URL) and deleting a short URL cleans up its stats too — D1 enforces foreign keys by default, so this isn't just documentation. Recording happens in the background via `ctx.waitUntil()` so it never adds latency to the redirect itself, and it's best-effort (a logging failure never blocks or breaks the redirect).

`latitude`/`longitude` are stored as their own columns (populated straight from `request.cf.latitude`/`request.cf.longitude`) rather than only living inside the `cf_data` blob, so the world map card can query them directly without parsing JSON per row. If the database predates these columns, apply `migrations/0011_add_redirect_geo.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0011_add_redirect_geo.sql --remote`) in addition to `schema.sql` — it backfills both columns for existing rows from their `cf_data`, falling back to `NULL` for any row whose `cf_data` didn't include a location.

The `/stats` page surfaces this data per-account. The "Breakdown Last 14 Days" section is entirely windowed to the last 14 days: number of redirects per day, redirects per URL, redirects by browser, redirects by referer hostname (with no referer counted as "Direct" and `tiny.vin`/its subdomains excluded as not being real external referrers), and a "Redirected Geographic Locations" world map plotting a dot per distinct redirect location, sized by how many redirects came from it. The "Total Redirects by URL" section below it, and the top "Redirects" summary tile, are both deliberately lifetime counts instead, for context alongside the windowed breakdown. Every chart in the breakdown section can be expanded into a full-width modal via the expand button in its corner, which also drops any label truncation so long URL codes, browser names, or referer hostnames are always shown in full. `GET /api/stats` also still computes a rough device (mobile/desktop/tablet) split and top origin countries by ISO code, neither of which the page displays, to keep it from getting too busy.

The map's landmass outline (`public/world-map-path.js`) is vendored, simplified SVG path data derived once from the [world-atlas](https://github.com/topojson/world-atlas) package's 110m land topology (itself from the public-domain [Natural Earth](https://www.naturalearthdata.com/) dataset), decoded and simplified with Douglas-Peucker at authoring time — no mapping library or external data fetch happens at runtime, consistent with every other chart on this page.

If the database was created before this existed, apply `migrations/0006_add_redirect_events.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0006_add_redirect_events.sql --remote`) in addition to `schema.sql`.

## E-mail statistics

The `/email-stats` page mirrors `/stats`, built from `email_redirect_events` instead of `redirect_events`. The "Breakdown Last 14 Days" section shows messages received per day, messages per alias, and messages by sender domain (the part of `from_address` after the `@`, falling back to "Unknown" when there isn't one) — there's no browser/referer/geo equivalent, since SMTP doesn't give a Worker anything like `request.cf`. "Total Messages by Destination" below it groups cards by destination address exactly like the `/emails` page itself does, each card listing every alias that forwards there with its lifetime message count and last-message time. The summary tiles add one thing `/stats` doesn't have: **Failed to Forward**, a lifetime count of messages where `message.forward()` threw — worth watching if a destination stops accepting Cloudflare's forwards (see the Gmail delivery notes above). `GET /api/email-stats` powers this the same way `GET /api/stats` powers the URL page, and the two pages' shared chart-drawing code (bar charts, the expand-to-modal view, summary tiles) lives in `public/charts.js` rather than being duplicated.

## Change history

Every table has a matching `<table>_history` table (`login_identities_history`, `urls_history`, `login_events_history`, `redirect_events_history`, `api_keys_history`, `email_redirects_history`, `email_redirect_events_history`) holding the same columns plus a `history_created` timestamp. Triggers on each table copy a row's content into its history table right before an `UPDATE` or `DELETE`, so nothing has to opt in from the application code — this includes rows removed indirectly, e.g. a `redirect_events` row disappearing via `urls`' `ON DELETE CASCADE` still lands in `redirect_events_history`. History tables drop the original's primary/unique/foreign key constraints, since the same row can be changed many times over its life and a history row must never be blocked by a parent that's since been deleted itself.

If the database was created before this existed, apply `migrations/0007_add_history_tables.sql` (`wrangler d1 execute tiny-vin-db --file=migrations/0007_add_history_tables.sql --remote`) in addition to `schema.sql`.

## QR codes

Each short URL in the "Created URLs" list has a QR-code icon next to its copy-link icon. Clicking it opens a modal with a large QR code encoding `https://<shortUrl>` (the scheme is added since the stored/displayed short URL never includes one). QR generation is entirely client-side and offline — `public/qrcode-lib.js` vendors [kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT license, unmodified) rather than calling a third-party image API, so the destination URL never leaves the browser.

## Response hardening

`withSecurityHeaders` in `src/index.js` wraps every response (pages, the API, static assets, and redirects alike) with `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security` — uniform header hygiene across the whole origin, which some automated site-categorization/reputation scanners factor into how they score a domain. `Content-Security-Policy` is deliberately not included: the PayPal donate SDK's inline `onload` handler and other third-party resources would need a careful per-page audit first, and adding it in without one would break the donate button.

Short-code and subdomain redirects (`handleRedirect`) also answer `HEAD` requests identically to `GET` — same redirect, no body — instead of falling through to a `404`. Redirect services conventionally support `HEAD` so link-preview tools and security scanners can check a destination without it counting as a real visit; `HEAD` requests are excluded from `redirect_events` for the same reason (only `GET` click-throughs count as analytics).

`public/robots.txt` and `public/.well-known/security.txt` (RFC 9116) are both static files, no server logic involved.

Clicking the QR code itself copies it to the clipboard as a PNG (rendered via the library's `renderTo2dContext` onto an offscreen canvas, then `canvas.toBlob` + the Clipboard API — no server round-trip). The URL underneath the QR code reuses the same copy-group styling and copy-link icon as the short URL in its card, so both look and behave identically.
