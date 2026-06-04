import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import {
  optionalBoolean,
  optionalInt,
  optionalString,
  parseId,
  requireInt,
  requireString,
} from '../../lib/validate.js';
import * as service from './promptsets.service.js';

/**
 * PromptSet editor API. Top-level prompt sets are soft-deleted; prompts and
 * sections (the template's editable sub-parts) are removed in place when editing.
 * All routes require auth and use the request-scoped RLS client.
 */
export function promptSetsRouter(): Router {
  const router = Router();
  router.use(requireAuth());

  // ---- Prompt sets ----
  router.get(
    '/prompt-sets',
    asyncHandler(async (req, res) => {
      res.json(await service.listPromptSets(req.supabase!, req.userId));
    }),
  );

  router.post(
    '/prompt-sets',
    asyncHandler(async (req, res) => {
      const name = requireString(req.body?.name, 'name');
      res.status(201).json(await service.createPromptSet(req.supabase!, name));
    }),
  );

  router.get(
    '/prompt-sets/:id',
    asyncHandler(async (req, res) => {
      res.json(await service.getPromptSet(req.supabase!, parseId(req.params.id)));
    }),
  );

  router.patch(
    '/prompt-sets/:id',
    asyncHandler(async (req, res) => {
      const patch = {
        name: optionalString(req.body?.name, 'name'),
        description: optionalString(req.body?.description, 'description'),
        is_published: optionalBoolean(req.body?.is_published, 'is_published'),
      };
      res.json(await service.updatePromptSet(req.supabase!, parseId(req.params.id), patch));
    }),
  );

  router.delete(
    '/prompt-sets/:id',
    asyncHandler(async (req, res) => {
      await service.softDeletePromptSet(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- JSON import ----
  router.post(
    '/prompt-sets/import',
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.importPromptSet(req.supabase!, req.body));
    }),
  );

  router.post(
    '/prompt-sets/:id/prompts/import',
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.importPrompt(req.supabase!, parseId(req.params.id), req.body));
    }),
  );

  router.post(
    '/prompts/:id/sections/import',
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.importSections(req.supabase!, parseId(req.params.id), req.body));
    }),
  );

  // ---- Prompts ----
  router.post(
    '/prompt-sets/:id/prompts',
    asyncHandler(async (req, res) => {
      const input = {
        name: requireString(req.body?.name, 'name'),
        prompt_type_id: requireInt(req.body?.prompt_type_id, 'prompt_type_id'),
        sequence: optionalInt(req.body?.sequence, 'sequence'),
      };
      res.status(201).json(await service.addPrompt(req.supabase!, parseId(req.params.id), input));
    }),
  );

  router.patch(
    '/prompts/:id',
    asyncHandler(async (req, res) => {
      const patch = {
        name: optionalString(req.body?.name, 'name'),
        prompt_type_id: optionalInt(req.body?.prompt_type_id, 'prompt_type_id'),
        sequence: optionalInt(req.body?.sequence, 'sequence'),
      };
      res.json(await service.updatePrompt(req.supabase!, parseId(req.params.id), patch));
    }),
  );

  router.delete(
    '/prompts/:id',
    asyncHandler(async (req, res) => {
      await service.deletePrompt(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- Sections ----
  router.post(
    '/prompts/:id/sections',
    asyncHandler(async (req, res) => {
      const input = {
        title: requireString(req.body?.title, 'title'),
        content: optionalString(req.body?.content, 'content'),
        sequence: optionalInt(req.body?.sequence, 'sequence'),
      };
      res.status(201).json(await service.addSection(req.supabase!, parseId(req.params.id), input));
    }),
  );

  router.patch(
    '/prompt-sections/:id',
    asyncHandler(async (req, res) => {
      const patch = {
        title: optionalString(req.body?.title, 'title'),
        content: optionalString(req.body?.content, 'content'),
        sequence: optionalInt(req.body?.sequence, 'sequence'),
      };
      res.json(await service.updateSection(req.supabase!, parseId(req.params.id), patch));
    }),
  );

  router.delete(
    '/prompt-sections/:id',
    asyncHandler(async (req, res) => {
      await service.deleteSection(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  return router;
}
