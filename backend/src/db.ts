import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "./migrate.js";

const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "babomap.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Run migrations here, not in index.ts: route modules prepare statements at
// import time, and ESM evaluates imports before the importer's own code.
migrate(db);
