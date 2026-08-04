-- Adds a role column to login_identities, distinguishing regular users from
-- administrators. New signups always land in the "user" role via the column
-- default; existing accounts (at the time this migration runs) are promoted
-- to "admin" instead, since there was no user/admin distinction before this.

ALTER TABLE login_identities ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE login_identities_history ADD COLUMN role TEXT;

-- Recreated before the bulk UPDATE below so that it also logs through the
-- trigger that actually knows about the new column.
DROP TRIGGER IF EXISTS login_identities_history_update;
CREATE TRIGGER login_identities_history_update
AFTER UPDATE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email, role)
  VALUES (OLD.id, OLD.email, OLD.role);
END;

DROP TRIGGER IF EXISTS login_identities_history_delete;
CREATE TRIGGER login_identities_history_delete
AFTER DELETE ON login_identities
BEGIN
  INSERT INTO login_identities_history (id, email, role)
  VALUES (OLD.id, OLD.email, OLD.role);
END;

UPDATE login_identities SET role = 'admin';
