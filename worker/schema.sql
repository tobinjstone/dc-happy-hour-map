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

-- Fountain Diet Coke reports (fountain/): one row each time someone says how it went.
CREATE TABLE IF NOT EXISTS fountain_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  fizz INTEGER,
  body TEXT NOT NULL,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS fountain_reports_place ON fountain_reports (place_id, id);
CREATE INDEX IF NOT EXISTS fountain_reports_recent ON fountain_reports (created_at);
CREATE INDEX IF NOT EXISTS fountain_reports_ip ON fountain_reports (ip_hash, created_at);

-- Spots visitors add that the chain data doesn't have.
CREATE TABLE IF NOT EXISTS fountain_places (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS fountain_places_ip ON fountain_places (ip_hash, created_at);
