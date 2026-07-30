-- One API key per account, used to authenticate curl/script access to
-- POST /api/shorten via an `Authorization: Bearer <key>` header, instead of
-- the browser's session cookie. Requesting/regenerating a key is done from
-- the /api page while signed in; identity_id is the primary key since an
-- account only ever has one active key at a time (regenerating replaces it).

CREATE TABLE IF NOT EXISTS api_keys (
  identity_id INTEGER PRIMARY KEY REFERENCES login_identities(id),
  key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id INTEGER,
  key TEXT,
  created_at INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS api_keys_history_update
AFTER UPDATE ON api_keys
BEGIN
  INSERT INTO api_keys_history (identity_id, key, created_at)
  VALUES (OLD.identity_id, OLD.key, OLD.created_at);
END;

CREATE TRIGGER IF NOT EXISTS api_keys_history_delete
AFTER DELETE ON api_keys
BEGIN
  INSERT INTO api_keys_history (identity_id, key, created_at)
  VALUES (OLD.identity_id, OLD.key, OLD.created_at);
END;
