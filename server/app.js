import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import multer from "multer";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import chatRouter from "./routes/chat.routes.js";
import { ChatbotServiceError } from "./services/chatbot.service.js";

const app = express();
app.disable("x-powered-by");

const isDev = process.env.NODE_ENV === "development";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../client/dist");

// Behind a proxy (Render, Nginx...) set TRUST_PROXY=1 so rate limits see the real client IP.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
// CORS only matters when the client runs on another origin (local dev: Vite on :5173).
// In production Express serves the client itself, so no cross-origin access is needed.
const allowedOrigins = (process.env.FRONTEND_URL || (isDev ? "http://localhost:5173" : ""))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false, credentials: true }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);

// Unknown API paths get JSON, never the React page.
app.use("/api", (req, res) => res.status(404).json({ message: "Not found" }));

// Production: serve the built React app (client/dist) from the same origin as the API.
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        // Vite fingerprints files in /assets, so they can be cached forever.
        const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader("Cache-Control", hashed ? "public, max-age=31536000, immutable" : "no-cache");
      },
    })
  );
  // Single-page-app fallback: /chat/abc123 must load the app, not a 404.
  app.get("/{*splat}", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Central error handler (Express 5 forwards async errors here automatically).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ChatbotServiceError) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    return res
      .status(tooBig ? 413 : 400)
      .json({ message: tooBig ? "PDF is too large." : err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON body." });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: "Something went wrong" });
});

export default app;
