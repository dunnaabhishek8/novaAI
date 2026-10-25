import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { cookieOptions } from "../config/cookie.js";

const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Compared against when the email doesn't exist, so "unknown email" and
// "wrong password" take the same time (no user enumeration via timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const issueSession = (res, user) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
};

const normalizeEmail = (v) => String(v ?? "").trim().toLowerCase();

// JSON bodies can carry objects/arrays/numbers. String({}) === "[object Object]" would
// slip through length checks, so every credential field must be a real string.
const allStrings = (...values) => values.every((v) => typeof v === "string");

// ---------------------------------------------------------------- manual signup
export const register = async (req, res) => {
  try {
    if (!allStrings(req.body?.name, req.body?.email, req.body?.password)) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }
    const name = req.body.name.trim();
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ message: "Name must be 2–60 characters." });
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    // bcrypt only uses the first 72 BYTES; refuse longer ones instead of silently truncating.
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password is too long (max 72 characters)." });
    }

    if (await User.findOne({ email })) {
      return res.status(409).json({ message: "An account with this email already exists. Try logging in." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let user;
    try {
      user = await User.create({ name, email, passwordHash, emailVerified: false });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ message: "An account with this email already exists. Try logging in." });
      }
      throw err;
    }

    issueSession(res, user);
    return res.status(201).json(user);
  } catch (error) {
    console.error("register error:", error);
    return res.status(500).json({ message: "Could not create your account. Please try again." });
  }
};

// ----------------------------------------------------------------- manual login
export const login = async (req, res) => {
  try {
    if (!allStrings(req.body?.email, req.body?.password)) {
      return res.status(400).json({ message: "Email and password are required." });
    }
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email }).select("+passwordHash");
    // Google-only accounts have no passwordHash: they fail here exactly like a wrong password.
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    issueSession(res, user);
    return res.status(200).json(user);
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({ message: "Login failed. Please try again." });
  }
};

// ------------------------------------------------------------------ Google login
// Ask Firebase whether this ID token is genuine. The browser's claim about
// "who I am" is never trusted; only what Firebase confirms is used.
const verifyFirebaseIdToken = async (idToken) => {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const u = data.users?.[0];
  if (!u?.email || !u.emailVerified) return null;

  return { email: u.email.toLowerCase(), name: u.displayName, avatar: u.photoUrl };
};

export const googleAuth = async (req, res) => {
  try {
    if (!process.env.FIREBASE_API_KEY) {
      return res.status(501).json({ message: "Google sign-in is not configured on this server." });
    }
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ message: "idToken is required" });
    }

    const profile = await verifyFirebaseIdToken(idToken);
    if (!profile) {
      return res.status(401).json({ message: "Google sign-in could not be verified" });
    }

    let user = await User.findOne({ email: profile.email });
    if (!user) {
      user = await User.create({
        name: profile.name || profile.email.split("@")[0],
        email: profile.email,
        avatar: profile.avatar,
        emailVerified: true,
      });
    } else if (!user.emailVerified) {
      // Pre-hijack defence: someone may have registered this address by password
      // WITHOUT proving they own it. Google just proved the real owner is here, so
      // the unverified password is revoked and the account is now verified.
      user.passwordHash = undefined;
      user.emailVerified = true;
      if (!user.avatar && profile.avatar) user.avatar = profile.avatar;
      await user.save();
    }

    issueSession(res, user);
    return res.status(200).json(user);
  } catch (error) {
    console.error("googleAuth error:", error);
    return res.status(500).json({ message: "Login failed. Please try again." });
  }
};

export const logOut = async (req, res) => {
  res.clearCookie("token", cookieOptions);
  return res.status(200).json({ message: "Logged out successfully" });
};
