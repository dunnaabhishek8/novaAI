// Loaded lazily (only when the user clicks "Continue with Google") to keep the first load small.
import { initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider } from "firebase/auth"

// Only the API key is required. The other values default to the original GenWeb AI
// Firebase project; override them in .env to use your own project.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "genwebai-5cc04.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "genwebai-5cc04",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:730457149991:web:e88869dffad84d54bf3402",
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const provider = new GoogleAuthProvider()
provider.setCustomParameters({ prompt: "select_account" })

export { auth, provider }
