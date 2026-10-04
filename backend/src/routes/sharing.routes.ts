import { Router } from "express";
import { db } from "../db.js";
import { statusForUserId } from "../status.js";

export const sharingRoutes = Router();

const setSharing = db.transaction((userId: number, enabled: boolean, now: number) => {
  const flag = enabled ? 1 : 0;
  db.prepare("UPDATE users SET sharing_enabled = ?, sharing_changed_at = ? WHERE id = ?").run(flag, now, userId);
  db.prepare("INSERT INTO sharing_log (user_id, enabled, at) VALUES (?, ?, ?)").run(userId, flag, now);
});

// PUT /api/sharing  { enabled: boolean } -> UserStatus
sharingRoutes.put("/", (req, res) => {
  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  setSharing(req.user!.id, enabled, Date.now());
  res.json(statusForUserId(req.user!.id));
});
