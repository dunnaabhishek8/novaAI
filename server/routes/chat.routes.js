import express from "express";
import rateLimit from "express-rate-limit";
import isAuth from "../middlewares/isAuth.js";
import { pdfUpload } from "../middlewares/upload.js";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  sendMessage,
  uploadDocument,
} from "../controllers/chat.controllers.js";

const chatRouter = express.Router();

// Every chat route requires a logged-in user.
chatRouter.use(isAuth);

// LLM calls cost money: limit per *user*, not per IP.
const perUser = (req) => String(req.user._id);
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  keyGenerator: perUser,
  message: { message: "You're sending messages too fast. Please wait a moment." },
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: perUser,
  message: { message: "Too many uploads. Please try again later." },
});

chatRouter.get("/threads", listThreads);
chatRouter.post("/threads", createThread);
chatRouter.get("/threads/:id", getThread);
chatRouter.delete("/threads/:id", deleteThread);
chatRouter.post("/threads/:id/messages", messageLimiter, sendMessage);
chatRouter.post("/threads/:id/documents", uploadLimiter, pdfUpload, uploadDocument);

export default chatRouter;
