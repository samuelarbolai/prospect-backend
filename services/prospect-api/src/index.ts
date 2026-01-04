import cors, { CorsOptions } from "cors";
import express from "express";
import enrichmentRouter from "./routes/enrichment.js";
import prospectsRouter from "./routes/prospects.js";
import pricingRouter from "./routes/pricing.js";

const app = express();
const port = Number(process.env.PORT);

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

// Serve documentation at /docs
app.use('/docs', express.static('docs-site/build'));

app.get("/", (_req, res) => {
  res.json({
    name: "Prospect Pipeline API",
    version: "1.0.0",
    documentation: "Visit /docs for complete API documentation",
    endpoints: {
      health: "GET /healthz",
      prospects: "GET /api/prospects",
      listOptions: "GET /api/list-options",
      enqueueEnrichment: "POST /api/enqueue_enrichment",
      tagOutreachReady: "POST /api/tag_outreach_ready",
      pricing: "See /docs/api for pricing endpoints"
    }
  });
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.use("/api", enrichmentRouter);
app.use("/api", prospectsRouter);
app.use("/api/pricing", pricingRouter);

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

console.log(`[Startup] Attempting to listen on port: ${port}`);
if (isNaN(port)) {
  console.error("[Startup] Error: Port is not a number. Exiting.");
  process.exit(1);
}

app.listen(port, () => {
  console.log(`[Startup] Prospect pipeline backend successfully listening on port ${port}`);
  console.log('');
  console.log('📖 Documentation:');
  console.log(`   http://localhost:${port}/docs - Full API Documentation`);
  console.log(`   http://localhost:${port}/ - API Info`);
  console.log('');
});
