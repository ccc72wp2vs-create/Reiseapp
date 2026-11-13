-- Online check-in reminders for flights (additive only).
ALTER TABLE bookings ADD COLUMN flight_number TEXT;
ALTER TABLE bookings ADD COLUMN checkin_done_at TEXT;
