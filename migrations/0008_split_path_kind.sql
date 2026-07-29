-- Split urls.kind's 'path' value into 'generated-path' (an auto-generated
-- random code) and 'custom-path' (a user-chosen pathname) -- the two are
-- meaningfully different (e.g. for future pricing/quota purposes) and the
-- schema previously had no way to tell them apart. Existing 'path' rows
-- become 'generated-path' -- a safe default; reclassifying specific rows to
-- 'custom-path' is a manual, one-off data-entry task, not something this
-- migration guesses.

UPDATE urls SET kind = 'generated-path' WHERE kind = 'path';
