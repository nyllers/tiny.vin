CREATE TABLE urls_new (
  code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'path',
  original_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES login_identities(id),
  PRIMARY KEY (code, kind)
);

INSERT INTO urls_new (code, kind, original_url, created_at, created_by)
SELECT code, 'path', original_url, created_at, created_by FROM urls;

DROP TABLE urls;

ALTER TABLE urls_new RENAME TO urls;
