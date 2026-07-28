CREATE TABLE IF NOT EXISTS login_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  username TEXT NOT NULL,
  UNIQUE (provider, username)
);

CREATE TABLE IF NOT EXISTS urls (
  code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'path',
  original_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES login_identities(id),
  PRIMARY KEY (code, kind)
);

CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id INTEGER NOT NULL REFERENCES login_identities(id),
  logged_in_at INTEGER NOT NULL,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_events_identity ON login_events(identity_id);

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
