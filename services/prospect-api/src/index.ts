import cors, { CorsOptions } from "cors";
import express from "express";
import enrichmentRouter from "./routes/enrichment.js";
import prospectsRouter from "./routes/prospects.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
};

app.use(cors(corsOptions));
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.use("/api", enrichmentRouter);
app.use("/api", prospectsRouter);

// Final error handler
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Note: The error is logged by the Cloud Run environment, but we log it here for visibility in local dev
  console.error("Unhandled error:", err);

  if (res.headersSent) {
    return;
  }

  // Set CORS headers for the error response
  const originHeader = req.get("origin");
  if (originHeader && allowedOrigins.includes(originHeader)) {
    res.setHeader("Access-Control-Allow-Origin", originHeader);
    res.setHeader("Vary", "Origin");
  } else if (allowedOrigins.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Prospect pipeline backend listening on port ${port}`);
});
