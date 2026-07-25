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
