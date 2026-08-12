-- Logs every inbound message that matches a known alias, mirroring
-- redirect_events for URLs: who sent it, what it was about, and whether the
-- forward actually succeeded - useful for debugging delivery issues later.

CREATE TABLE IF NOT EXISTS email_redirect_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL,
  destination TEXT NOT NULL,
  from_address TEXT,
  subject TEXT,
  message_id TEXT,
  size INTEGER,
  forwarded INTEGER NOT NULL,
  reject_reason TEXT,
  headers TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  FOREIGN KEY (alias) REFERENCES email_redirects(alias) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_redirect_events_alias ON email_redirect_events(alias);

CREATE TABLE IF NOT EXISTS email_redirect_events_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  alias TEXT,
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
    (id, alias, destination, from_address, subject, message_id, size, forwarded, reject_reason, headers, requested_at)
  VALUES
    (OLD.id, OLD.alias, OLD.destination, OLD.from_address, OLD.subject, OLD.message_id, OLD.size, OLD.forwarded, OLD.reject_reason, OLD.headers, OLD.requested_at);
END;

CREATE TRIGGER IF NOT EXISTS email_redirect_events_history_delete
AFTER DELETE ON email_redirect_events
BEGIN
  INSERT INTO email_redirect_events_history
    (id, alias, destination, from_address, subject, message_id, size, forwarded, reject_reason, headers, requested_at)
  VALUES
    (OLD.id, OLD.alias, OLD.destination, OLD.from_address, OLD.subject, OLD.message_id, OLD.size, OLD.forwarded, OLD.reject_reason, OLD.headers, OLD.requested_at);
END;
