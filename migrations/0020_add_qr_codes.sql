-- Adds qr_codes: the QR codes a signed-in account has made on the QR Codes
-- page without creating a short link (see handleCreateQrCode in
-- src/index.js). One row per (account, URL) - adding the same URL again
-- refreshes the row instead of duplicating it. `url` is the absolute http(s)
-- URL the QR code encodes, and `title` the page title looked up when it was
-- added (shown as the card's heading).
--
-- Additive only: a new table plus its audit-history table and triggers, so
-- nothing existing is touched and it's safe to apply ahead of the code that
-- uses it.

CREATE TABLE qr_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by INTEGER NOT NULL REFERENCES login_identities(id),
  UNIQUE (created_by, url)
);

CREATE TABLE qr_codes_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER,
  url TEXT,
  title TEXT,
  created_at INTEGER,
  created_by INTEGER,
  history_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER qr_codes_history_update
AFTER UPDATE ON qr_codes
BEGIN
  INSERT INTO qr_codes_history (id, url, title, created_at, created_by)
  VALUES (OLD.id, OLD.url, OLD.title, OLD.created_at, OLD.created_by);
END;

CREATE TRIGGER qr_codes_history_delete
AFTER DELETE ON qr_codes
BEGIN
  INSERT INTO qr_codes_history (id, url, title, created_at, created_by)
  VALUES (OLD.id, OLD.url, OLD.title, OLD.created_at, OLD.created_by);
END;
