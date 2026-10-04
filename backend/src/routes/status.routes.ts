import { Router } from "express";
import { allStatuses } from "../status.js";

export const statusRoutes = Router();

// GET /api/status -> { users: [UserStatus] }
statusRoutes.get("/", (_req, res) => {
  res.json({ users: allStatuses() });
});
