-- Daily counts by kind ("view", "click") and label (page path, or which button was clicked).
CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, label));
-- Open tabs right now: a random id per tab (no cookies, nothing personal), last ping time in ms, and which page.
CREATE TABLE IF NOT EXISTS live (id TEXT PRIMARY KEY, seen INTEGER NOT NULL, path TEXT);
