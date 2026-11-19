-- "Lage vor Ort": travel-relevant news/alerts per trip and stop, fetched
-- hourly from public sources (Auswärtiges Amt, GDACS, Thai news RSS).
-- Kept for 30 days. Additive only.
CREATE TABLE news_items (
  id              TEXT PRIMARY KEY,
  trip_id         TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  destination_id  TEXT REFERENCES destinations(id) ON DELETE SET NULL,
  source          TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  kind            TEXT NOT NULL,
  severity        TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT,
  url             TEXT,
  published_at    TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  UNIQUE (trip_id, source, external_id)
);
CREATE INDEX idx_news_items_trip ON news_items(trip_id, published_at);
