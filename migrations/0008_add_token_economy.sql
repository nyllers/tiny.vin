-- Token economy: every account has a token balance, spent on creating and
-- keeping tiny URLs/subdomains alive.
--
-- 1. Split urls.kind's 'path' value into 'generated-path' (an auto-generated
--    random code) and 'custom-path' (a user-chosen pathname), since the two
--    are priced differently. Existing 'path' rows become 'generated-path' —
--    a safe default; reclassifying specific rows to 'custom-path' is a
--    manual, one-off data-entry task, not something this migration guesses.
-- 2. Add urls.paid_through_at: the epoch-ms timestamp a row's upkeep is paid
--    through. NULL means "grandfathered, never billed" — every row that
--    exists before this migration gets NULL, so existing accounts keep
--    everything they already have for free. Every new row created after
--    this migration always gets a concrete value (see src/index.js).
-- 3. Add login_identities.token_balance, defaulting new accounts to 0 (the
--    100-token signup bonus is granted in application code at identity
--    creation, not by this column default, so it stays a normal, loggable
--    transaction like any other). Existing accounts are granted 100 tokens
--    retroactively below, as a one-time migration decision.
-- 4. Add token_transactions: an append-only ledger of every balance change
--    (signup bonus, creation cost, monthly upkeep, forced deletion). This
--    table intentionally has NO "_history" twin, unlike every other table
--    in this schema — it's never updated or deleted, so it already IS the
--    history; a twin would just be an always-empty copy of itself.
-- 5. urls_history and login_identities_history gain matching columns, and
--    their triggers are dropped and recreated to capture them — "CREATE
--    TRIGGER IF NOT EXISTS" would otherwise silently leave the old
--    (narrower) trigger bodies in place on an existing database.

UPDATE urls SET kind = 'generated-path' WHERE kind = 'path';

ALTER TABLE urls ADD COLUMN paid_through_at INTEGER;
ALTER TABLE urls_history ADD COLUMN paid_through_at INTEGER;

ALTER TABLE login_identities ADD COLUMN token_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE login_identities_history ADD COLUMN token_balance INTEGER;

UPDATE login_identities SET token_balance = 100;

DROP TRIGGER IF EXISTS login_identities_history_update;
CREATE TRIGGER login_identities_history_update
AFTER UPDATE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, provider, username, token_balance)
  VALUES (OLD.id, OLD.provider, OLD.username, OLD.token_balance);
END;

DROP TRIGGER IF EXISTS login_identities_history_delete;
CREATE TRIGGER login_identities_history_delete
AFTER DELETE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, provider, username, token_balance)
  VALUES (OLD.id, OLD.provider, OLD.username, OLD.token_balance);
END;

DROP TRIGGER IF EXISTS urls_history_update;
CREATE TRIGGER urls_history_update
AFTER UPDATE ON urls
BEGIN
  INSERT INTO urls_history (code, kind, original_url, created_at, created_by, paid_through_at)
  VALUES (OLD.code, OLD.kind, OLD.original_url, OLD.created_at, OLD.created_by, OLD.paid_through_at);
END;

DROP TRIGGER IF EXISTS urls_history_delete;
CREATE TRIGGER urls_history_delete
AFTER DELETE ON urls
BEGIN
  INSERT INTO urls_history (code, kind, original_url, created_at, created_by, paid_through_at)
  VALUES (OLD.code, OLD.kind, OLD.original_url, OLD.created_at, OLD.created_by, OLD.paid_through_at);
END;

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

INSERT INTO token_transactions (identity_id, amount, reason, created_at)
SELECT id, 100, 'signup_bonus_retroactive', unixepoch() * 1000
FROM login_identities;
