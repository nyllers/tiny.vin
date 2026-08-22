-- Moves the per-account minimum custom-path/subdomain length (previously
-- the hardcoded MIN_CUSTOM_PATH_LENGTH/MIN_CUSTOM_PATH_LENGTH_ADMIN
-- constants in src/index.js) into the database, following the same
-- pattern as max_resources. New signups get 5 via the column default
-- (raised from the old regular-user constant of 4, per explicit request);
-- existing admin accounts are backfilled to 1 to preserve their current
-- effective minimum.

ALTER TABLE login_identities ADD COLUMN min_custom_path_length INTEGER NOT NULL DEFAULT 5;
ALTER TABLE login_identities_history ADD COLUMN min_custom_path_length INTEGER;

-- Recreated before the bulk UPDATE below so that it also logs through the
-- trigger that actually knows about the new column.
DROP TRIGGER IF EXISTS login_identities_history_update;
CREATE TRIGGER login_identities_history_update
AFTER UPDATE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email, role, max_resources, min_custom_path_length)
  VALUES (OLD.id, OLD.email, OLD.role, OLD.max_resources, OLD.min_custom_path_length);
END;

DROP TRIGGER IF EXISTS login_identities_history_delete;
CREATE TRIGGER login_identities_history_delete
AFTER DELETE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email, role, max_resources, min_custom_path_length)
  VALUES (OLD.id, OLD.email, OLD.role, OLD.max_resources, OLD.min_custom_path_length);
END;

UPDATE login_identities SET min_custom_path_length = 1 WHERE role = 'admin';
