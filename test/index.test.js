import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionCookie } from "../src/session.js";
import worker, {
  normalizeQrUrl,
  decodeHtmlEntities,
  deriveFallbackTitle,
  deriveTitleSlug,
  fetchPageTitle,
  validateDestinationEmail,
  validateSubdomain,
  validateEmailAlias,
  formatShortUrl,
} from "../src/index.js";

test("decodeHtmlEntities", async (t) => {
  await t.test("named entities", () => {
    assert.equal(decodeHtmlEntities("Tom &amp; Jerry"), "Tom & Jerry");
    assert.equal(decodeHtmlEntities("&lt;tag&gt;"), "<tag>");
    assert.equal(decodeHtmlEntities("&quot;quoted&quot;"), '"quoted"');
    assert.equal(decodeHtmlEntities("&apos;s"), "'s");
    assert.equal(decodeHtmlEntities("a&nbsp;b"), "a b");
  });

  await t.test("numeric decimal references, including leading zeros", () => {
    assert.equal(decodeHtmlEntities("Caroline&#39;s Cooking"), "Caroline's Cooking");
    assert.equal(decodeHtmlEntities("Caroline&#039;s Cooking"), "Caroline's Cooking");
    assert.equal(decodeHtmlEntities("Cornucopia? &#8211; Evig tillväxt"), "Cornucopia? – Evig tillväxt");
  });

  await t.test("numeric hex references", () => {
    assert.equal(decodeHtmlEntities("&#x27;"), "'");
    assert.equal(decodeHtmlEntities("&#X27;"), "'");
    assert.equal(decodeHtmlEntities("&#x2013;"), "–");
  });

  await t.test("leaves plain text untouched", () => {
    assert.equal(decodeHtmlEntities("Nothing to decode here"), "Nothing to decode here");
  });
});

test("deriveFallbackTitle", async (t) => {
  await t.test("uses the last path segment", () => {
    assert.equal(deriveFallbackTitle("https://example.com/a/b/tiny-vin.apk"), "tiny-vin.apk");
  });

  await t.test("ignores the query string", () => {
    assert.equal(
      deriveFallbackTitle("https://example.com/docs/Presentationer.aspx?RootFolder=%2fa%2fb&FolderCTID=xyz"),
      "Presentationer.aspx"
    );
  });

  await t.test("ignores a trailing slash", () => {
    assert.equal(deriveFallbackTitle("https://example.com/some-page/"), "some-page");
  });

  await t.test("decodes percent-encoding in the last segment", () => {
    assert.equal(deriveFallbackTitle("https://example.com/a%20b"), "a b");
  });

  await t.test("returns null for a bare domain with no path", () => {
    assert.equal(deriveFallbackTitle("https://example.com/"), null);
    assert.equal(deriveFallbackTitle("https://example.com"), null);
  });

  await t.test("returns null for an unparseable URL", () => {
    assert.equal(deriveFallbackTitle("not a url"), null);
  });
});

test("deriveTitleSlug", async (t) => {
  await t.test("uses the lowercased first word when it is 6+ characters", () => {
    assert.equal(deriveTitleSlug("Example Domain"), "example");
    assert.equal(deriveTitleSlug("Flammkuchen (Flammekueche/tarte flambee from Alsace)"), "flammkuchen");
  });

  await t.test("strips punctuation inside a word but keeps its hyphens", () => {
    assert.equal(deriveTitleSlug("Caroline's Cooking"), "carolines");
    assert.equal(deriveTitleSlug("IANA-managed Reserved Domains"), "iana-managed");
    assert.equal(deriveTitleSlug("--Wow-- Thing"), "wow-thing");
  });

  await t.test("joins the first two words when the first is short but the pair is 6+", () => {
    assert.equal(deriveTitleSlug("Hello World"), "hello-world");
    assert.equal(deriveTitleSlug("Go Run"), "go-run");
  });

  await t.test("falls back to three words when two are still under 6", () => {
    assert.equal(deriveTitleSlug("A B C D E"), "a-b-c");
  });

  await t.test("ignores standalone punctuation tokens", () => {
    assert.equal(deriveTitleSlug("Foo - Barbaz"), "foo-barbaz");
  });

  await t.test("returns null for a non-ASCII title", () => {
    assert.equal(deriveTitleSlug("HC Z: Säsong 1 Avsnitt 1 - YouTube"), null);
    assert.equal(deriveTitleSlug("Cornucopia? – Evig tillväxt"), null);
  });

  await t.test("returns null for a title shorter than 6 characters", () => {
    assert.equal(deriveTitleSlug("Hello"), null);
    assert.equal(deriveTitleSlug("  Hi  "), null);
  });

  await t.test("returns null when no qualifying word combination exists", () => {
    assert.equal(deriveTitleSlug("A B!!!!!"), null);
    assert.equal(deriveTitleSlug("!!!!!!!!"), null);
  });

  await t.test("returns null when the slug would exceed 32 characters", () => {
    assert.equal(deriveTitleSlug("Supercalifragilisticexpialidocious Word"), null);
  });

  await t.test("returns null for a missing title", () => {
    assert.equal(deriveTitleSlug(null), null);
    assert.equal(deriveTitleSlug(undefined), null);
  });
});

test("routing for hyphenated short codes", async (t) => {
  function envReturning(row) {
    const lookups = [];
    return {
      lookups,
      env: {
        DB: {
          prepare: (sql) => ({
            bind: (...args) => ({
              first: async () => {
                lookups.push({ sql, args });
                return row;
              },
            }),
          }),
        },
      },
    };
  }

  await t.test("a code containing a hyphen reaches the redirect lookup", async () => {
    const { env, lookups } = envReturning({ id: 1, kind: "generated-path", original_url: "https://example.com/" });
    const response = await worker.fetch(new Request("https://tiny.vin/hello-world", { method: "HEAD" }), env, {});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://example.com/");
    assert.equal(lookups[0].args[0], "hello-world");
  });

  await t.test("an unknown hyphenated code is a 404, not a fall-through to static assets", async () => {
    const { env } = envReturning(null);
    const response = await worker.fetch(new Request("https://tiny.vin/no-such-code", { method: "HEAD" }), env, {});
    assert.equal(response.status, 404);
  });
});

test("normalizeQrUrl", async (t) => {
  await t.test("keeps an http(s) URL exactly as typed", () => {
    assert.deepEqual(normalizeQrUrl("https://example.com/a?b=1"), { url: "https://example.com/a?b=1", hostname: "example.com" });
    assert.equal(normalizeQrUrl("http://example.com").url, "http://example.com");
  });

  await t.test("adds https:// when no scheme was typed", () => {
    assert.equal(normalizeQrUrl("example.com/page").url, "https://example.com/page");
  });

  await t.test("doesn't reject short URLs (unlike redirect creation)", () => {
    assert.equal(normalizeQrUrl("a.co").url, "https://a.co");
  });

  await t.test("rejects other schemes", () => {
    assert.match(normalizeQrUrl("ftp://example.com").error, /only http:\/\/ and https:\/\//);
  });

  await t.test("rejects an e-mail address instead of turning it into a URL with credentials", () => {
    assert.match(normalizeQrUrl("someone@example.com").error, /e-mail address/);
    assert.match(normalizeQrUrl("mailto:someone@example.com").error, /e-mail address/);
  });

  await t.test("rejects whitespace, junk and hostless input", () => {
    assert.ok(normalizeQrUrl("not a url").error);
    assert.ok(normalizeQrUrl("javascript:alert(1)").error);
    assert.ok(normalizeQrUrl("https://nodots").error);
  });

  await t.test("rejects a URL too long for a QR code", () => {
    assert.match(normalizeQrUrl(`https://example.com/${"a".repeat(2000)}`).error, /too long/);
  });
});

test("POST /api/url-info and the /qr page", async (t) => {
  const env = { SESSION_SECRET: "test-secret", DB: { prepare: () => assert.fail("no database access expected") } };
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const cookie = (await createSessionCookie({ email: "me@example.com", name: "Me" }, env.SESSION_SECRET)).split(";")[0];
  const post = (value, headers = { cookie }) =>
    worker.fetch(
      new Request("https://tiny.vin/api/url-info", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ value }),
      }),
      env,
      {}
    );

  await t.test("returns the normalized URL and page title", async () => {
    globalThis.fetch = async () => new Response("<title>Example Domain</title>", { status: 200 });
    const response = await post("example.com");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { url: "https://example.com", title: "Example Domain" });
  });

  await t.test("falls back to the path, then the hostname, when there's no title", async () => {
    globalThis.fetch = async () => new Response("", { status: 404 });
    assert.equal((await (await post("https://example.com/docs/guide.pdf")).json()).title, "guide.pdf");
    assert.equal((await (await post("https://example.com")).json()).title, "example.com");
  });

  await t.test("rejects an invalid URL with a 400", async () => {
    const response = await post("not a url");
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error);
  });

  await t.test("requires a signed-in session", async () => {
    const response = await post("example.com", {});
    assert.equal(response.status, 401);
  });

  await t.test("/qr is a page, not a short code", async () => {
    // Signed out it gets the login page; it must never reach the redirect lookup
    // (the DB mock above fails the test if anything touches it).
    const response = await worker.fetch(new Request("https://tiny.vin/qr"), env, {});
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
  });
});

test("fetchPageTitle", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test("extracts and decodes the <title> tag", async () => {
    globalThis.fetch = async () =>
      new Response("<html><head><title>Caroline&#39;s Cooking</title></head></html>", { status: 200 });
    assert.equal(await fetchPageTitle("https://example.com"), "Caroline's Cooking");
  });

  await t.test("returns null for a non-ok response", async () => {
    globalThis.fetch = async () => new Response("", { status: 404 });
    assert.equal(await fetchPageTitle("https://example.com"), null);
  });

  await t.test("returns null when no <title> tag is present", async () => {
    globalThis.fetch = async () => new Response("<html><body>no title here</body></html>", { status: 200 });
    assert.equal(await fetchPageTitle("https://example.com"), null);
  });

  await t.test("returns null when the fetch itself throws", async () => {
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    assert.equal(await fetchPageTitle("https://example.com"), null);
  });
});

test("validateDestinationEmail", async (t) => {
  await t.test("accepts a valid address and lowercases it", () => {
    assert.deepEqual(validateDestinationEmail("Person@Example.com"), { email: "person@example.com" });
  });

  await t.test("rejects a malformed address", () => {
    assert.ok(validateDestinationEmail("not-an-email").error);
  });

  await t.test("rejects an address longer than 254 characters", () => {
    const longLocal = "a".repeat(250);
    assert.ok(validateDestinationEmail(`${longLocal}@example.com`).error);
  });

  await t.test("rejects redirecting to another tiny.vin address", () => {
    assert.ok(validateDestinationEmail("someone@tiny.vin").error);
    assert.ok(validateDestinationEmail("someone@TINY.VIN").error);
  });
});

test("validateSubdomain", async (t) => {
  await t.test("accepts a valid lowercase subdomain", () => {
    assert.deepEqual(validateSubdomain("my-page", 3), { code: "my-page" });
  });

  await t.test("rejects uppercase letters", () => {
    assert.ok(validateSubdomain("MyPage", 3).error);
  });

  await t.test("rejects a leading or trailing hyphen", () => {
    assert.ok(validateSubdomain("-page", 3).error);
    assert.ok(validateSubdomain("page-", 3).error);
  });

  await t.test("rejects input shorter than the minimum length", () => {
    assert.ok(validateSubdomain("ab", 3).error);
  });

  await t.test("rejects a reserved code", () => {
    assert.ok(validateSubdomain("api", 2).error);
  });
});

test("validateEmailAlias", async (t) => {
  await t.test("accepts a valid alias", () => {
    assert.deepEqual(validateEmailAlias("my-alias", 3), { alias: "my-alias" });
  });

  await t.test("rejects invalid characters", () => {
    assert.ok(validateEmailAlias("has_underscore", 3).error);
  });
});

test("formatShortUrl", async (t) => {
  await t.test("formats a subdomain kind as a bare subdomain", () => {
    assert.equal(formatShortUrl("blog", "subdomain"), "blog.tiny.vin");
  });

  await t.test("formats every other kind as a tiny.vin path", () => {
    assert.equal(formatShortUrl("abc123", "generated-path"), "tiny.vin/abc123");
    assert.equal(formatShortUrl("custom", "custom-path"), "tiny.vin/custom");
  });
});
