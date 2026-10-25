import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "ai"], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

const chatThreadSchema = new mongoose.Schema(
  {
    // Ownership: every chat query MUST filter by this field (authorization).
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // The id LangGraph / the Python service knows this conversation by.
    // Format: "<userId>_<uuid>" (matches the Python service's id validation).
    threadId: { type: String, required: true, unique: true },
    title: { type: String, default: "New chat" },
    // Metadata about the PDF indexed for this thread (the vectors live in the chatbot service).
    document: {
      filename: String,
      pages: Number,
      chunks: Number,
    },
    messages: [chatMessageSchema],
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const ChatThread = mongoose.model("ChatThread", chatThreadSchema);
export default ChatThread;
