-- Adds destinations.title: the target webpage's <title>, fetched once when
-- its destination row is first created (see fetchPageTitle in src/index.js).
-- Only ever populated for URL destinations -- an e-mail destination has no
-- webpage to fetch a title from, so it stays NULL for those rows, same as
-- for any URL destination that predates this column or whose fetch failed.

ALTER TABLE destinations ADD COLUMN title TEXT;
ALTER TABLE destinations_history ADD COLUMN title TEXT;

DROP TRIGGER destinations_history_update;
DROP TRIGGER destinations_history_delete;

CREATE TRIGGER destinations_history_update
AFTER UPDATE ON destinations
BEGIN
  INSERT INTO destinations_history (id, original_url, title, created_at, created_by)
  VALUES (OLD.id, OLD.original_url, OLD.title, OLD.created_at, OLD.created_by);
END;

CREATE TRIGGER destinations_history_delete
AFTER DELETE ON destinations
BEGIN
  INSERT INTO destinations_history (id, original_url, title, created_at, created_by)
  VALUES (OLD.id, OLD.original_url, OLD.title, OLD.created_at, OLD.created_by);
END;
