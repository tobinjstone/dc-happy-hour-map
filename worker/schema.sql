-- Every visitor edit is kept, so any bar can be rolled back to an earlier version.
CREATE TABLE IF NOT EXISTS edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  body TEXT NOT NULL,
  photo_key TEXT,
  ip_hash TEXT,
  restored_from INTEGER,
  restored_original INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS edits_venue ON edits (venue_id, id);
CREATE INDEX IF NOT EXISTS edits_ip ON edits (ip_hash, created_at);
