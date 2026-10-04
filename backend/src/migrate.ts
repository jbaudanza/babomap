import type Database from "better-sqlite3";

// Append-only. Never edit an entry that has shipped; add a new one.
// Timestamps are integer milliseconds since the epoch.
const migrations: string[] = [
  // 1: initial schema
  `
  CREATE TABLE users (
    id                 INTEGER PRIMARY KEY,
    name               TEXT NOT NULL UNIQUE,
    sharing_enabled    INTEGER NOT NULL DEFAULT 1,
    sharing_changed_at INTEGER
  );

  -- Append-only log. rowid alias => inserts land at the end of the b-tree.
  CREATE TABLE locations (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    recorded_at  INTEGER NOT NULL,
    received_at  INTEGER NOT NULL,
    lat          REAL NOT NULL,
    lon          REAL NOT NULL,
    accuracy     REAL,
    altitude     REAL,
    speed        REAL,
    heading      REAL,
    battery      REAL,
    source       TEXT,
    UNIQUE (user_id, recorded_at)
  );

  -- "Latest for user" is a single b-tree seek.
  CREATE INDEX locations_user_recorded ON locations (user_id, recorded_at DESC);

  CREATE TABLE sharing_log (
    id       INTEGER PRIMARY KEY,
    user_id  INTEGER NOT NULL REFERENCES users(id),
    enabled  INTEGER NOT NULL,
    at       INTEGER NOT NULL
  );
  `,
];

export function migrate(db: Database.Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  const applied = new Set(
    db
      .prepare("SELECT id FROM migrations")
      .all()
      .map((r) => (r as { id: number }).id),
  );
  const run = db.transaction((id: number, sql: string) => {
    db.exec(sql);
    db.prepare("INSERT INTO migrations (id) VALUES (?)").run(id);
  });
  migrations.forEach((sql, i) => {
    const id = i + 1;
    if (!applied.has(id)) {
      run(id, sql);
      console.log(`applied migration ${id}`);
    }
  });
}
