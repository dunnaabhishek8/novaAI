// Default ("lax") is right when the React app and the API share one origin, which is how
// this project deploys (Express serves the built client).
// Only if you host the client on a DIFFERENT site (e.g. Vercel + a separate API) set
// COOKIE_SAMESITE=none. Be aware Safari and some browsers block such third-party cookies.
const isDev = process.env.NODE_ENV === "development";
const sameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();

export const cookieOptions = {
  httpOnly: true,
  secure: !isDev, // required by browsers for SameSite=None, and right for any https deploy
  sameSite,
};
