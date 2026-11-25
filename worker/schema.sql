CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY, v TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, text TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','working','done','failed')),
  lease_until TEXT, reply TEXT, replied_at TEXT
);
CREATE INDEX IF NOT EXISTS requests_queue ON requests(status, created_at);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, request_id TEXT REFERENCES requests(id), name TEXT,
  mime TEXT, size INTEGER, created_at TEXT
);
CREATE INDEX IF NOT EXISTS files_request ON files(request_id);
CREATE TABLE IF NOT EXISTS heartbeat (id INTEGER PRIMARY KEY CHECK(id=1), at TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT, at TEXT);
CREATE INDEX IF NOT EXISTS login_attempts_ip_at ON login_attempts(ip, at);
