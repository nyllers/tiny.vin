CREATE TABLE urls_new (
  code TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO urls_new (code, original_url, created_at)
SELECT code, original_url, created_at FROM urls;

DROP TABLE urls;

ALTER TABLE urls_new RENAME TO urls;
