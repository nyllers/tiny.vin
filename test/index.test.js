import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeHtmlEntities,
  deriveFallbackTitle,
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
