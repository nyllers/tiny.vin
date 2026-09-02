// One-time backfill: fetches <title> for every existing URL destination
// that doesn't have one yet (predates the title feature), falling back to
// the last path segment when no <title> can be found, and sets the
// destination's own e-mail address as its title for e-mail destinations.
// All updates are written via a single generated .sql file applied through
// wrangler d1 execute --file - avoids shell-interpolating fetched page
// titles into a command string (SQL/shell injection risk), since a page
// title is untrusted content.
//
// Usage:
//   node scripts/backfill-titles.js            (local D1)
//   node scripts/backfill-titles.js --remote   (production D1)

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TITLE_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i;
const TITLE_FETCH_MAX_BYTES = 1048576;

function deriveFallbackTitle(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    return decodeURIComponent(segments[segments.length - 1]);
  } catch {
    return null;
  }
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchPageTitle(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; TinyVINBot/1.0; +https://tiny.vin)" },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytesRead = 0;
    try {
      while (bytesRead < TITLE_FETCH_MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.length;
        html += decoder.decode(value, { stream: true });
        if (TITLE_PATTERN.test(html)) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    const match = html.match(TITLE_PATTERN);
    if (!match) return null;

    const title = decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim();
    return title || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function sqlStringLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const isRemote = process.argv.includes("--remote");
  const flag = isRemote ? "--remote" : "--local";

  console.log(`Listing e-mail destinations without a title (${isRemote ? "PRODUCTION" : "local"})...`);
  const emailListJson = execSync(
    `npx wrangler d1 execute tiny-vin-db ${flag} --json --command "SELECT DISTINCT d.id, d.original_url FROM destinations d JOIN aliases a ON a.destination_id = d.id WHERE d.title IS NULL AND a.kind = 'email'"`,
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 }
  );
  const emailRows = JSON.parse(emailListJson)[0].results;
  console.log(`Found ${emailRows.length} e-mail destination(s) needing a title.`);

  const updates = emailRows.map(
    (row) => `UPDATE destinations SET title = ${sqlStringLiteral(row.original_url)} WHERE id = ${row.id};`
  );

  console.log(`\nListing URL destinations without a title (${isRemote ? "PRODUCTION" : "local"})...`);
  const listJson = execSync(
    `npx wrangler d1 execute tiny-vin-db ${flag} --json --command "SELECT DISTINCT d.id, d.original_url FROM destinations d JOIN aliases a ON a.destination_id = d.id WHERE d.title IS NULL AND a.kind != 'email'"`,
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 }
  );
  const rows = JSON.parse(listJson)[0].results;
  console.log(`Found ${rows.length} URL destination(s) needing a title.`);

  let found = 0;
  for (const row of rows) {
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

  console.log(`\nFetched ${found} of ${rows.length} URL titles, plus ${emailRows.length} e-mail address(es).`);

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
