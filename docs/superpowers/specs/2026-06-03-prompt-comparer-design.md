# Prompt Comparer — Design & Implementation Plan

> Approved design spec (copied from the brainstorming/plan session on 2026-06-03).

## Context

We are building a **prompt runner / comparison system** from scratch.

Users author reusable **PromptSets**, **run** them against the Gemini LLM (optionally
feeding uploaded files as context), and **compare** two runs section-by-section with
LLM-drafted, editable commentary. Login is required; users only see their own runs and
comparisons unless they are **published**. All deletes are **soft**.

The base schema (`db_architecture_base.md`) was modeled around financial "Assessments".
We generalize it: an **Assessment becomes a generic Run**, file types are
generic/configurable, and the whole stack unifies on **Supabase** (which cleanly satisfies
the doc's "integer IDs from 1" and "supabase container" notes).

## Resolved Decisions

| Concern | Decision |
|---|---|
| Domain | General-purpose runner. `Assessment` → `Run` (and `Run*` children). File types generic/configurable. |
| Auth | Supabase Auth, email/password. |
| Database | Supabase Postgres. Integer **serial** PKs starting at 1. Ownership/publish via **RLS**. |
| File storage | Supabase Storage (private bucket, per-user paths). |
| Backend | Standalone **Node + Express** (TypeScript). Holds Gemini key, orchestration + file conversion. |
| Frontend | **Angular 21**, Supabase JS client for auth, HTTP to Express. |
| LLM | Gemini via `@google/genai`. Model configurable via env. |
| File → text | `markitdown-ts` (`convertBuffer(buffer, {file_extension})` → `result.markdown`). Markdown cached on the file row. |
| Run execution | **Independent per-section Gemini calls** (parallel, bounded concurrency). System-type prompt sections form the system instruction; file markdown is shared context. |
| Comparison | Gemini **drafts** per-section commentary; user can **edit & save**. |
| Deletes | Soft (`deleted_at timestamptz`). All reads filter `deleted_at IS NULL`. |

## Data Model (Postgres, integer serial PKs from 1)

`created_by` columns are `uuid` → `auth.users(id)`. Entity PKs are `int`.

**Reference / static tables (seeded):** `prompt_type` (Assessment, Audit, System);
`run_status` / `run_section_status` (New, In-progress, Failed, Complete);
`run_file_type` (Document, Spreadsheet, Example — extensible).

**Prompt template:** `prompt_set` → `prompt` (typed) → `prompt_section` (ordered).

**Run (was Assessment):** `run` → `run_section` (LLM output + status + sequence),
`run_file` (storage_path + cached markdown), `run_log`.

**Comparison:** `run_comparison` → `run_comparison_run` (join, 2+ runs),
`run_comparison_section` (A/B section pairing + editable commentary).

**RLS** on `prompt_set`, `run`, `run_comparison` + children:
- SELECT: `created_by = auth.uid()` OR `is_published`, AND `deleted_at IS NULL`.
- INSERT/UPDATE: owner only. Hard DELETE not granted (deletes are soft).
- Children derive access from their owning parent.

## Backend (Express + TypeScript)

Layered `routes → controllers → services → repositories`. Per-request Supabase client built
from the caller's JWT so RLS applies; service-role only for admin/seed. Modules: `promptsets`,
`prompts`, `runs`, `files`, `comparisons`, `gemini`, `supabase`.

Run orchestration (`POST /runs/:id/execute`, background): build run_sections from the
PromptSet → convert files to markdown (cached) → assemble System-prompt instruction →
independent bounded-concurrency Gemini call per section → write output/status/logs →
aggregate run status. Client polls for progress.

Comparison: default-pair matching sections, Gemini drafts commentary, user edits/saves/regenerates.

## Frontend (Angular)

Supabase JS for auth (login/register, guard, token interceptor). Feature areas: PromptSets
editor, Runs (create/upload/execute/view with polling), Comparisons (pair + editable
commentary), Explore (published, read-only). Lightweight services + signals (no NgRx).

## Implementation Phases

0. Scaffold & Supabase schema.
1. Auth (Supabase email/password).
2. PromptSets CRUD + editor.
3. Runs (file upload + markitdown + per-section Gemini execution).
4. Comparisons (Gemini-drafted editable commentary).
5. Publish + soft-delete polish + end-to-end RLS verification.

TDD throughout (test-first).

## Open Items / Notes

- Gemini model + API key are backend env config (default `gemini-2.5-flash`).
- Run execution is in-process async with polling for v1; job queue/SSE deferred.
- `run_file_type` seeded generically and user-extensible.
