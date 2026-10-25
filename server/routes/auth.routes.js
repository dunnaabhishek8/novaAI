import express from "express";
import rateLimit from "express-rate-limit";
import { googleAuth, login, logOut, register } from "../controllers/auth.controllers.js";

const authRouter = express.Router();

// Slow down password guessing and mass signups (per IP).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true, // only failed attempts count
  message: { message: "Too many login attempts. Please try again in a few minutes." },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { message: "Too many sign-ups from this network. Please try again later." },
});

authRouter.post("/register", registerLimiter, register);
authRouter.post("/login", loginLimiter, login);
authRouter.post("/google", googleAuth);
authRouter.get("/logout", logOut);

export default authRouter;
