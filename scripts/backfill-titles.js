// One-time backfill: fetches <title> for every existing URL destination
// that doesn't have one yet (predates the title feature), falling back to
// the last path segment when no <title> can be found, and sets the
// destination's own e-mail address as its title for e-mail destinations.
// All updates are written via a single generated .sql file applied through
// wrangler d1 execute --file - avoids shell-interpolating fetched page
// titles into a command string (SQL/shell injection risk), since a page
// title is untrusted content.
//
// fetchPageTitle/deriveFallbackTitle are imported from src/index.js rather
// than re-implemented here - both have already hidden a real bug once (see
// git history), and a fix to either would otherwise need to be applied in
// two places.
//
// Usage:
//   node scripts/backfill-titles.js            (local D1)
//   node scripts/backfill-titles.js --remote   (production D1)

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPageTitle, deriveFallbackTitle } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sqlStringLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const isRemote = process.argv.includes("--remote");
  const flag = isRemote ? "--remote" : "--local";

  console.log(`Listing destinations without a title (${isRemote ? "PRODUCTION" : "local"})...`);
  // GROUP BY d.id (rather than a bare DISTINCT over d.id/original_url/kind)
  // keeps exactly one row per destination even when it has aliases of more
  // than one non-email kind (e.g. both a custom path and a subdomain) -
  // MAX(a.kind = 'email') is safe because a destination's aliases are never
  // a mix of email and non-email kinds.
  const listJson = execSync(
    `npx wrangler d1 execute tiny-vin-db ${flag} --json --command "SELECT d.id, d.original_url, MAX(a.kind = 'email') AS is_email FROM destinations d JOIN aliases a ON a.destination_id = d.id WHERE d.title IS NULL GROUP BY d.id"`,
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 }
  );
  const rows = JSON.parse(listJson)[0].results;
  const emailRows = rows.filter((row) => row.is_email);
  const urlRows = rows.filter((row) => !row.is_email);
  console.log(`Found ${emailRows.length} e-mail destination(s) and ${urlRows.length} URL destination(s) needing a title.`);

  const updates = emailRows.map(
    (row) => `UPDATE destinations SET title = ${sqlStringLiteral(row.original_url)} WHERE id = ${row.id};`
  );

  let found = 0;
  for (const row of urlRows) {
    process.stdout.write(`  ${row.original_url} ... `);
    const title = (await fetchPageTitle(row.original_url)) || deriveFallbackTitle(row.original_url);
    if (title) {
      console.log(`"${title}"`);
      updates.push(`UPDATE destinations SET title = ${sqlStringLiteral(title)} WHERE id = ${row.id};`);
      found++;
    } else {
      console.log("(no title found)");
    }
  }

  console.log(`\nFetched ${found} of ${urlRows.length} URL titles, plus ${emailRows.length} e-mail address(es).`);

  if (updates.length === 0) {
    console.log("No updates to apply.");
    return;
  }

  const sqlPath = path.join(__dirname, "backfill_titles_apply.sql");
  fs.writeFileSync(sqlPath, updates.join("\n") + "\n");
  console.log(`Applying ${updates.length} update(s) via ${sqlPath} ...`);
  execSync(`npx wrangler d1 execute tiny-vin-db ${flag} --file="${sqlPath}"`, { encoding: "utf8", stdio: "inherit" });
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
