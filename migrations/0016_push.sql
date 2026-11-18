-- Web Push: subscriptions per device, a small inbox that the service worker
-- reads when a (payload-less) push arrives, and a log against duplicates.
CREATE TABLE push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  prefs       TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL,
  last_ok_at  TEXT
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE push_inbox (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id       TEXT REFERENCES trips(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  url           TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  delivered_at  TEXT
);
CREATE INDEX idx_push_inbox_user ON push_inbox(user_id, delivered_at);

CREATE TABLE push_log (
  dedupe_key  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (dedupe_key, user_id)
);
