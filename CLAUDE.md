# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Prompt Optimiser: author reusable **PromptSets**, **run** them against an LLM (optionally feeding uploaded files as context), **compare** runs section-by-section, and **optimize** prompts in a tuning session. Login required; users see only their own data unless rows are **published**; all top-level deletes are **soft**.

Three independent npm projects, no root workspace:
- `backend/` — Express + TypeScript API (ESM)
- `frontend/` — Angular 21 (standalone components + signals)
- `supabase/` — SQL migrations, RLS, Storage bucket, local CLI config

## Commands

```bash
# Supabase (local stack on :54321) — run from repo root
npx supabase start          # boot Postgres/Auth/Storage, apply supabase/migrations
npx supabase status         # print API URL + anon/service_role keys
npx supabase db reset       # re-apply all migrations after editing them

# Backend (from backend/) — dev server on :3001 (set PORT=3001 in .env)
npm run dev                 # tsx watch; GET /health
npm run typecheck           # tsc --noEmit
npm test                    # vitest run
npx vitest run src/modules/runs/runExecution.service.test.ts   # single file
npx vitest run -t "name fragment"                              # single test by name

# Frontend (from frontend/) — dev server on :4300
npm start
npm run build
npm test                    # @angular/build:unit-test (vitest), jsdom
```

Backend needs `backend/.env` (copy `.env.example`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and typically `PORT=3001` / `CORS_ORIGIN=http://localhost:4300`. Note: `dotenv` does **not** override a var already set in your shell — an exported `GEMINI_API_KEY` wins over `.env`.

## Architecture

### Auth & RLS — the central security pattern
The **browser authenticates directly against Supabase** (email/password) and sends the JWT as a `Bearer` token to the backend. `requireAuth()` (`backend/src/middleware/auth.ts`) verifies the token and attaches a **per-request Supabase client bound to that token** (`req.supabase`) so `auth.uid()` resolves and **RLS enforces ownership/publish/soft-delete in Postgres**. Always use `req.supabase` for user-scoped data access. The service-role client (`createServiceClient`) bypasses RLS and is for admin/seed only — never to serve a user request. Background work (run execution) builds its own token-bound client via `createUserClient(req.accessToken)` so it outlives the request but still honors RLS.

Soft-delete subtlety: SELECT policies include an owner branch *without* `deleted_at IS NULL` so an owner can soft-delete their own row (Postgres re-checks the SELECT policy against the post-UPDATE row). See `supabase/migrations/0002_rls.sql`.

### LLM provider seam
All generation goes through the `LlmService` interface (`backend/src/modules/llm/llm.types.ts`). `llm.factory.ts` resolves the concrete service from the run's / session's selected `ai_model` row: an Anthropic provider → `AnthropicService`, anything else → `GoogleGeminiService`, using the model's stored `api_key`. If no model/key is set it **falls back to the server `GEMINI_API_KEY`**. To add a provider, implement `LlmService` and branch in `buildLlm`. The seam is injectable — tests pass a fake `llm` into `executeRun`.

### Prompt model → run model
`prompt_set` → `prompt` (typed `System` | `Assessment` | `Audit` via `prompt_type`) → `prompt_section`. At run time:
- All **System**-type sections (across the set, ordered) are concatenated into one `systemInstruction`.
- Every other section becomes its own `run_section` and its own generation call.

### Run execution (async + polling)
`POST /api/runs/:id/execute` returns **202 immediately** and kicks off `executeRun` in the background. It builds the system instruction + file context, then runs one generation call per section with **bounded concurrency (`pLimit`, CONCURRENCY=4)**, writing per-section `content`/status/`error_message`, appending to `run_log`, and aggregating the final run status + token totals. It is **safe to re-run**. The frontend **polls** the run detail endpoint for status. See `backend/src/modules/runs/runExecution.service.ts`.

### File → context pipeline
Uploads go to Supabase Storage (bucket `run-files`, default). On first use, `markitdown-ts` converts each file (PDF/Excel → markdown); the result is **cached** in `run_file.markdown_content` so re-runs skip conversion. Files are concatenated and prepended as `context`. (`markitdown-ts` pulls a vulnerable `xlsx`; uploads are authenticated-only.)

### Optimizer
Creating a session **snapshots** every section of a prompt set into editable `optimizer_section` rows (`original_content` + `current_content`). You tune `current_content` and test sections without touching the source set. `saveToPromptSet` writes the tuned prompts out as a **brand-new prompt_set (version + 1)** owned by the caller — the original is never mutated.

## Conventions

- **Backend is ESM (`"type": "module"`, NodeNext).** Relative imports must use the `.js` extension even for `.ts` files (e.g. `import { env } from './config/env.js'`). Omitting it breaks the build.
- **Routers/services per feature** under `backend/src/modules/<feature>/`: a `*.router.ts` (Express wiring, validation via `lib/validate.ts`) delegating to a `*.service.ts` (Supabase queries). Errors throw `HttpError`; `lib/supabaseError.ts` provides `throwOnError`/`requireFound`; the terminal `errorHandler` formats responses.
- **Frontend is standalone + signals**, lazy-loaded routes (`app.routes.ts`), guarded by `authGuard`. Each feature dir has component(s), a `*.service.ts`, and a `*.models.ts`. Landing route is `/runs`.
- **Reference tables are seeded with fixed IDs** in `0001_init.sql` (e.g. `run_status`: New=1, In-progress=2, Failed=3, Complete=4; `prompt_type`: Assessment, Audit, System; `run_file_type`). Code references these by description lookup or by the known constants in `runs.service.ts`.
- **Migrations are append-only and numbered** (`000N_*.sql`). Add a new file; don't edit applied ones (then `npx supabase db reset` locally).

## JSON import

PromptSets/prompts/sections can be imported from JSON; prompt type is referenced **by name** (`Assessment`/`Audit`/`System`), sequence follows array order. Examples in `samples/`. Endpoints: `POST /api/prompt-sets/import`, `POST /api/prompt-sets/:id/prompts/import`, `POST /api/prompts/:id/sections/import`. A full-set import always creates a **new** set.
