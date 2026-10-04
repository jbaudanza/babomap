import { db } from "./db.js";

export type LocationPoint = {
  recorded_at: number;
  received_at: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  source: string | null;
  ip: string | null;
};

export type UserStatus = {
  name: string;
  sharing_enabled: boolean;
  sharing_changed_at: number | null;
  latest: LocationPoint | null;
};

type UserRow = { id: number; name: string; sharing_enabled: number; sharing_changed_at: number | null };

const latestStmt = db.prepare(
  `SELECT recorded_at, received_at, lat, lon, accuracy, altitude, speed, heading, battery, source, ip
   FROM locations WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`,
);
const usersStmt = db.prepare(
  "SELECT id, name, sharing_enabled, sharing_changed_at FROM users ORDER BY id",
);
const userStmt = db.prepare(
  "SELECT id, name, sharing_enabled, sharing_changed_at FROM users WHERE id = ?",
);

function statusFor(row: UserRow): UserStatus {
  return {
    name: row.name,
    sharing_enabled: row.sharing_enabled === 1,
    sharing_changed_at: row.sharing_changed_at,
    latest: (latestStmt.get(row.id) as LocationPoint | undefined) ?? null,
  };
}

export function allStatuses(): UserStatus[] {
  return (usersStmt.all() as UserRow[]).map(statusFor);
}

export function statusForUserId(id: number): UserStatus {
  return statusFor(userStmt.get(id) as UserRow);
}
