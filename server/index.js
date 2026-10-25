// MUST be the first import: loads .env before any module reads process.env.
import "dotenv/config";
import CONNECTDB from "./config/db.js";

// Fail fast with a clear message instead of a confusing crash later.
const REQUIRED_ENV = [
  "MONGODB_URL",
  "JWT_SECRET",
  "CHATBOT_SERVICE_URL",
  "CHATBOT_API_TOKEN",
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

if (!process.env.FIREBASE_API_KEY) {
  console.warn("FIREBASE_API_KEY not set: Google sign-in is disabled (email/password still works).");
}

const { default: app } = await import("./app.js");
const port = process.env.PORT || 5000;

try {
  await CONNECTDB();
  app.listen(port, () => {
    console.log(`Server running on ${port}`);
  });
} catch (err) {
  console.error("Startup failed");
  console.error(err);
  process.exit(1);
}
