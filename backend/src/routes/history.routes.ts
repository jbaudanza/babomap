import { Router } from "express";
import { db } from "../db.js";

export const historyRoutes = Router();

const MAX_ROWS = 5000;
const DEFAULT_WINDOW_MS = 24 * 60 * 60_000;

const stmt = db.prepare(
  `SELECT l.recorded_at, l.received_at, l.lat, l.lon, l.accuracy, l.altitude, l.speed, l.heading, l.battery, l.source
   FROM locations l JOIN users u ON u.id = l.user_id
   WHERE u.name = ? AND l.recorded_at >= ? AND l.recorded_at < ?
   ORDER BY l.recorded_at ASC
   LIMIT ?`,
);

function intParam(v: unknown, fallback: number): number | null {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

// GET /api/history?user=<name>&from=<ms>&to=<ms>  (defaults: self, last 24 h)
// Both users are trusted, so either may read either history.
historyRoutes.get("/", (req, res) => {
  const now = Date.now();
  const user = typeof req.query.user === "string" ? req.query.user : req.user!.name;
  const to = intParam(req.query.to, now);
  const from = intParam(req.query.from, (to ?? now) - DEFAULT_WINDOW_MS);
  if (from === null || to === null || from > to) {
    res.status(400).json({ error: "from/to must be integer ms with from <= to" });
    return;
  }
  const points = stmt.all(user, from, to, MAX_ROWS);
  res.json({ user, from, to, points, truncated: points.length === MAX_ROWS });
});
