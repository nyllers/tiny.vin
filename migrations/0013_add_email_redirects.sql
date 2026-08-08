-- Lets an account redirect <alias>@tiny.vin to any other e-mail address.
-- `alias` is the local part only (before the @) and is globally unique,
-- same relationship urls.code has to the domain.

CREATE TABLE IF NOT EXISTS email_redirects (
  alias TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES login_identities(id)
);

CREATE TABLE IF NOT EXISTS email_redirects_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT,
  destination TEXT,
  created_at INTEGER,
  created_by INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS email_redirects_history_update
AFTER UPDATE ON email_redirects
BEGIN
  INSERT INTO email_redirects_history (alias, destination, created_at, created_by)
  VALUES (OLD.alias, OLD.destination, OLD.created_at, OLD.created_by);
END;

CREATE TRIGGER IF NOT EXISTS email_redirects_history_delete
AFTER DELETE ON email_redirects
BEGIN
  INSERT INTO email_redirects_history (alias, destination, created_at, created_by)
  VALUES (OLD.alias, OLD.destination, OLD.created_at, OLD.created_by);
END;
