-- Moves the per-account resource cap (max URLs + e-mail aliases combined,
-- previously the hardcoded MAX_RESOURCES/MAX_RESOURCES_ADMIN constants in
-- src/index.js) into the database, so it can be tuned per account instead
-- of only per role. New signups get 10 via the column default, matching
-- the previous regular-user constant; existing admin accounts are
-- backfilled to 100 to preserve their current effective limit.

ALTER TABLE login_identities ADD COLUMN max_resources INTEGER NOT NULL DEFAULT 10;
ALTER TABLE login_identities_history ADD COLUMN max_resources INTEGER;

-- Recreated before the bulk UPDATE below so that it also logs through the
-- trigger that actually knows about the new column.
DROP TRIGGER IF EXISTS login_identities_history_update;
CREATE TRIGGER login_identities_history_update
AFTER UPDATE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email, role, max_resources)
  VALUES (OLD.id, OLD.email, OLD.role, OLD.max_resources);
END;

DROP TRIGGER IF EXISTS login_identities_history_delete;
CREATE TRIGGER login_identities_history_delete
AFTER DELETE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email, role, max_resources)
  VALUES (OLD.id, OLD.email, OLD.role, OLD.max_resources);
END;

UPDATE login_identities SET max_resources = 100 WHERE role = 'admin';
