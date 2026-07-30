-- Token economy: every account has a token balance, spent on creating and
-- keeping tiny URLs/subdomains alive.
--
-- 1. Add login_identities.token_balance, defaulting new accounts to 0 (the
--    100-token signup bonus is granted in application code at identity
--    creation, not by this column default, so it stays a normal, loggable
--    transaction like any other). Existing accounts are granted 100 tokens
--    retroactively below, as a one-time migration decision.
-- 2. Add login_identities.generated_path_billed_through_at: the epoch-ms
--    cursor generated-path pool upkeep (see below) is billed through for
--    this account. Existing accounts get one month's grace from today;
--    new accounts get the same grace starting at signup (set in
--    application code alongside the signup bonus).
-- 3. Add urls.paid_through_at: the epoch-ms timestamp a custom-path or
--    subdomain row's individual upkeep is paid through. NULL means "never
--    individually billed" — every row that exists before this migration
--    gets NULL (grandfathered, free forever), and generated-path rows
--    always get NULL too, since generated-path upkeep is billed as a pool
--    per account (see below), not per row. Every new custom-path/subdomain
--    row created after this migration always gets a concrete value.
-- 4. Pricing:
--    - custom-path: 25 tokens to create, 10 tokens/month upkeep per row,
--      first month included in the creation cost (paid_through_at starts
--      one month out).
--    - subdomain: 50 tokens to create, 20 tokens/month upkeep per row,
--      same first-month-included rule.
--    - generated-path: the first 5 an account holds (at any given moment)
--      are entirely free — 0 to create, 0 upkeep. The 6th and beyond cost
--      10 tokens to create, and the account's upkeep is
--      max(0, current generated-path count - 5) tokens/month, recomputed
--      fresh every billing cycle from the CURRENT count (not tracked per
--      row) — so deleting excess generated-path URLs immediately lowers
--      next month's bill, matching how the count, not any specific row,
--      determines the price.
-- 5. Add token_transactions: an append-only ledger of every balance change
--    (signup bonus, creation cost, monthly upkeep, forced deletion). This
--    table intentionally has NO "_history" twin, unlike every other table
--    in this schema — it's never updated or deleted, so it already IS the
--    history; a twin would just be an always-empty copy of itself.
-- 6. urls_history and login_identities_history gain matching columns, and
--    their triggers are dropped and recreated to capture them — "CREATE
--    TRIGGER IF NOT EXISTS" would otherwise silently leave the old
--    (narrower) trigger bodies in place on an existing database.

ALTER TABLE login_identities ADD COLUMN token_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE login_identities ADD COLUMN generated_path_billed_through_at INTEGER;
ALTER TABLE login_identities_history ADD COLUMN token_balance INTEGER;
ALTER TABLE login_identities_history ADD COLUMN generated_path_billed_through_at INTEGER;

ALTER TABLE urls ADD COLUMN paid_through_at INTEGER;
ALTER TABLE urls_history ADD COLUMN paid_through_at INTEGER;

UPDATE login_identities SET token_balance = 100, generated_path_billed_through_at = unixepoch() * 1000 + 2592000000;

DROP TRIGGER IF EXISTS login_identities_history_update;
CREATE TRIGGER login_identities_history_update
AFTER UPDATE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, provider, username, token_balance, generated_path_billed_through_at)
  VALUES (OLD.id, OLD.provider, OLD.username, OLD.token_balance, OLD.generated_path_billed_through_at);
END;

DROP TRIGGER IF EXISTS login_identities_history_delete;
CREATE TRIGGER login_identities_history_delete
AFTER DELETE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, provider, username, token_balance, generated_path_billed_through_at)
  VALUES (OLD.id, OLD.provider, OLD.username, OLD.token_balance, OLD.generated_path_billed_through_at);
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
