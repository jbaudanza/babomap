import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db.js";

export type User = { id: number; name: string };

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

// USER_TOKENS="jon:<hex>,wife:<hex>". Tokens never live in the app bundle;
// each phone scans its own token once (see scripts/token.sh).
type Entry = { name: string; digest: Buffer };
let entries: Entry[] = [];

function sha256(s: string): Buffer {
  return crypto.createHash("sha256").update(s).digest();
}

/** Parse USER_TOKENS and make sure each named user exists in the DB. */
export function loadUsers(): void {
  const raw = process.env.USER_TOKENS;
  if (!raw) throw new Error("USER_TOKENS is not set");
  entries = raw.split(",").map((pair) => {
    const i = pair.indexOf(":");
    const name = pair.slice(0, i).trim();
    const token = pair.slice(i + 1).trim();
    if (i < 0 || !name || token.length < 32) {
      throw new Error(`USER_TOKENS: bad entry for "${name || pair}" (need name:token, token >= 32 chars)`);
    }
    return { name, digest: sha256(token) };
  });
  const insert = db.prepare("INSERT OR IGNORE INTO users (name) VALUES (?)");
  for (const e of entries) insert.run(e.name);
  console.log(`users: ${entries.map((e) => e.name).join(", ")}`);
}

function userForToken(token: string): User | undefined {
  const digest = sha256(token);
  let match: Entry | undefined;
  // Compare every entry (no early exit) so timing doesn't leak which matched.
  for (const e of entries) {
    if (crypto.timingSafeEqual(digest, e.digest)) match = e;
  }
  if (!match) return undefined;
  return db.prepare("SELECT id, name FROM users WHERE name = ?").get(match.name) as User | undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = token ? userForToken(token) : undefined;
  if (!user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.user = user;
  next();
}

export function requireJson(req: Request, res: Response, next: NextFunction): void {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !req.is("application/json")) {
    res.status(415).json({ error: "expected application/json" });
    return;
  }
  next();
}

// --- Rate limiting (in-memory, per IP). Two phones polling every 15 s are
// nowhere near this; it just stops scanners from hammering the box.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const buckets = new Map<string, { start: number; count: number }>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = req.ip ?? "unknown";
  const b = buckets.get(key);
  if (!b || now - b.start > WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
  } else if (++b.count > MAX_PER_WINDOW) {
    res.status(429).json({ error: "too many requests" });
    return;
  }
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now - v.start > WINDOW_MS) buckets.delete(k);
  }
  next();
}
