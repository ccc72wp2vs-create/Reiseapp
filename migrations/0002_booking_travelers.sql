-- Which travelers a booking applies to (optional). Used to attribute booking
-- costs (e.g. planned amounts) to persons and to prefill wallet transfers.
CREATE TABLE booking_travelers (
  booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  traveler_id  TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  PRIMARY KEY (booking_id, traveler_id)
);
CREATE INDEX idx_booking_travelers_traveler ON booking_travelers(traveler_id);
