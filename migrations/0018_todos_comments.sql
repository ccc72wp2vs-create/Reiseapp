-- Group to-dos (with who is responsible) and comments on bookings, places,
-- activities and expenses. Additive only.
CREATE TABLE todos (
  id                    TEXT PRIMARY KEY,
  trip_id               TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  notes                 TEXT,
  assignee_traveler_id  TEXT REFERENCES travelers(id) ON DELETE SET NULL,
  due_date              TEXT,
  done                  INTEGER NOT NULL DEFAULT 0,
  created_by            TEXT REFERENCES users(id) ON DELETE SET NULL,
  version               INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_todos_trip ON todos(trip_id);

CREATE TABLE comments (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('booking', 'place', 'activity', 'expense')),
  entity_id    TEXT NOT NULL,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  text         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_comments_entity ON comments(trip_id, entity_type, entity_id);
