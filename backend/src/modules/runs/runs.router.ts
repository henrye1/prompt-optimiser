import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { createUserClient } from '../../supabase/client.js';
import { optionalBoolean, optionalString, parseId, requireInt, requireString } from '../../lib/validate.js';
import * as runs from './runs.service.js';
import * as files from './files.service.js';
import { executeRun } from './runExecution.service.js';
import { GoogleGeminiService } from '../gemini/gemini.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/** Runs API: create from a prompt set, upload files, execute against Gemini, view results. */
export function runsRouter(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/runs',
    asyncHandler(async (req, res) => {
      res.json(await runs.listRuns(req.supabase!, req.userId));
    }),
  );

  router.post(
    '/runs',
    asyncHandler(async (req, res) => {
      const input = {
        name: requireString(req.body?.name, 'name'),
        description: optionalString(req.body?.description, 'description'),
        prompt_set_id: requireInt(req.body?.prompt_set_id, 'prompt_set_id'),
      };
      res.status(201).json(await runs.createRun(req.supabase!, input));
    }),
  );

  router.get(
    '/runs/:id',
    asyncHandler(async (req, res) => {
      res.json(await runs.getRun(req.supabase!, parseId(req.params.id)));
    }),
  );

  router.patch(
    '/runs/:id',
    asyncHandler(async (req, res) => {
      const patch = {
        name: optionalString(req.body?.name, 'name'),
        description: optionalString(req.body?.description, 'description'),
        is_published: optionalBoolean(req.body?.is_published, 'is_published'),
      };
      res.json(await runs.updateRun(req.supabase!, parseId(req.params.id), patch));
    }),
  );

  router.delete(
    '/runs/:id',
    asyncHandler(async (req, res) => {
      await runs.softDeleteRun(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- Files ----
  router.get(
    '/runs/:id/files',
    asyncHandler(async (req, res) => {
      res.json(await files.listRunFiles(req.supabase!, parseId(req.params.id)));
    }),
  );

  router.post(
    '/runs/:id/files',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new HttpError(400, 'file is required');
      const runId = parseId(req.params.id);
      const result = await files.uploadRunFile(req.supabase!, req.userId!, runId, {
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
    '/files/:id',
    asyncHandler(async (req, res) => {
      await files.softDeleteRunFile(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  // ---- Execution ----
  router.post(
    '/runs/:id/execute',
    asyncHandler(async (req, res) => {
      const runId = parseId(req.params.id);
      // Confirm the run is visible/owned before kicking off background work.
      await runs.getRun(req.supabase!, runId);

      // Background client bound to the caller's token (outlives the request).
      const bgDb = createUserClient(req.accessToken!);
      const gemini = new GoogleGeminiService();
      void executeRun(bgDb, gemini, runId).catch((e) => {
        // eslint-disable-next-line no-console
        console.error(`Run ${runId} execution crashed:`, e);
      });

      res.status(202).json({ status: 'started' });
    }),
  );

  return router;
}
