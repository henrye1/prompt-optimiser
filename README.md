# Prompt Optimiser

A prompt runner / comparison system. Authour reusable **PromptSets**, **run** them against
the Gemini LLM (optionally feeding uploaded files as context), and **compare** two runs
section-by-section with LLM-drafted, editable commentary.

- Login required (Supabase Auth, email/password).
- You only see your own runs and comparisons unless they are **published**.
- All deletes are **soft**.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Angular 21 (standalone + signals) |
| Backend | Node + Express (TypeScript) |
| Auth / DB / Storage | Supabase (Postgres + Auth + Storage), RLS for ownership/publish |
| LLM | Gemini via `@google/genai` |
| File → text | `markitdown-ts` (PDF/Excel → markdown) |

## Layout

```
backend/    Express + TypeScript API (Gemini calls, file conversion, run orchestration)
frontend/   Angular app
supabase/   SQL migrations, seed, RLS, Storage bucket; CLI config (config.toml)
docs/       Design spec
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

### 3. Frontend

```bash
cd frontend
npm install
npm start                # http://localhost:4300
```

## Implementation phases

See `docs/superpowers/specs/` for the design. All phases implemented & verified
end-to-end against a live Supabase + Gemini:

0. ✅ Scaffold + Supabase schema (14 tables, RLS, storage bucket)
1. ✅ Auth (Supabase email/password) — guard, interceptor, JWT-verify middleware
2. ✅ PromptSets CRUD + editor (prompts/sections, reorder, publish)
3. ✅ Runs (file upload + markitdown + per-section Gemini execution, polling)
4. ✅ Comparisons (auto-paired sections, Gemini-drafted editable commentary)
5. ✅ Publish + Explore feed + soft-delete + per-user ownership (read-only for non-owners)

## Importing prompt sets from JSON

The Prompt Sets list has an **Import prompt set from JSON** button; the editor has
**Import prompt (+ sections)** and per-prompt **Import sections** buttons. Prompt type is
referenced by name (`Assessment` / `Audit` / `System`); sequence follows array order.
Runnable examples live in [`samples/`](samples):

- `sample-prompt-set.json` — a full set (System + Assessment + Audit prompts)
- `sample-prompt.json` — one prompt with sections (import into an existing set)
- `sample-sections.json` — sections to add to an existing prompt

Backend endpoints: `POST /api/prompt-sets/import`,
`POST /api/prompt-sets/:id/prompts/import`, `POST /api/prompts/:id/sections/import`.
A full-set import always creates a **new** set.

## Notes & known issues

- **Gemini key**: the backend reads `GEMINI_API_KEY` from the environment; `dotenv`
  does not override an existing shell var. Set it in `backend/.env` or your shell.
- **Soft delete + RLS**: SELECT policies use an owner branch without `deleted_at IS NULL`
  so owners can soft-delete their own rows (Postgres applies the SELECT policy as a
  check on the post-UPDATE row). See `supabase/migrations/0002_rls.sql`.
- **Security advisory**: `markitdown-ts` pulls in a vulnerable `xlsx` (no upstream npm
  fix). Uploads come from authenticated users only; revisit if exposure widens.
- **Prompt/section deletes** within the editor are hard deletes (template sub-parts);
  top-level prompt sets, runs, comparisons, and files are soft-deleted.
