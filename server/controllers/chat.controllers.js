import crypto from "crypto";
import mongoose from "mongoose";
import ChatThread from "../models/chatThread.model.js";
import { deleteThreadData, sendChat, uploadPdf } from "../services/chatbot.service.js";

const MAX_MESSAGE_LENGTH = 10_000;
const DEFAULT_TITLE = "New chat";

// AUTHORIZATION: a thread is only ever loaded together with its owner.
// Someone else's thread looks identical to a missing one (404, not 403).
const findOwnedThread = (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return ChatThread.findOne({ _id: req.params.id, user: req.user._id });
};

export const createThread = async (req, res) => {
  const thread = await ChatThread.create({
    user: req.user._id,
    threadId: `${req.user._id}_${crypto.randomUUID()}`,
  });
  return res.status(201).json(thread);
};

export const listThreads = async (req, res) => {
  const threads = await ChatThread.find({ user: req.user._id })
    .select("-messages")
    .sort({ lastMessageAt: -1 });
  return res.status(200).json(threads);
};

export const getThread = async (req, res) => {
  const thread = await findOwnedThread(req);
  if (!thread) return res.status(404).json({ message: "Chat not found" });
  return res.status(200).json(thread);
};

export const deleteThread = async (req, res) => {
  const thread = await findOwnedThread(req);
  if (!thread) return res.status(404).json({ message: "Chat not found" });
  await thread.deleteOne();

  // Clean up the chatbot's copy (PDF index + memory) in the background. The user doesn't wait
  // for it: a sleeping free-tier chatbot can take a minute to wake. A failure only leaves
  // orphaned rows behind; it never affects the user.
  deleteThreadData(thread.threadId).catch((err) =>
    console.error(`Chatbot cleanup failed for ${thread.threadId}:`, err.message)
  );

  return res.status(200).json({ message: "Chat deleted" });
};

export const sendMessage = async (req, res) => {
  if (typeof req.body?.message !== "string") {
    return res.status(400).json({ message: "message is required" });
  }
  const message = req.body.message.trim();
  if (!message) return res.status(400).json({ message: "message is required" });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(422).json({ message: `message must be under ${MAX_MESSAGE_LENGTH} characters` });
  }

  const thread = await findOwnedThread(req);
  if (!thread) return res.status(404).json({ message: "Chat not found" });

  const { answer } = await sendChat({ message, threadId: thread.threadId });

  const set = { lastMessageAt: new Date() };
  if (thread.title === DEFAULT_TITLE) set.title = message.slice(0, 60);

  await ChatThread.updateOne(
    { _id: thread._id },
    {
      $set: set,
      $push: {
        messages: {
          $each: [
            { role: "user", content: message },
            { role: "ai", content: answer },
          ],
        },
      },
    }
  );

  return res.status(200).json({ answer, title: set.title ?? thread.title });
};

export const uploadDocument = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "A PDF file is required" });

  const thread = await findOwnedThread(req);
  if (!thread) return res.status(404).json({ message: "Chat not found" });

  const result = await uploadPdf({
    buffer: req.file.buffer,
    filename: req.file.originalname,
    threadId: thread.threadId,
  });

  const document = { filename: result.filename, pages: result.pages, chunks: result.chunks };
  await ChatThread.updateOne({ _id: thread._id }, { $set: { document } });

  return res.status(200).json({ document });
};
