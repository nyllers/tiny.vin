CREATE TABLE IF NOT EXISTS login_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  username TEXT NOT NULL,
  UNIQUE (provider, username)
);

CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id INTEGER NOT NULL REFERENCES login_identities(id),
  logged_in_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_events_identity ON login_events(identity_id);
