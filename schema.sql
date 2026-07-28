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
