import { Router } from "express";
import { allStatuses } from "../status.js";

export const statusRoutes = Router();

// GET /api/status -> { me: name, users: [UserStatus] }
statusRoutes.get("/", (req, res) => {
  res.json({ me: req.user!.name, users: allStatuses() });
});
