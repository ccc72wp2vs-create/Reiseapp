-- "Frag TRAVIO": daily usage counter (for the configurable limit) and the
-- optional travel preferences of a user. Conversations are NOT stored.
CREATE TABLE ai_usage (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE user_preferences (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
