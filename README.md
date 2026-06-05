# Prompt Optimiser

Author reusable **prompt sets**, **run** them against an LLM (optionally feeding uploaded
files as context), and iterate on them with AI — either by tuning a set against real
documents (**Optimizer**) or by auditing and rewriting a whole set as one document
(**Prompt Review**).

- Login required (Supabase Auth, email/password).
- You only see your own data unless it is **published**.
- All top-level deletes are **soft**.

## Modules

| Module | What it does |
|---|---|
| **Prompt Sets** | Author sets of typed prompts (System / Assessment / Audit / Summary), each with ordered sections. Reorder, publish, and import/export via JSON. |
| **Models** | Connect LLM providers with your own API keys (Google Gemini, Anthropic). Runs and sessions pick which model to use. |
| **Runs** | Run a prompt set against a chosen model, optionally feeding uploaded files (PDF/Excel → markdown) as context. Per-section generation runs in the background with polling; results export to Markdown / PDF / Word and source files can be downloaded. |
| **Optimizer** | Tune a set's section prompts in a session against real documents — edit a section, rerun it, and compare outputs over time. Includes an **Improve with AI** helper and "save as a new set version". |
| **Prompt Review** | Load a set as one editable document, then **Review** (AI findings + a health score), **Improve** (per-section or whole-document, with a word-level diff), and **Restructure** it — then **publish a new prompt set**. |

## Stack

| Layer | Tech |
|---|---|
| Frontend | Angular 21 (standalone + signals) |
| Backend | Node + Express (TypeScript, ESM) |
| Auth / DB / Storage | Supabase (Postgres + Auth + Storage), RLS for ownership / publish / soft-delete |
| LLM | Google Gemini (`@google/genai`) and Anthropic (`@anthropic-ai/sdk`), selected per connected model; falls back to the server Gemini key |
| File → text | `markitdown-ts` (PDF / Excel → markdown) |

The browser authenticates directly against Supabase and sends the JWT to the backend, which
validates it and runs every query through a per-request, token-bound Supabase client so RLS
is enforced in Postgres. See `CLAUDE.md` for the architecture in depth.

## Layout

```
backend/    Express + TypeScript API (LLM calls, file conversion, run/session orchestration)
frontend/   Angular app
supabase/   SQL migrations, seed, RLS, Storage bucket; CLI config (config.toml)
docs/       Design spec
samples/    Example prompt-set / prompt / section JSON for import
```

## Local setup

Prerequisites: Node 20+, Docker (for local Supabase), and a Gemini API key.

### 1. Supabase (local)

```bash
npx supabase start      # boots Postgres/Auth/Storage and applies supabase/migrations
npx supabase status     # prints API URL + anon/service_role keys
```

To re-apply migrations after editing them:

```bash
npx supabase db reset
```

### 2. Backend

```bash
cd backend
cp .env.example .env     # fill SUPABASE_* (from `supabase status`) and GEMINI_API_KEY
npm install
npm run dev              # http://localhost:3001  (GET /health)
npm test
```

Backend env vars (`backend/.env`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GEMINI_API_KEY`, and typically `PORT=3001` / `CORS_ORIGIN=http://localhost:4300`. Anthropic models
supply their own API key (stored per model), so no server Anthropic key is needed.

### 3. Frontend

```bash
cd frontend
npm install
npm start                # http://localhost:4300
```

`frontend/src/environments/environment.ts` must point at the **same** Supabase project the
backend uses, and at the backend's URL (`apiBaseUrl`).

## Importing prompt sets from JSON

The Prompt Sets list has an **Import prompt set from JSON** button; the editor has
**Import prompt (+ sections)** and per-prompt **Import sections** buttons. Prompt type is
referenced by name (`Assessment` / `Audit` / `System`); sequence follows array order.
Runnable examples live in [`samples/`](samples):

- `sample-prompt-set.json` — a full set (System + Assessment + Audit prompts)
- `sample-prompt.json` — one prompt with sections (import into an existing set)
- `sample-sections.json` — sections to add to an existing prompt

Backend endpoints: `POST /api/prompt-sets/import`, `POST /api/prompt-sets/:id/prompts/import`,
`POST /api/prompts/:id/sections/import`. A full-set import always creates a **new** set.

## Deployment

`render.yaml` deploys the API (Node web service) and the frontend (Angular static site) to
Render; Supabase stays hosted. See [`DEPLOY.md`](DEPLOY.md) for the full walkthrough (env
vars, the two-pass URL setup, and Supabase auth redirect URLs).

## Notes & known issues

- **Gemini key**: the backend reads `GEMINI_API_KEY` from the environment; `dotenv` does
  not override an existing shell var. Set it in `backend/.env` or your shell.
- **Soft delete + RLS**: SELECT policies use an owner branch without `deleted_at IS NULL`
  so owners can soft-delete their own rows (Postgres applies the SELECT policy as a check on
  the post-UPDATE row). See `supabase/migrations/0002_rls.sql`.
- **AI tools rely on the model returning valid JSON**: Prompt Review's audit parses model
  output defensively, but a weak model may occasionally fail — retry, or use a capable model.
- **Security advisory**: `markitdown-ts` pulls in a vulnerable `xlsx` (no upstream npm fix).
  Uploads come from authenticated users only; revisit if exposure widens.
- **Prompt/section deletes** within editors are hard deletes (template sub-parts); top-level
  prompt sets, runs, optimizer sessions, prompt-review sessions, and files are soft-deleted.
