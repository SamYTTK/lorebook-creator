import { Router, type Request, type Response } from 'express';
import { getSettings, saveSettings, resetSettings } from '../settings.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(getSettings());
});

router.post('/', (req: Request, res: Response) => {
  const patch = req.body as Record<string, unknown>;
  // Never allow empty apiKey to silently wipe a configured one unless explicitly sent
  if (patch.api && typeof patch.api === 'object') {
    const api = patch.api as Record<string, unknown>;
    if (api.apiKey === '') delete api.apiKey;
    if (api.baseUrl === '') delete api.baseUrl;
    if (api.model === '') delete api.model;
  }
  const settings = saveSettings(patch);
  res.json(settings);
});

router.post('/reset', (_req: Request, res: Response) => {
  const settings = resetSettings();
  res.json(settings);
});

router.post('/validate-connection', async (req: Request, res: Response) => {
  try {
    const { baseUrl, apiKey } = req.body as { baseUrl?: string; apiKey?: string };
    const { listModels } = await import('../llm/client.js');
    const models = await listModels(baseUrl, apiKey);
    res.json({ ok: true, modelCount: models.length, models: models.slice(0, 50) });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
