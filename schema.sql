CREATE TABLE IF NOT EXISTS login_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  username TEXT NOT NULL,
  token_balance INTEGER NOT NULL DEFAULT 0,
  generated_path_billed_through_at INTEGER,
  low_balance_email_sent_at INTEGER,
  UNIQUE (provider, username)
);

CREATE TABLE IF NOT EXISTS urls (
  code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'generated-path',
  original_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES login_identities(id),
  paid_through_at INTEGER,
  deactivated_at INTEGER,
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

CREATE TABLE IF NOT EXISTS api_keys (
  identity_id INTEGER PRIMARY KEY REFERENCES login_identities(id),
  key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS token_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id INTEGER NOT NULL REFERENCES login_identities(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  code TEXT,
  kind TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_transactions_identity ON token_transactions(identity_id);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- Audit history: one "<table>_history" per tracked table above, holding a
-- copy of each row's content immediately before it was updated or deleted.
-- Populated entirely by triggers, so this happens regardless of which code
-- path performs the update/delete. History tables intentionally drop the
-- original table's PRIMARY KEY, UNIQUE, and FOREIGN KEY constraints: the
-- same logical row can be updated/deleted many times over its life (each
-- producing its own history row), and a history row must never be blocked
-- by a parent row that's since been deleted itself.

CREATE TABLE IF NOT EXISTS login_identities_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  provider TEXT,
  username TEXT,
  token_balance INTEGER,
  generated_path_billed_through_at INTEGER,
  low_balance_email_sent_at INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS login_identities_history_update
AFTER UPDATE ON login_identities
BEGIN
  INSERT INTO login_identities_history
    (id, provider, username, token_balance, generated_path_billed_through_at, low_balance_email_sent_at)
  VALUES
    (OLD.id, OLD.provider, OLD.username, OLD.token_balance, OLD.generated_path_billed_through_at, OLD.low_balance_email_sent_at);
END;

CREATE TRIGGER IF NOT EXISTS login_identities_history_delete
AFTER DELETE ON login_identities
BEGIN
  INSERT INTO login_identities_history
    (id, provider, username, token_balance, generated_path_billed_through_at, low_balance_email_sent_at)
  VALUES
    (OLD.id, OLD.provider, OLD.username, OLD.token_balance, OLD.generated_path_billed_through_at, OLD.low_balance_email_sent_at);
END;

CREATE TABLE IF NOT EXISTS urls_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  kind TEXT,
  original_url TEXT,
  created_at INTEGER,
  created_by INTEGER,
  paid_through_at INTEGER,
  deactivated_at INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS urls_history_update
AFTER UPDATE ON urls
BEGIN
  INSERT INTO urls_history (code, kind, original_url, created_at, created_by, paid_through_at, deactivated_at)
  VALUES (OLD.code, OLD.kind, OLD.original_url, OLD.created_at, OLD.created_by, OLD.paid_through_at, OLD.deactivated_at);
END;

CREATE TRIGGER IF NOT EXISTS urls_history_delete
AFTER DELETE ON urls
BEGIN
  INSERT INTO urls_history (code, kind, original_url, created_at, created_by, paid_through_at, deactivated_at)
  VALUES (OLD.code, OLD.kind, OLD.original_url, OLD.created_at, OLD.created_by, OLD.paid_through_at, OLD.deactivated_at);
END;

CREATE TABLE IF NOT EXISTS login_events_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  identity_id INTEGER,
  logged_in_at INTEGER,
  ip_address TEXT,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS login_events_history_update
AFTER UPDATE ON login_events
BEGIN
  INSERT INTO login_events_history (id, identity_id, logged_in_at, ip_address)
  VALUES (OLD.id, OLD.identity_id, OLD.logged_in_at, OLD.ip_address);
END;

CREATE TRIGGER IF NOT EXISTS login_events_history_delete
AFTER DELETE ON login_events
BEGIN
  INSERT INTO login_events_history (id, identity_id, logged_in_at, ip_address)
  VALUES (OLD.id, OLD.identity_id, OLD.logged_in_at, OLD.ip_address);
END;

CREATE TABLE IF NOT EXISTS redirect_events_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  code TEXT,
  kind TEXT,
  requested_at INTEGER,
  ip_address TEXT,
  country TEXT,
  user_agent TEXT,
  referer TEXT,
  headers TEXT,
  cf_data TEXT,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS redirect_events_history_update
AFTER UPDATE ON redirect_events
BEGIN
  INSERT INTO redirect_events_history
    (id, code, kind, requested_at, ip_address, country, user_agent, referer, headers, cf_data)
  VALUES
    (OLD.id, OLD.code, OLD.kind, OLD.requested_at, OLD.ip_address, OLD.country, OLD.user_agent, OLD.referer, OLD.headers, OLD.cf_data);
END;

CREATE TRIGGER IF NOT EXISTS redirect_events_history_delete
AFTER DELETE ON redirect_events
BEGIN
  INSERT INTO redirect_events_history
    (id, code, kind, requested_at, ip_address, country, user_agent, referer, headers, cf_data)
  VALUES
    (OLD.id, OLD.code, OLD.kind, OLD.requested_at, OLD.ip_address, OLD.country, OLD.user_agent, OLD.referer, OLD.headers, OLD.cf_data);
END;

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
