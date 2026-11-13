-- Deposits (Kautionen): money that is only parked, e.g. for a rental car.
-- They never count as costs while open. When (part of) a deposit is kept,
-- that part becomes a regular expense (expense_id) shared by the travelers
-- the deposit was for.
CREATE TABLE deposits (
  id                  TEXT PRIMARY KEY,
  trip_id             TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  amount_minor        INTEGER NOT NULL CHECK (amount_minor > 0),
  currency            TEXT NOT NULL,
  fx_rate             TEXT NOT NULL,
  fx_source           TEXT NOT NULL CHECK (fx_source IN ('identity', 'manual', 'cached', 'provider')),
  fx_date             TEXT,
  base_amount_minor   INTEGER NOT NULL CHECK (base_amount_minor >= 0),
  paid_by_traveler_id TEXT NOT NULL REFERENCES travelers(id),
  method              TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'card', 'transfer')),
  date                TEXT NOT NULL,
  return_date         TEXT,
  booking_id          TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'returned', 'partial', 'kept')),
  kept_minor          INTEGER CHECK (kept_minor IS NULL OR kept_minor >= 0),
  expense_id          TEXT REFERENCES expenses(id) ON DELETE SET NULL,
  resolved_at         TEXT,
  notes               TEXT,
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  version             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX idx_deposits_trip ON deposits(trip_id);

CREATE TABLE deposit_travelers (
  deposit_id  TEXT NOT NULL REFERENCES deposits(id) ON DELETE CASCADE,
  traveler_id TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  PRIMARY KEY (deposit_id, traveler_id)
);
