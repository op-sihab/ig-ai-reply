-- Schema for the Worker + D1 version of the Instagram auto-reply bot.
-- Apply with:  npx wrangler d1 execute ig-autoreply --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS messages (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  thread  TEXT NOT NULL,          -- Instagram-scoped id (IGSID) of the other person
  role    TEXT NOT NULL,          -- 'user' | 'assistant'
  text    TEXT NOT NULL,
  mid     TEXT,
  created INTEGER NOT NULL        -- unix seconds
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread, id);

-- Every inbound webhook id already handled (Meta re-delivers events).
CREATE TABLE IF NOT EXISTS seen (
  mid     TEXT PRIMARY KEY,
  created INTEGER NOT NULL
);

-- Threads the bot deliberately left for the operator.
CREATE TABLE IF NOT EXISTS handoff (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  thread  TEXT NOT NULL,
  text    TEXT NOT NULL,
  reason  TEXT,
  created INTEGER NOT NULL,
  done    INTEGER NOT NULL DEFAULT 0
);

-- Who is behind a thread (Instagram sets user consent as soon as they message us).
CREATE TABLE IF NOT EXISTS people (
  thread   TEXT PRIMARY KEY,
  username TEXT,
  name     TEXT,
  pic      TEXT,
  fetched  INTEGER NOT NULL
);

-- Runtime settings: the refreshed access token lives here.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
