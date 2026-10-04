import express from "express";
import { loadUsers, rateLimit, requireAuth, requireJson } from "./auth.js";
import { locationsRoutes } from "./routes/locations.routes.js";
import { statusRoutes } from "./routes/status.routes.js";
import { sharingRoutes } from "./routes/sharing.routes.js";
import { historyRoutes } from "./routes/history.routes.js";

loadUsers();

const app = express();
app.set("trust proxy", true); // Fly.io terminates TLS; trust X-Forwarded-*
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Method, path, status only. Never log bodies: they are locations.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.get("/healthz", (_req, res) => {
  res.type("text").send("ok");
});

app.use("/api", rateLimit, requireJson, requireAuth);
app.use("/api/locations", locationsRoutes);
app.use("/api/status", statusRoutes);
app.use("/api/sharing", sharingRoutes);
app.use("/api/history", historyRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const e = err as { type?: string; status?: number };
  if (e?.type === "entity.parse.failed") {
    res.status(400).json({ error: "invalid json" });
    return;
  }
  console.error(err);
  res.status(e?.status ?? 500).json({ error: "internal error" });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`babomap listening on :${port}`);
});
