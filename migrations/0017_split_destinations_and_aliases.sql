-- Consolidates urls + email_redirects into destinations + aliases.
-- destinations holds the target (URL or e-mail address) once per
-- (owner, target) pair; aliases holds every redirect (path/subdomain/
-- generated code/e-mail alias) with a real id PK and a destination_id
-- pointing at its target, plus a cloudflare_rule_id column only 'email'
-- kind rows populate.
--
-- Ordering is deliberate and load-bearing: redirect_events and
-- email_redirect_events are repointed at the new aliases table BEFORE
-- urls/email_redirects are touched. Both old tables are currently FK
-- parents (ON DELETE CASCADE), and D1 enforces foreign keys by default --
-- DROP TABLE on a live FK parent performs an implicit delete of its rows
-- first, which would cascade-delete every row in their child tables.
-- Neither PRAGMA foreign_keys=OFF (a documented no-op inside D1's single-
-- transaction migration execution, see migrations/0010's header) nor
-- PRAGMA defer_foreign_keys (only delays constraint *violations*, doesn't
-- suppress CASCADE *actions*) prevents this. By the time urls/
-- email_redirects are dropped below, nothing references them, so those
-- drops are inert. redirect_events/email_redirect_events are themselves
-- leaf tables (nothing has an FK into them), so rebuilding them is safe
-- regardless of ordering. Verified end-to-end against a disposable local
-- mimic of this exact schema before running for real.

-- ============================================================
-- destinations: the target (URL or e-mail address), once per (owner, target)
-- ============================================================
CREATE TABLE destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES login_identities(id),
  UNIQUE (created_by, original_url)
);

-- OR IGNORE guards the rare case where a user's URL and e-mail-redirect
-- destination happen to be identical text -- both backfills would then
-- target the same (created_by, original_url) pair; the second insert
-- should just no-op rather than aborting the whole migration.
INSERT OR IGNORE INTO destinations (original_url, created_at, created_by)
SELECT original_url, MIN(created_at), created_by
FROM urls
GROUP BY created_by, original_url;

INSERT OR IGNORE INTO destinations (original_url, created_at, created_by)
SELECT destination, MIN(created_at), created_by
FROM email_redirects
GROUP BY created_by, destination;

-- ============================================================
-- aliases: replaces urls AND email_redirects -- real id PK,
-- destination_id instead of a raw target column, UNIQUE(code, kind)
-- preserves both tables' old collision semantics (a code and an e-mail
-- alias can never collide with each other anyway -- they're always
-- different kind values -- so merging them under one UNIQUE(code, kind)
-- changes nothing about what was previously enforced).
-- ============================================================
CREATE TABLE aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'generated-path',
  destination_id INTEGER NOT NULL REFERENCES destinations(id),
  cloudflare_rule_id TEXT,
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES login_identities(id),
  UNIQUE (code, kind)
);

INSERT INTO aliases (code, kind, destination_id, created_at, created_by)
SELECT u.code, u.kind, d.id, u.created_at, u.created_by
FROM urls u
JOIN destinations d ON d.original_url = u.original_url AND d.created_by IS u.created_by;

INSERT INTO aliases (code, kind, destination_id, cloudflare_rule_id, created_at, created_by)
SELECT er.alias, 'email', d.id, er.cloudflare_rule_id, er.created_at, er.created_by
FROM email_redirects er
JOIN destinations d ON d.original_url = er.destination AND d.created_by IS er.created_by;

-- ============================================================
-- Repoint redirect_events at aliases BEFORE urls is touched
-- ============================================================
ALTER TABLE redirect_events ADD COLUMN alias_id INTEGER REFERENCES aliases(id);

UPDATE redirect_events
SET alias_id = (
  SELECT a.id FROM aliases a
  WHERE a.code = redirect_events.code AND a.kind = redirect_events.kind
);

DROP TRIGGER redirect_events_history_update;
DROP TRIGGER redirect_events_history_delete;

CREATE TABLE redirect_events_new (
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

INSERT INTO redirect_events_new
  (id, alias_id, requested_at, ip_address, country, user_agent, referer, headers, cf_data, latitude, longitude)
SELECT
  id, alias_id, requested_at, ip_address, country, user_agent, referer, headers, cf_data, latitude, longitude
FROM redirect_events;

-- Safe: redirect_events is a leaf (nothing has an FK into it), and its own
-- history triggers were already dropped above.
DROP TABLE redirect_events;
ALTER TABLE redirect_events_new RENAME TO redirect_events;

CREATE INDEX idx_redirect_events_alias ON redirect_events(alias_id);

-- History keeps its legacy shape (old code/kind rows untouched forever);
-- new rows going forward get alias_id instead.
ALTER TABLE redirect_events_history ADD COLUMN alias_id INTEGER;

CREATE TRIGGER redirect_events_history_update
AFTER UPDATE ON redirect_events
BEGIN
  INSERT INTO redirect_events_history
    (id, alias_id, requested_at, ip_address, country, user_agent, referer, headers, cf_data, latitude, longitude)
  VALUES
    (OLD.id, OLD.alias_id, OLD.requested_at, OLD.ip_address, OLD.country, OLD.user_agent, OLD.referer, OLD.headers, OLD.cf_data, OLD.latitude, OLD.longitude);
END;

CREATE TRIGGER redirect_events_history_delete
AFTER DELETE ON redirect_events
BEGIN
  INSERT INTO redirect_events_history
    (id, alias_id, requested_at, ip_address, country, user_agent, referer, headers, cf_data, latitude, longitude)
  VALUES
    (OLD.id, OLD.alias_id, OLD.requested_at, OLD.ip_address, OLD.country, OLD.user_agent, OLD.referer, OLD.headers, OLD.cf_data, OLD.latitude, OLD.longitude);
END;

-- ============================================================
-- Repoint email_redirect_events at aliases BEFORE email_redirects is
-- touched -- mirrors redirect_events exactly. `destination` stays as its
-- own plain column (a per-event historical record, not a relationship).
-- ============================================================
ALTER TABLE email_redirect_events ADD COLUMN alias_id INTEGER REFERENCES aliases(id);

UPDATE email_redirect_events
SET alias_id = (
  SELECT a.id FROM aliases a
  WHERE a.code = email_redirect_events.alias AND a.kind = 'email'
);

DROP TRIGGER email_redirect_events_history_update;
DROP TRIGGER email_redirect_events_history_delete;

CREATE TABLE email_redirect_events_new (
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

INSERT INTO email_redirect_events_new
  (id, alias_id, destination, from_address, subject, message_id, size, forwarded, reject_reason, headers, requested_at)
SELECT
  id, alias_id, destination, from_address, subject, message_id, size, forwarded, reject_reason, headers, requested_at
FROM email_redirect_events;

DROP TABLE email_redirect_events;
ALTER TABLE email_redirect_events_new RENAME TO email_redirect_events;

CREATE INDEX idx_email_redirect_events_alias ON email_redirect_events(alias_id);

ALTER TABLE email_redirect_events_history ADD COLUMN alias_id INTEGER;

CREATE TRIGGER email_redirect_events_history_update
AFTER UPDATE ON email_redirect_events
BEGIN
  INSERT INTO email_redirect_events_history
    (id, alias_id, destination, from_address, subject, message_id, size, forwarded, reject_reason, headers, requested_at)
  VALUES
    (OLD.id, OLD.alias_id, OLD.destination, OLD.from_address, OLD.subject, OLD.message_id, OLD.size, OLD.forwarded, OLD.reject_reason, OLD.headers, OLD.requested_at);
END;

CREATE TRIGGER email_redirect_events_history_delete
AFTER DELETE ON email_redirect_events
BEGIN
  INSERT INTO email_redirect_events_history
    (id, alias_id, destination, from_address, subject, message_id, size, forwarded, reject_reason, headers, requested_at)
  VALUES
    (OLD.id, OLD.alias_id, OLD.destination, OLD.from_address, OLD.subject, OLD.message_id, OLD.size, OLD.forwarded, OLD.reject_reason, OLD.headers, OLD.requested_at);
END;

-- ============================================================
-- urls and email_redirects have no incoming FK left now -- safe to drop
-- ============================================================
DROP TRIGGER urls_history_update;
DROP TRIGGER urls_history_delete;
DROP TABLE urls;

DROP TRIGGER email_redirects_history_update;
DROP TRIGGER email_redirects_history_delete;
DROP TABLE email_redirects;

-- ============================================================
-- Unify the audit trail: rename urls_history to aliases_history (old rows
-- keep their original_url text forever, as a true snapshot of the row's
-- shape at the time), fold email_redirects_history's legacy rows into it
-- too (email_redirects and urls are now the same live table, so their
-- history belongs together), then recreate triggers on aliases.
-- ============================================================
ALTER TABLE urls_history RENAME TO aliases_history;
ALTER TABLE aliases_history ADD COLUMN id INTEGER;
ALTER TABLE aliases_history ADD COLUMN destination_id INTEGER;
ALTER TABLE aliases_history ADD COLUMN cloudflare_rule_id TEXT;

INSERT INTO aliases_history (code, kind, original_url, cloudflare_rule_id, created_at, created_by, history_created)
SELECT alias, 'email', destination, cloudflare_rule_id, created_at, created_by, history_created
FROM email_redirects_history;

DROP TABLE email_redirects_history;

CREATE TRIGGER aliases_history_update
AFTER UPDATE ON aliases
BEGIN
  INSERT INTO aliases_history (id, code, kind, destination_id, cloudflare_rule_id, created_at, created_by)
  VALUES (OLD.id, OLD.code, OLD.kind, OLD.destination_id, OLD.cloudflare_rule_id, OLD.created_at, OLD.created_by);
END;

CREATE TRIGGER aliases_history_delete
AFTER DELETE ON aliases
BEGIN
  INSERT INTO aliases_history (id, code, kind, destination_id, cloudflare_rule_id, created_at, created_by)
  VALUES (OLD.id, OLD.code, OLD.kind, OLD.destination_id, OLD.cloudflare_rule_id, OLD.created_at, OLD.created_by);
END;

-- ============================================================
-- destinations_history: fresh, mirrors every other _history pair
-- ============================================================
CREATE TABLE destinations_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  original_url TEXT,
  created_at INTEGER,
  created_by INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER destinations_history_update
AFTER UPDATE ON destinations
BEGIN
  INSERT INTO destinations_history (id, original_url, created_at, created_by)
  VALUES (OLD.id, OLD.original_url, OLD.created_at, OLD.created_by);
END;

CREATE TRIGGER destinations_history_delete
AFTER DELETE ON destinations
BEGIN
  INSERT INTO destinations_history (id, original_url, created_at, created_by)
  VALUES (OLD.id, OLD.original_url, OLD.created_at, OLD.created_by);
END;
