import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { parseId, requireInt, requireString } from '../../lib/validate.js';
import * as service from './models.service.js';

/** AI models API: list / create / delete (owner-scoped via RLS). */
export function modelsRouter(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/models',
    asyncHandler(async (req, res) => {
      res.json(await service.listModels(req.supabase!));
    }),
  );

  router.post(
    '/models',
    asyncHandler(async (req, res) => {
      const input = {
        name: requireString(req.body?.name, 'name'),
        ai_model_provider_id: requireInt(req.body?.ai_model_provider_id, 'ai_model_provider_id'),
        api_key: requireString(req.body?.api_key, 'api_key'),
      };
      res.status(201).json(await service.createModel(req.supabase!, input));
    }),
  );

  router.delete(
    '/models/:id',
    asyncHandler(async (req, res) => {
      await service.deleteModel(req.supabase!, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  return router;
}
