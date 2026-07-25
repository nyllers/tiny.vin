CREATE TABLE IF NOT EXISTS urls (
  code TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
