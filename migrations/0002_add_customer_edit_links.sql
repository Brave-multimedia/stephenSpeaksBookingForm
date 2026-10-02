ALTER TABLE booking_inquiries ADD COLUMN edit_token_hash TEXT;
ALTER TABLE booking_inquiries ADD COLUMN edit_token_expires_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS booking_inquiries_edit_token_hash_idx
  ON booking_inquiries (edit_token_hash);
