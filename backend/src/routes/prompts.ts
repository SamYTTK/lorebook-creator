import { Router, type Request, type Response } from 'express';
import { listPresets, getPreset, savePreset, createPreset, deletePreset, importPreset, exportPreset } from '../prompts/preset.js';
import { getSettings, saveSettings } from '../settings.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ presets: listPresets(), activeId: getSettings().ui.activePromptPresetId ?? null });
});

router.get('/:id', (req: Request, res: Response) => {
  const preset = getPreset(req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset not found' });
  res.json(preset);
});

router.post('/', (req: Request, res: Response) => {
  const { name, blocks } = req.body as { name?: string; blocks?: import('../types.js').PromptBlock[] };
  if (!name) return res.status(400).json({ error: 'name is required' });
  const preset = createPreset(name, blocks || []);
  res.json(preset);
});

router.put('/:id', (req: Request, res: Response) => {
  const preset = getPreset(req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset not found' });
  const { name, blocks } = req.body as { name?: string; blocks?: import('../types.js').PromptBlock[] };
  if (typeof name === 'string') preset.name = name;
  if (Array.isArray(blocks)) preset.blocks = blocks;
  savePreset(req.params.id, preset);
  res.json(preset);
});

router.delete('/:id', (req: Request, res: Response) => {
  deletePreset(req.params.id);
  res.json({ ok: true });
});

router.post('/select', (req: Request, res: Response) => {
  const { id } = req.body as { id: string | null };
  const ui = { ...getSettings().ui, activePromptPresetId: id };
  saveSettings({ ui });
  res.json({ ok: true });
});

router.post('/import', (req: Request, res: Response) => {
  try {
    const { name, data } = req.body as { name?: string; data?: unknown };
    if (!data) return res.status(400).json({ error: 'data is required' });
    const preset = importPreset(name || 'Imported Preset', data);
    res.json(preset);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/export/:id', (req: Request, res: Response) => {
  try {
    res.json(exportPreset(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
