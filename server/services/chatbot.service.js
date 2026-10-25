// Thin HTTP client for the private Python chatbot service.
// Only the Express server calls it; the browser never sees its URL or token.

export class ChatbotServiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "ChatbotServiceError";
    this.status = status;
  }
}

// Generous on purpose: on a free host the chatbot may need ~1 minute to wake from sleep.
const CHAT_TIMEOUT_MS = 120_000;
const UPLOAD_TIMEOUT_MS = 180_000; // embedding a PDF is slow on free API tiers

async function request(path, options, timeoutMs) {
  let res;
  try {
    res = await fetch(`${process.env.CHATBOT_SERVICE_URL}/api/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${process.env.CHATBOT_API_TOKEN}`,
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === "TimeoutError") {
      throw new ChatbotServiceError("The assistant took too long to respond. Please try again.", 504);
    }
    console.error("Chatbot service unreachable:", err.message);
    throw new ChatbotServiceError("The assistant is temporarily unavailable.", 503);
  }

  if (res.ok) return res.json();

  let detail = null;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") detail = body.detail;
  } catch {
    /* non-JSON error body */
  }

  // Our own validation messages (bad file, too large, ...) are safe to show.
  if ([400, 413, 415, 422].includes(res.status)) {
    throw new ChatbotServiceError(detail || "The assistant rejected this request.", res.status);
  }
  // 401/503 from the chatbot = token or config mismatch: a server problem, don't leak it.
  if (res.status === 401 || res.status === 503) {
    console.error("Chatbot service auth/config error:", res.status, detail);
    throw new ChatbotServiceError("The assistant is not configured correctly.", 502);
  }
  throw new ChatbotServiceError(detail || "The assistant failed to respond. Please try again.", 502);
}

export const sendChat = ({ message, threadId }) =>
  request(
    "/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, thread_id: threadId }),
    },
    CHAT_TIMEOUT_MS
  );

export const uploadPdf = ({ buffer, filename, threadId }) => {
  const form = new FormData();
  form.append("thread_id", threadId);
  form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);
  return request("/documents", { method: "POST", body: form }, UPLOAD_TIMEOUT_MS);
};

// Removes the conversation's PDF index and agent memory. Idempotent on the chatbot side.
export const deleteThreadData = (threadId) =>
  request(`/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" }, CHAT_TIMEOUT_MS);
