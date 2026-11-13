-- Uploaded receipts / booking confirmations (stored in D1, max ~1.9 MB).
-- Links to bookings / expenses are optional and only point FROM the document:
-- deleting a document never deletes a booking or expense, and deleting a
-- booking or expense keeps the document (link set to NULL).
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL CHECK (size > 0),
  data        BLOB NOT NULL,
  booking_id  TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  expense_id  TEXT REFERENCES expenses(id) ON DELETE SET NULL,
  -- Recognised fields (JSON), status of the recognition
  extracted   TEXT,
  status      TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'analyzed', 'failed')),
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_documents_trip ON documents(trip_id);
CREATE INDEX idx_documents_booking ON documents(booking_id);
CREATE INDEX idx_documents_expense ON documents(expense_id);
