-- Payment details for settling up (shown to the trip's members only).
ALTER TABLE travelers ADD COLUMN paypal_me TEXT;
ALTER TABLE travelers ADD COLUMN iban TEXT;

-- Optional daily spending target (base currency, minor units) and free-text
-- emergency information (insurance hotline, policy number, …).
ALTER TABLE trips ADD COLUMN daily_budget_minor INTEGER CHECK (daily_budget_minor IS NULL OR daily_budget_minor >= 0);
ALTER TABLE trips ADD COLUMN emergency_notes TEXT;

-- 👍 votes on saved places, one per traveler.
CREATE TABLE place_votes (
  place_id    TEXT NOT NULL REFERENCES saved_places(id) ON DELETE CASCADE,
  traveler_id TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (place_id, traveler_id)
);
CREATE INDEX idx_place_votes_traveler ON place_votes(traveler_id);
