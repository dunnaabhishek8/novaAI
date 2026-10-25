# Nova AI — a MERN chatbot with PDF Q&A, web search and your own login

React + Express + MongoDB front to back. The LangGraph agent from your `Chatbot` repo runs as a small
private Python service; **Streamlit is gone**. Deployable to Render's free tier from the included `render.yaml` ([DEPLOY.md](DEPLOY.md)).

## What you get

* **Auth like your website builder, plus more**
  * Email + password **sign up / log in** (bcrypt-hashed, no Google needed)
  * **Continue with Google** (Firebase popup, token verified on the server)
  * httpOnly JWT cookie sessions, per-user data isolation
* **Chat** with saved history, grouped by day, auto-titled, delete anytime
* **PDF Q&A** (attach or drag-and-drop), web search, stock prices, calculator (your existing LangGraph tools)
* Dark, glassy UI with gradients, markdown + table rendering, copy buttons, responsive sidebar

## Architecture

```
 Browser (React + Redux + Tailwind)
    │  httpOnly cookie
    ▼
 Express ──► MongoDB   users, chat threads, message history
  • /api/auth   register · login · google · logout
  • /api/chat   threads · messages · documents  (login required, owner-only)
    │  Bearer token (server-to-server only)
    ▼
 chatbot-service (FastAPI + LangGraph) ──► Supabase Postgres (agent memory)
  • Groq LLM · Gemini embeddings · FAISS     Tavily / AlphaVantage tools
```

## Run it locally

Prereqs: Node 20+, Python 3.11+, MongoDB (local or Atlas), and your API keys.

**1. Shared secret** (one random string, pasted in two places):

```
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

**2. Chatbot service**

```powershell
cd chatbot-service
python -m venv .venv
.venv\Scripts\Activate.ps1            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                # macOS/Linux: cp .env.example .env
uvicorn app:app --port 8000 --workers 1
```

**3. Express server**

```powershell
cd server
npm install
copy .env.example .env
npm run dev
```

**4. React client**

```powershell
cd client
npm install
copy .env.example .env
npm run dev                            # http://localhost:5173
```

> For `SUPABASE_DB_URI`, use Supabase's **Session pooler** string. It works locally *and* on Render (the Direct connection is IPv6-only).

> `.env` files are only read at startup. After editing one, **stop and restart** that service.

## Environment variables

| File | Variable | Notes |
|---|---|---|
| server | `MONGODB_URL`, `JWT_SECRET` | required |
| server | `FRONTEND_URL` | CORS allow-list, e.g. `http://localhost:5173` |
| server | `CHATBOT_SERVICE_URL`, `CHATBOT_API_TOKEN` | token **must equal** the chatbot's `API_ACCESS_TOKEN` |
| server | `FIREBASE_API_KEY` | *optional*: enables Google sign-in. Same value as the client's `VITE_FIREBASE_API_KEY` |
| server | `FRONTEND_URL` | local dev only (CORS for Vite's port). Leave unset in production |
| server | `COOKIE_SAMESITE` | default `lax`. Use `none` only if the client is hosted on a different site |
| server | `NODE_ENV=development` | local only (http cookies). Omit in production |
| server | `TRUST_PROXY=1` | when deployed behind a proxy (Render, Nginx) |
| chatbot-service | `API_ACCESS_TOKEN`, `SUPABASE_DB_URI`, `GROQ_API_KEY`, `GOOGLE_API_KEY`, `TAVILY_API_KEY` | `ALPHAVANTAGE_API_KEY` optional |
| chatbot-service | `ENABLE_DOCS`, `MAX_CACHED_INDEXES`, `DB_POOL_MAX` | optional. `ENABLE_DOCS=false` in production |
| client | `VITE_SERVER_URL` | the Express URL |
| client | `VITE_FIREBASE_API_KEY` | *optional*: shows the Google button |

**Google sign-in is optional.** Leave both Firebase keys empty and the app runs with email/password only.
To enable it, put the Firebase Web API key in both `.env` files. Add `localhost` (and your deployed domain)
under *Firebase console → Authentication → Settings → Authorized domains*. Using your own Firebase project?
Also set `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.

## How the auth works (and why it's safe)

| Concern | What the code does |
|---|---|
| Password storage | bcrypt, cost 12. Hashes are `select:false` in the schema and stripped from every JSON response |
| Login errors | Unknown email and wrong password return the *same* message and take the *same* time (no user enumeration) |
| Brute force | 10 failed logins / 15 min / IP; 10 signups / hour / IP |
| Bad input | Every credential field must be a real string (blocks `{"$ne":1}`-style payloads); passwords limited to 72 bytes so bcrypt never silently truncates |
| Google login | The browser sends a Firebase **ID token**; the server verifies it with Firebase. A bare email is rejected |
| Account pre-hijacking | If someone registers `victim@x.com` by password (unverified), then the real owner signs in with Google, the unverified password is **revoked** |
| Sessions | httpOnly cookie, 7 days. A 401 anywhere in the app returns the user to the login screen |
| Data isolation | Every chat query filters by owner. Another user's thread is a `404`, indistinguishable from a missing one |

Not included (would need an email service): email verification and password reset.

## API

`POST /api/auth/register {name,email,password}` · `POST /api/auth/login {email,password}` ·
`POST /api/auth/google {idToken}` · `GET /api/auth/logout` · `GET /api/user/me`

`/api/chat/*` (login required): `GET/POST /threads`, `GET/DELETE /threads/:id`,
`POST /threads/:id/messages {message}`, `POST /threads/:id/documents` (multipart `file`)

## Troubleshooting

* **PDF upload → 502 and "API key not valid" in the Python log**: `GOOGLE_API_KEY` is wrong. Create one at
  https://aistudio.google.com/apikey (starts with `AIza`), put it in `chatbot-service/.env`, restart uvicorn.
  Also check no stale `GOOGLE_API_KEY` is set in your OS environment (`echo $env:GOOGLE_API_KEY`).
* **"The assistant is not configured correctly"**: `CHATBOT_API_TOKEN` ≠ `API_ACCESS_TOKEN`. Fix and restart both.
* **Logged out immediately / cookie not saved**: set `NODE_ENV=development` in `server/.env` for local work.
* **Google popup closes with an error**: `localhost` isn't in Firebase's authorized domains, or the API key is wrong.

## Deploying

**See [DEPLOY.md](DEPLOY.md)** for the full free-tier walkthrough (MongoDB Atlas + Supabase + Render, one `render.yaml`).

How it is deployed: Express serves the built React app, so the browser sees **one origin** (first-party cookies,
no CORS, works on Safari/iPhone). The Python chatbot runs as a second service that only Express calls.
PDF indexes and agent memory live in Postgres, so they survive restarts and the free tier's sleep/wake cycle.

## Tests

```
cd client && npm test        # 15 UI tests (login, signup, Google, chat flows, cold-start notice)
```
