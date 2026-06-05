import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { optionalBoolean, optionalInt, optionalString, parseId, requireInt, requireString } from '../../lib/validate.js';
import * as pg from './promptReview.service.js';
import * as ai from './promptReviewAi.service.js';

/** Prompt Review API: edit a prompt set as one document, review/improve with AI, publish a new set. */
export function promptReviewRouter(): Router {
  const router = Router();
  router.use(requireAuth());

  // ---- sessions ----
  router.get(
    '/prompt-review-sessions',
    asyncHandler(async (req, res) => {
      res.json(await pg.listSessions(req.supabase!));
    }),
  );

  router.post(
    '/prompt-review-sessions',
    asyncHandler(async (req, res) => {
      const input = {
        name: requireString(req.body?.name, 'name'),
        source_prompt_set_id: optionalInt(req.body?.source_prompt_set_id, 'source_prompt_set_id'),
        ai_model_id: optionalInt(req.body?.ai_model_id, 'ai_model_id'),
      };
      res.status(201).json(await pg.createSession(req.supabase!, input));
    }),
  );

  router.get(
    '/prompt-review-sessions/:id',
    asyncHandler(async (req, res) => {
      res.json(await pg.getSession(req.supabase!, parseId(req.params.id)));
    }),
  );

  router.patch(
    '/prompt-review-sessions/:id',
    asyncHandler(async (req, res) => {
      const patch = {
        name: req.body?.name === undefined ? undefined : requireString(req.body?.name, 'name'),
        is_published: optionalBoolean(req.body?.is_published, 'is_published'),
      };
      res.json(await pg.updateSession(req.supabase!, parseId(req.params.id), patch));
    }),
  );

  router.delete(
    '/prompt-review-sessions/:id',
    asyncHandler(async (req, res) => {
      await pg.softDeleteSession(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- document: prompts ----
  router.post(
    '/prompt-review-sessions/:id/prompts',
    asyncHandler(async (req, res) => {
      res.status(201).json(await pg.addPrompt(req.supabase!, parseId(req.params.id)));
    }),
  );

  router.patch(
    '/prompt-review-prompts/:id',
    asyncHandler(async (req, res) => {
      const patch = {
        name: optionalString(req.body?.name, 'name'),
        prompt_type_id: optionalInt(req.body?.prompt_type_id, 'prompt_type_id'),
      };
      res.json(await pg.updatePrompt(req.supabase!, parseId(req.params.id), patch));
    }),
  );

  router.delete(
    '/prompt-review-prompts/:id',
    asyncHandler(async (req, res) => {
      await pg.deletePrompt(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- document: sections ----
  router.post(
    '/prompt-review-prompts/:id/sections',
    asyncHandler(async (req, res) => {
      res.status(201).json(await pg.addSection(req.supabase!, parseId(req.params.id)));
    }),
  );

  router.patch(
    '/prompt-review-sections/:id',
    asyncHandler(async (req, res) => {
      const patch = {
        title: optionalString(req.body?.title, 'title'),
        content: optionalString(req.body?.content, 'content'),
      };
      res.json(await pg.updateSection(req.supabase!, parseId(req.params.id), patch));
    }),
  );

  router.delete(
    '/prompt-review-sections/:id',
    asyncHandler(async (req, res) => {
      await pg.deleteSection(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- AI tools ----
  router.post(
    '/prompt-review-sessions/:id/review',
    asyncHandler(async (req, res) => {
      const { findings } = await ai.auditSession(req.supabase!, parseId(req.params.id));
      res.json({ findings, health: ai.health(findings) });
    }),
  );

  router.post(
    '/prompt-review-sections/:id/improve',
    asyncHandler(async (req, res) => {
      const goal = requireString(req.body?.goal, 'goal');
      res.json(await ai.improveSection(req.supabase!, parseId(req.params.id), goal));
    }),
  );

  router.post(
    '/prompt-review-sessions/:id/improve',
    asyncHandler(async (req, res) => {
      const goal = requireString(req.body?.goal, 'goal');
      res.json(await ai.improveDoc(req.supabase!, parseId(req.params.id), goal));
    }),
  );

  router.get(
    '/prompt-review-sessions/:id/restructure',
    asyncHandler(async (req, res) => {
      res.json(await ai.restructurePreview(req.supabase!, parseId(req.params.id)));
    }),
  );

  router.post(
    '/prompt-review-sessions/:id/restructure',
    asyncHandler(async (req, res) => {
      res.json(await ai.restructureApply(req.supabase!, parseId(req.params.id)));
    }),
  );

  // ---- publish as a new prompt set ----
  router.post(
    '/prompt-review-sessions/:id/publish',
    asyncHandler(async (req, res) => {
      const input = {
        name: requireString(req.body?.name, 'name'),
        description: optionalString(req.body?.description, 'description'),
        is_published: optionalBoolean(req.body?.is_published, 'is_published'),
      };
      res.status(201).json(await pg.publishToSet(req.supabase!, parseId(req.params.id), input));
    }),
  );

  return router;
}
