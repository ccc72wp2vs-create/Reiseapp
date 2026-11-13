-- Google Maps Platform: only the Google Place ID is stored (allowed to be kept
-- indefinitely). Names, ratings, opening hours, photos etc. are always loaded
-- live via the Places UI Kit and never written to D1. Additive only.
ALTER TABLE saved_places ADD COLUMN google_place_id TEXT;
ALTER TABLE activities ADD COLUMN google_place_id TEXT;

-- Monthly request counter per Google SKU for the internal cost limits.
CREATE TABLE google_usage (
  month  TEXT NOT NULL,
  sku    TEXT NOT NULL,
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month, sku)
);
