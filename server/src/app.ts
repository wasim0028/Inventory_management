import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireAuth } from "./lib/auth.js";
import { errorHandler } from "./lib/http.js";
import dashboard from "./routes/dashboard.js";
import products from "./routes/products.js";
import { purchasesRouter, salesRouter } from "./routes/transactions.js";
import { expensesRouter, searchRouter, usersRouter } from "./routes/misc.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("query parser", "simple");

  app.use(helmet());
  // On AWS, API Gateway handles CORS (see template.yaml). This covers local dev.
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());
  app.use(cors({ origin: origins, credentials: false }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use(requireAuth);

  app.get("/me", (req, res) => {
    res.json(req.user);
  });
  app.use("/dashboard", dashboard);
  app.use("/products", products);
  app.use("/sales", salesRouter);
  app.use("/purchases", purchasesRouter);
  app.use("/expenses", expensesRouter);
  app.use("/users", usersRouter);
  app.use("/search", searchRouter);

  app.use((_req, res) => {
    res.status(404).json({ message: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
