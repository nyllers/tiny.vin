-- Adds separate latitude/longitude columns to redirect_events, backfilled from
-- the existing cf_data JSON blob (Cloudflare's request.cf object already carries
-- these as strings under $.latitude / $.longitude). New rows are populated
-- directly by the Worker going forward; this backfill only covers history.

ALTER TABLE redirect_events ADD COLUMN latitude REAL;
ALTER TABLE redirect_events ADD COLUMN longitude REAL;

ALTER TABLE redirect_events_history ADD COLUMN latitude REAL;
ALTER TABLE redirect_events_history ADD COLUMN longitude REAL;

-- Recreated before the backfill below so that bulk UPDATE also logs
-- through the trigger that actually knows about the new columns.
DROP TRIGGER IF EXISTS redirect_events_history_update;
CREATE TRIGGER redirect_events_history_update
AFTER UPDATE ON redirect_events
BEGIN
  INSERT INTO redirect_events_history
    (id, code, kind, requested_at, ip_address, country, user_agent, referer, headers, cf_data, latitude, longitude)
  VALUES
    (OLD.id, OLD.code, OLD.kind, OLD.requested_at, OLD.ip_address, OLD.country, OLD.user_agent, OLD.referer, OLD.headers, OLD.cf_data, OLD.latitude, OLD.longitude);
END;

DROP TRIGGER IF EXISTS redirect_events_history_delete;
CREATE TRIGGER redirect_events_history_delete
AFTER DELETE ON redirect_events
BEGIN
  INSERT INTO redirect_events_history
    (id, code, kind, requested_at, ip_address, country, user_agent, referer, headers, cf_data, latitude, longitude)
  VALUES
    (OLD.id, OLD.code, OLD.kind, OLD.requested_at, OLD.ip_address, OLD.country, OLD.user_agent, OLD.referer, OLD.headers, OLD.cf_data, OLD.latitude, OLD.longitude);
END;

UPDATE redirect_events
SET latitude = CAST(json_extract(cf_data, '$.latitude') AS REAL),
    longitude = CAST(json_extract(cf_data, '$.longitude') AS REAL)
WHERE cf_data IS NOT NULL;
