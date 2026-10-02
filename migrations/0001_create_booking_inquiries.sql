PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS booking_inquiries (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'New'
    CHECK (status IN ('New', 'In Review', 'Follow-up', 'Approved', 'Declined')),
  staff_notes TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS booking_inquiries_created_at_idx
  ON booking_inquiries (created_at DESC);

CREATE TABLE IF NOT EXISTS inquiry_rate_limits (
  ip_hash TEXT NOT NULL,
  hour_bucket INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, hour_bucket)
);
