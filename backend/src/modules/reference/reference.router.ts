import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { throwOnError } from '../../lib/supabaseError.js';

/** Read-only reference/lookup tables used to populate editor dropdowns. */
export function referenceRouter(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/reference/prompt-types',
    asyncHandler(async (req, res) => {
      const { data, error } = await req
        .supabase!.from('prompt_type')
        .select('id, description')
        .order('id');
      throwOnError(error, 'List prompt types');
      res.json(data ?? []);
    }),
  );

  router.get(
    '/reference/run-file-types',
    asyncHandler(async (req, res) => {
      const { data, error } = await req
        .supabase!.from('run_file_type')
        .select('id, description')
        .order('id');
      throwOnError(error, 'List run file types');
      res.json(data ?? []);
    }),
  );

  router.get(
    '/reference/ai-model-providers',
    asyncHandler(async (req, res) => {
      const { data, error } = await req
        .supabase!.from('ai_model_provider')
        .select('id, name')
        .order('id');
      throwOnError(error, 'List AI model providers');
      res.json(data ?? []);
    }),
  );

  return router;
}
