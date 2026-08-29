CREATE TABLE IF NOT EXISTS login_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  max_resources INTEGER NOT NULL DEFAULT 10,
  min_custom_path_length INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_url TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES login_identities(id),
  UNIQUE (created_by, original_url)
);

CREATE TABLE IF NOT EXISTS aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'generated-path',
  destination_id INTEGER NOT NULL REFERENCES destinations(id),
  cloudflare_rule_id TEXT,
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES login_identities(id),
  UNIQUE (code, kind)
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
  alias_id INTEGER NOT NULL REFERENCES aliases(id) ON DELETE CASCADE,
  requested_at INTEGER NOT NULL,
  ip_address TEXT,
  country TEXT,
  user_agent TEXT,
  referer TEXT,
  headers TEXT NOT NULL,
  cf_data TEXT,
  latitude REAL,
  longitude REAL
);

CREATE INDEX IF NOT EXISTS idx_redirect_events_alias ON redirect_events(alias_id);

CREATE TABLE IF NOT EXISTS api_keys (
  identity_id INTEGER PRIMARY KEY REFERENCES login_identities(id),
  key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_redirect_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_id INTEGER NOT NULL REFERENCES aliases(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  from_address TEXT,
  subject TEXT,
  message_id TEXT,
  size INTEGER,
  forwarded INTEGER NOT NULL,
  reject_reason TEXT,
  headers TEXT NOT NULL,
  requested_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_redirect_events_alias ON email_redirect_events(alias_id);

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
  email TEXT,
  role TEXT,
  max_resources INTEGER,
  min_custom_path_length INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS login_identities_history_update
AFTER UPDATE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email, role, max_resources, min_custom_path_length)
  VALUES (OLD.id, OLD.email, OLD.role, OLD.max_resources, OLD.min_custom_path_length);
END;

CREATE TRIGGER IF NOT EXISTS login_identities_history_delete
AFTER DELETE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email, role, max_resources, min_custom_path_length)
  VALUES (OLD.id, OLD.email, OLD.role, OLD.max_resources, OLD.min_custom_path_length);
END;

CREATE TABLE IF NOT EXISTS aliases_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  code TEXT,
  kind TEXT,
  destination_id INTEGER,
  cloudflare_rule_id TEXT,
  created_at INTEGER,
  created_by INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS aliases_history_update
AFTER UPDATE ON aliases
BEGIN
  INSERT INTO aliases_history (id, code, kind, destination_id, cloudflare_rule_id, created_at, created_by)
  VALUES (OLD.id, OLD.code, OLD.kind, OLD.destination_id, OLD.cloudflare_rule_id, OLD.created_at, OLD.created_by);
END;

CREATE TRIGGER IF NOT EXISTS aliases_history_delete
AFTER DELETE ON aliases
BEGIN
  INSERT INTO aliases_history (id, code, kind, destination_id, cloudflare_rule_id, created_at, created_by)
  VALUES (OLD.id, OLD.code, OLD.kind, OLD.destination_id, OLD.cloudflare_rule_id, OLD.created_at, OLD.created_by);
END;

CREATE TABLE IF NOT EXISTS destinations_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  original_url TEXT,
  title TEXT,
  created_at INTEGER,
  created_by INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS destinations_history_update
AFTER UPDATE ON destinations
BEGIN
  INSERT INTO destinations_history (id, original_url, title, created_at, created_by)
  VALUES (OLD.id, OLD.original_url, OLD.title, OLD.created_at, OLD.created_by);
END;

CREATE TRIGGER IF NOT EXISTS destinations_history_delete
AFTER DELETE ON destinations
BEGIN
  INSERT INTO destinations_history (id, original_url, title, created_at, created_by)
  VALUES (OLD.id, OLD.original_url, OLD.title, OLD.created_at, OLD.created_by);
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
  alias_id INTEGER,
  requested_at INTEGER,
  ip_address TEXT,
  country TEXT,
  user_agent TEXT,
  referer TEXT,
  headers TEXT,
  cf_data TEXT,
  latitude REAL,
  longitude REAL,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS redirect_events_history_update
AFTER UPDATE ON redirect_events
BEGIN
  INSERT INTO redirect_events_history
    (id, alias_id, requested_at, ip_address, country, user_agent, referer, headers, cf_data, latitude, longitude)
  VALUES
    (OLD.id, OLD.alias_id, OLD.requested_at, OLD.ip_address, OLD.country, OLD.user_agent, OLD.referer, OLD.headers, OLD.cf_data, OLD.latitude, OLD.longitude);
END;

CREATE TRIGGER IF NOT EXISTS redirect_events_history_delete
AFTER DELETE ON redirect_events
BEGIN
  INSERT INTO redirect_events_history
    (id, alias_id, requested_at, ip_address, country, user_agent, referer, headers, cf_data, latitude, longitude)
  VALUES
    (OLD.id, OLD.alias_id, OLD.requested_at, OLD.ip_address, OLD.country, OLD.user_agent, OLD.referer, OLD.headers, OLD.cf_data, OLD.latitude, OLD.longitude);
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

CREATE TABLE IF NOT EXISTS email_redirect_events_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  alias_id INTEGER,
  destination TEXT,
  from_address TEXT,
  subject TEXT,
  message_id TEXT,
  size INTEGER,
  forwarded INTEGER,
  reject_reason TEXT,
  headers TEXT,
  requested_at INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS email_redirect_events_history_update
AFTER UPDATE ON email_redirect_events
BEGIN
  INSERT INTO email_redirect_events_history
    (id, alias_id, destination, from_address, subject, message_id, size, forwarded, reject_reason, headers, requested_at)
  VALUES
    (OLD.id, OLD.alias_id, OLD.destination, OLD.from_address, OLD.subject, OLD.message_id, OLD.size, OLD.forwarded, OLD.reject_reason, OLD.headers, OLD.requested_at);
END;

CREATE TRIGGER IF NOT EXISTS email_redirect_events_history_delete
AFTER DELETE ON email_redirect_events
BEGIN
  INSERT INTO email_redirect_events_history
    (id, alias_id, destination, from_address, subject, message_id, size, forwarded, reject_reason, headers, requested_at)
  VALUES
    (OLD.id, OLD.alias_id, OLD.destination, OLD.from_address, OLD.subject, OLD.message_id, OLD.size, OLD.forwarded, OLD.reject_reason, OLD.headers, OLD.requested_at);
END;
