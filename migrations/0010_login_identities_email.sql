-- Remove login_identities.provider and rename username to email. This
-- project has only ever supported Google sign-in, so every row's provider
-- was always "google" -- the column never carried real information.
--
-- SQLite can't drop a column that's part of a UNIQUE constraint or
-- referenced by a trigger, so this rebuilds the table (and its history
-- table) rather than using ALTER TABLE ... DROP COLUMN. Existing `id`
-- values are preserved so foreign keys in urls/login_events/api_keys
-- keep pointing at the right row. Foreign key checks are deferred to the
-- end of the transaction (D1 runs migration files as one transaction,
-- where plain `PRAGMA foreign_keys=OFF` is a documented no-op -- use
-- `defer_foreign_keys` instead) since urls/login_events/api_keys
-- reference login_identities.id and would otherwise block dropping it,
-- even for the moment before it's recreated with the same ids. The
-- closing `PRAGMA defer_foreign_keys = off` is required -- without it
-- D1 still reports a FOREIGN KEY constraint failure at the end even
-- though the data is consistent by then.

PRAGMA defer_foreign_keys = on;

DROP TRIGGER IF EXISTS login_identities_history_update;
DROP TRIGGER IF EXISTS login_identities_history_delete;

CREATE TABLE login_identities_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE
);

INSERT INTO login_identities_new (id, email)
SELECT id, username FROM login_identities;

DROP TABLE login_identities;
ALTER TABLE login_identities_new RENAME TO login_identities;

CREATE TABLE login_identities_history_new (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  email TEXT,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO login_identities_history_new (history_id, id, email, history_created)
SELECT history_id, id, username, history_created FROM login_identities_history;

DROP TABLE login_identities_history;
ALTER TABLE login_identities_history_new RENAME TO login_identities_history;

CREATE TRIGGER login_identities_history_update
AFTER UPDATE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email)
  VALUES (OLD.id, OLD.email);
END;

CREATE TRIGGER login_identities_history_delete
AFTER DELETE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email)
  VALUES (OLD.id, OLD.email);
END;

PRAGMA defer_foreign_keys = off;
