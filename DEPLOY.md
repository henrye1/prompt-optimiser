# Deploying to Render

Two services are deployed from this repo, plus an external (already-hosted) Supabase project:

| Service | Type | Root dir | Serves |
|---|---|---|---|
| `prompt-optimiser-api` | Web Service (Node) | `backend/` | Express API on Render's `$PORT` |
| `prompt-optimiser-web` | Static Site | `frontend/` | Angular SPA (`dist/frontend/browser`) |

`render.yaml` at the repo root defines both. Build/start commands and the SPA rewrite are already configured there.

## 1. Prerequisites

- The Supabase migrations are applied to the hosted project (`npx supabase db push`).
- You have the Supabase **URL**, **anon key**, and **service-role key** (Supabase dashboard → Project Settings → API), and a **Gemini API key**.

## 2. Create the services (Blueprint)

1. Push this branch to GitHub.
2. In Render: **New → Blueprint**, pick the repo. Render reads `render.yaml` and proposes both services.
3. Apply. Both build; they'll fail the first health check until env vars are set — that's expected.

## 3. Set environment variables

**`prompt-optimiser-api`** (Dashboard → the service → Environment):

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service-role** key (secret) |
| `GEMINI_API_KEY` | your Gemini key |
| `CORS_ORIGIN` | the **web** service URL, e.g. `https://prompt-optimiser-web.onrender.com` |

`NODE_ENV=production` and `PORT` are handled automatically (the app reads `PORT`).

**`prompt-optimiser-web`** (build-time, consumed by `scripts/set-env.js`):

| Key | Value |
|---|---|
| `API_BASE_URL` | the **api** service URL, e.g. `https://prompt-optimiser-api.onrender.com` |
| `SUPABASE_URL` | same as above |
| `SUPABASE_ANON_KEY` | same as above |

## 4. Redeploy

After setting the vars, trigger a manual deploy of **both** services (the cross-referencing URLs only exist once the services are created):

- Web → **Manual Deploy → Clear build cache & deploy** (so `set-env.js` re-runs with `API_BASE_URL`).
- API → **Manual Deploy** (so it picks up `CORS_ORIGIN`).

## 5. Supabase Auth redirect URLs

In Supabase → Authentication → URL Configuration, add the web service URL to **Site URL** / **Redirect URLs** so email/password auth works from the deployed origin.

## Notes

- **CORS**: the API allows exactly the origin in `CORS_ORIGIN`. If you add a custom domain, update it.
- **Free tier**: the API spins down when idle and cold-starts on the next request (first request after idle is slow). The static site is always on.
- **Config changes**: `API_BASE_URL` / Supabase values are baked into the SPA **at build time**. Changing them requires a redeploy of the web service, not just a restart.
- Local dev is unchanged: `npm start` (frontend, :4300) still uses `src/environments/environment.ts`; the production file is only used by `ng build`.
- **Publish path**: `render.yaml` sets `staticPublishPath: dist/frontend/browser` (relative to `frontend/`). If the web deploy fails with "publish directory not found", change it to `frontend/dist/frontend/browser`.
