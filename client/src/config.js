// No imports here on purpose: any module can import this without creating a cycle.
export const APP_NAME = "Nova AI"
// In production the API is on the same origin as the page, so a relative URL ("") is correct.
// In dev the client runs on Vite's port and the API on :5000. An explicit VITE_SERVER_URL wins.
export const serverUrl =
  import.meta.env.VITE_SERVER_URL ?? (import.meta.env.PROD ? "" : "http://localhost:5000")
// Google sign-in button only appears when a Firebase key is configured.
export const googleEnabled = Boolean(import.meta.env.VITE_FIREBASE_API_KEY)
