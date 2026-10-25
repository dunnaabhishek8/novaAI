# Deploying Nova AI (free tier, step by step)

You will end up with **one public URL** (`https://<your-app>.onrender.com`) that serves the React app and the API,
plus a second, private-ish service that runs the Python chatbot.

```
Browser ──► nova-chat-app  (Render web service: Express + built React)  ──► MongoDB Atlas
                  │
                  └──Bearer token──► nova-chat-bot (Render Docker service: FastAPI + LangGraph) ──► Supabase Postgres
```

Everything below is free. Read **"What free means"** at the bottom before you share the link with anyone.

---

## 0. Accounts and keys you need

| For | Where | You need |
|---|---|---|
| Code hosting | github.com | an account |
| Users, chats | MongoDB Atlas | free **M0** cluster |
| Agent memory + PDF indexes | Supabase | free project |
| Hosting | render.com | an account (sign in with GitHub) |
| AI | Groq, Google AI Studio, Tavily | the keys you already use locally |

## 1. MongoDB Atlas

1. Create a free **M0** cluster. Pick a region near you (Mumbai or Singapore).
2. **Database Access** → add a user with a password. Use letters and numbers only, so you don't have to URL-encode it.
3. **Network Access** → **Add IP address** → **Allow access from anywhere** (`0.0.0.0/0`).
   Render's free plan has no fixed IP address, so Atlas can't allow a specific one. The password protects the database.
4. **Connect → Drivers** → copy the string and add the database name before the `?`:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/chatbot?retryWrites=true&w=majority
   ```

   This is your `MONGODB_URL`.

## 2. Supabase  ⚠️ the step people get wrong

Click **Connect** at the top of your project and copy the **Session pooler** string
(host looks like `aws-0-<region>.pooler.supabase.com`, port `5432`, user `postgres.<project-ref>`).

> **Do not use "Direct connection".** Supabase's direct connection is IPv6-only, and Render is IPv4-only,
> so the chatbot would fail at startup with `PoolTimeout: pool initialization incomplete`.

Replace `[YOUR-PASSWORD]` with your database password. This is your `SUPABASE_DB_URI`.
The service creates its own tables on first start. There is nothing to set up by hand.

## 3. Put the code on GitHub

In PowerShell, from the project folder (the one that contains `render.yaml`):

```powershell
git init
git add .
git status          # CHECK: no ".env" file may be listed. If one is, stop and fix .gitignore.
git commit -m "Nova AI"
git branch -M main
```

Create an empty repository on github.com (private is fine), then:

```powershell
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 4. Name your services

Open `render.yaml`. The service names become public URLs and must be unique on all of Render, so change

* `nova-chat-app` → e.g. `nova-chat-app-yourname`
* `nova-chat-bot` → e.g. `nova-chat-bot-yourname`  (**two places**: the service itself and the `fromService` reference)

Commit and push again.

## 5. Create both services with the Blueprint

1. Render dashboard → **New +** → **Blueprint** → connect GitHub → pick your repo.
2. Render reads `render.yaml` and shows two services. It asks for the secrets marked `sync: false`:

   | Variable | Value |
   |---|---|
   | `MONGODB_URL` | from step 1 |
   | `SUPABASE_DB_URI` | the **Session pooler** string from step 2 |
   | `GROQ_API_KEY`, `GOOGLE_API_KEY`, `TAVILY_API_KEY` | your keys |
   | `CHATBOT_SERVICE_URL` | `https://<your bot service name>.onrender.com` |

   `JWT_SECRET` and the shared token between the two services are **generated for you**. You never paste them anywhere.

3. Click **Apply**. The first deploy takes several minutes (the bot builds a Docker image).

If Render had to add a random suffix to your bot's URL (because the name was taken), copy its real URL from the bot
service page and update `CHATBOT_SERVICE_URL` on the **web** service (Environment tab). It redeploys by itself.

## 6. Check that it works

In a browser (or `curl.exe` in PowerShell):

* `https://<app>.onrender.com/api/health` → `{"status":"ok"}`
* `https://<bot>.onrender.com/health/live` → `{"status":"alive"}`

Then open `https://<app>.onrender.com`, **sign up with email**, send a message, and attach a PDF.

> The first request after a quiet period is slow (up to about a minute, or two if both services are asleep).
> That is the free plan waking up, not a bug. The chat shows a notice when this happens.

## 7. Optional: enable "Continue with Google"

Without these steps the app works fine with email and password only.

1. Firebase console → **Authentication → Settings → Authorized domains** → add `<app>.onrender.com`.
2. Render → your **web** service → **Environment** → add `FIREBASE_API_KEY` (your Firebase *Web API key*).
3. Trigger a redeploy. The key is baked into the React build, so a restart alone isn't enough.

## 8. Updating the app later

`git push` to `main`. Render rebuilds and redeploys automatically.

---

## Troubleshooting

| You see | Cause and fix |
|---|---|
| Build fails with `vite: not found` | Render skipped devDependencies. The Blueprint already uses `--include=dev`. If you wrote your own build command, add it. |
| Bot logs: `PoolTimeout: pool initialization incomplete` | Wrong `SUPABASE_DB_URI`. Use the **Session pooler** string, check the password, and make sure the project isn't paused. |
| Chat says "The assistant is not configured correctly" | `CHATBOT_API_TOKEN` and `API_ACCESS_TOKEN` differ. Don't set `CHATBOT_API_TOKEN` by hand; let `fromService` fill it. |
| Chat says "temporarily unavailable" | `CHATBOT_SERVICE_URL` is wrong, or the bot is still waking up. Wait a minute and retry. |
| PDF upload: bot log shows `API key not valid` | `GOOGLE_API_KEY` is wrong. Create one at aistudio.google.com/apikey. |
| Web service log: `MongoServerSelectionError` | Atlas Network Access doesn't allow `0.0.0.0/0`, or the password in the URL is wrong. |
| Login works, then you're logged out on refresh | Open the *app* URL, not the bot's. Cookies are per site. Also check `TRUST_PROXY=1` is set. |
| Google popup error | `<app>.onrender.com` is missing from Firebase authorized domains. |
| Everything is slow after a pause | Free services sleep after 15 minutes idle. See below. |

## What "free" means (be honest with yourself before sharing the link)

Verified against Render's documentation:

* Free web services **sleep after 15 minutes without traffic** and take **about a minute** to wake.
* Each has **512 MB RAM and 0.1 CPU**. The chatbot used roughly 130 MB idle and 180 MB while indexing a
  60-page PDF in testing, so it fits. Very large PDFs will be slow on 0.1 CPU.
* Free instances **lose their disk on every restart**. That's why PDF indexes live in Postgres, not on disk.
* All free services in your workspace share **750 instance hours a month**. A service that is asleep uses none.

**Don't use an uptime pinger to keep both services awake.** Two always-on services would use about 1,440 hours
against a 750-hour allowance, and Render suspends all your free services until the next month.

To remove the sleep for real users, upgrade just the **web** service to a paid instance (listed at about $7/month;
check Render's pricing page). The bot can stay free.

Other limits: Groq, Gemini and Tavily have their own free quotas. Supabase free projects may pause after a
period of inactivity; un-pause from the Supabase dashboard (check their current policy).

## Security checklist

* `.env` files are git-ignored. Run `git status` before every first push.
* Use **new** keys and a new Atlas password for production if the old ones were ever pasted anywhere public.
* The bot's URL is public, but every route except `/health/live` needs the shared token.
* Each user can send 15 messages per minute and 10 uploads per hour (per account), and failed logins are rate-limited per IP.
