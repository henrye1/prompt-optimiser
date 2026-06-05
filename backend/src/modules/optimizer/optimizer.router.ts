import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { optionalBoolean, optionalInt, parseId, requireInt, requireString } from '../../lib/validate.js';
import * as optimizer from './optimizer.service.js';
import { improveSection, runSection } from './optimizerExecution.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/** Optimizer API: tune a prompt set's sections in a session and save as a new version. */
export function optimizerRouter(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/optimizer-sessions',
    asyncHandler(async (req, res) => {
      res.json(await optimizer.listSessions(req.supabase!));
    }),
  );

  router.post(
    '/optimizer-sessions',
    asyncHandler(async (req, res) => {
      const input = {
        name: requireString(req.body?.name, 'name'),
        prompt_set_id: requireInt(req.body?.prompt_set_id, 'prompt_set_id'),
        ai_model_id: optionalInt(req.body?.ai_model_id, 'ai_model_id'),
      };
      res.status(201).json(await optimizer.createSession(req.supabase!, input));
    }),
  );

  router.get(
    '/optimizer-sessions/:id',
    asyncHandler(async (req, res) => {
      res.json(await optimizer.getSession(req.supabase!, parseId(req.params.id)));
    }),
  );

  router.patch(
    '/optimizer-sessions/:id',
    asyncHandler(async (req, res) => {
      const patch = {
        name: req.body?.name === undefined ? undefined : requireString(req.body?.name, 'name'),
        is_published: optionalBoolean(req.body?.is_published, 'is_published'),
      };
      res.json(await optimizer.updateSession(req.supabase!, parseId(req.params.id), patch));
    }),
  );

  router.delete(
    '/optimizer-sessions/:id',
    asyncHandler(async (req, res) => {
      await optimizer.softDeleteSession(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- files ----
  router.post(
    '/optimizer-sessions/:id/files',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new HttpError(400, 'file is required');
      const result = await optimizer.uploadSessionFile(req.supabase!, req.userId!, parseId(req.params.id), {
        buffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        runFileTypeId: req.body?.run_file_type_id ? Number(req.body.run_file_type_id) : 1,
        isExampleFile: req.body?.is_example_file === 'true',
      });
      res.status(201).json(result);
    }),
  );

  router.delete(
    '/optimizer-files/:id',
    asyncHandler(async (req, res) => {
      await optimizer.softDeleteFile(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- sections ----
  router.patch(
    '/optimizer-sections/:id',
    asyncHandler(async (req, res) => {
      const content = requireString(req.body?.current_content, 'current_content');
      res.json(await optimizer.updateSection(req.supabase!, parseId(req.params.id), content));
    }),
  );

  router.post(
    '/optimizer-sections/:id/run',
    asyncHandler(async (req, res) => {
      res.status(201).json(await runSection(req.supabase!, parseId(req.params.id)));
    }),
  );

  router.post(
    '/optimizer-sections/:id/improve',
    asyncHandler(async (req, res) => {
      const goal = requireString(req.body?.goal, 'goal');
      res.json(await improveSection(req.supabase!, parseId(req.params.id), goal));
    }),
  );

  // ---- save as a new prompt set version ----
  router.post(
    '/optimizer-sessions/:id/save-to-set',
    asyncHandler(async (req, res) => {
      res.status(201).json(await optimizer.saveToPromptSet(req.supabase!, parseId(req.params.id)));
    }),
  );

  return router;
}
