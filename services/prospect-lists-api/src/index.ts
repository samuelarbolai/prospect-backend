import cors, { CorsOptions } from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import listRouter from "./routes/lists.js";

const app = express();
const port = Number(process.env.PORT ?? 4100);

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use((req, res, next) => {
  const originHeader = req.get("origin");
  const allowAll = allowedOrigins.length === 0;
  const matchedOrigin =
    allowAll || (originHeader && allowedOrigins.includes(originHeader))
      ? originHeader ?? "*"
      : allowedOrigins[0] ?? "*";
  res.setHeader("Access-Control-Allow-Origin", matchedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  next();
});

app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.use("/api", listRouter);

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (!res.headersSent) {
    const originHeader = req.get("origin");
    const allowAll = allowedOrigins.length === 0;
    const matchedOrigin =
      allowAll || (originHeader && allowedOrigins.includes(originHeader))
        ? originHeader ?? "*"
        : allowedOrigins[0] ?? "*";
    res.setHeader("Access-Control-Allow-Origin", matchedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Prospect list service listening on port ${port}`);
});
