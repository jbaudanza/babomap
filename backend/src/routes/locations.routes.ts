import { Router } from "express";
import { db } from "../db.js";

export const locationsRoutes = Router();

const MAX_POINTS = 1000;
const MAX_FUTURE_MS = 5 * 60_000;

type Incoming = {
  recorded_at: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  source: string | null;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parsePoint(raw: unknown): Incoming | string {
  if (typeof raw !== "object" || raw === null) return "point must be an object";
  const p = raw as Record<string, unknown>;
  const recorded_at = num(p.recorded_at);
  const lat = num(p.lat);
  const lon = num(p.lon);
  if (recorded_at === null || !Number.isInteger(recorded_at)) return "recorded_at must be integer ms";
  if (lat === null || lat < -90 || lat > 90) return "lat out of range";
  if (lon === null || lon < -180 || lon > 180) return "lon out of range";
  const source = p.source ?? null;
  if (source !== null && source !== "background" && source !== "foreground") {
    return "source must be background|foreground";
  }
  return {
    recorded_at,
    lat,
    lon,
    accuracy: num(p.accuracy),
    altitude: num(p.altitude),
    speed: num(p.speed),
    heading: num(p.heading),
    battery: num(p.battery),
    source,
  };
}

const insert = db.prepare(
  `INSERT OR IGNORE INTO locations
     (user_id, recorded_at, received_at, lat, lon, accuracy, altitude, speed, heading, battery, source)
   VALUES (@user_id, @recorded_at, @received_at, @lat, @lon, @accuracy, @altitude, @speed, @heading, @battery, @source)`,
);

const insertBatch = db.transaction((userId: number, points: Incoming[], now: number) => {
  let inserted = 0;
  for (const p of points) {
    // A device clock far in the future would otherwise pin "latest" forever.
    const recorded_at = p.recorded_at > now + MAX_FUTURE_MS ? now : p.recorded_at;
    inserted += insert.run({ ...p, user_id: userId, recorded_at, received_at: now }).changes;
  }
  return inserted;
});

// POST /api/locations  { points: [...] } -> { inserted, received }
// Idempotent: UNIQUE(user_id, recorded_at) + INSERT OR IGNORE, so the phone
// can retry a batch after a flaky upload.
locationsRoutes.post("/", (req, res) => {
  const points = (req.body as { points?: unknown })?.points;
  if (!Array.isArray(points) || points.length === 0) {
    res.status(400).json({ error: "points must be a non-empty array" });
    return;
  }
  if (points.length > MAX_POINTS) {
    res.status(400).json({ error: `at most ${MAX_POINTS} points per request` });
    return;
  }
  const parsed: Incoming[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = parsePoint(points[i]);
    if (typeof p === "string") {
      res.status(400).json({ error: `points[${i}]: ${p}` });
      return;
    }
    parsed.push(p);
  }
  const inserted = insertBatch(req.user!.id, parsed, Date.now());
  res.json({ inserted, received: parsed.length });
});
