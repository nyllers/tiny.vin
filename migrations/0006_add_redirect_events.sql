CREATE TABLE IF NOT EXISTS redirect_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  kind TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  ip_address TEXT,
  country TEXT,
  user_agent TEXT,
  referer TEXT,
  headers TEXT NOT NULL,
  cf_data TEXT,
  FOREIGN KEY (code, kind) REFERENCES urls(code, kind) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_redirect_events_code ON redirect_events(code, kind);
