import { Router, type Request, type Response } from 'express';
import {
  listLorebooks, getLorebook, createLorebook, saveLorebook, deleteLorebook,
  upsertEntry, deleteEntry, importLorebook, exportLorebook, normalizeEntry,
} from '../lorebook/store.js';
import { previewActivation } from '../lorebook/scanner.js';
import { getSettings, saveSettings } from '../settings.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ lorebooks: listLorebooks(), currentId: getSettings().lorebookId });
});

router.get('/:id', (req: Request, res: Response) => {
  const lorebook = getLorebook(req.params.id);
  if (!lorebook) return res.status(404).json({ error: 'Lorebook not found' });
  res.json(lorebook);
});

router.post('/', (req: Request, res: Response) => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name) return res.status(400).json({ error: 'name is required' });
  const lorebook = createLorebook(name, description || '');
  res.json(lorebook);
});

router.put('/:id', (req: Request, res: Response) => {
  const existing = getLorebook(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Lorebook not found' });
  const { name, description } = req.body as { name?: string; description?: string };
  if (typeof name === 'string') existing.name = name;
  if (typeof description === 'string') existing.description = description;
  saveLorebook(req.params.id, existing);
  res.json(existing);
});

router.delete('/:id', (req: Request, res: Response) => {
  const ok = deleteLorebook(req.params.id);
  const settings = getSettings();
  if (settings.lorebookId === req.params.id) {
    saveSettings({ lorebookId: null });
  }
  res.json({ ok });
});

router.post('/select', (req: Request, res: Response) => {
  const { id } = req.body as { id: string | null };
  if (id && !getLorebook(id)) return res.status(404).json({ error: 'Lorebook not found' });
  saveSettings({ lorebookId: id });
  res.json({ ok: true, lorebookId: id });
});

// Preview which entries activate for a given text
router.post('/preview', (req: Request, res: Response) => {
  const { id, text } = req.body as { id?: string; text?: string };
  const lorebookId = id ?? getSettings().lorebookId;
  const lorebook = lorebookId ? getLorebook(lorebookId) : null;
  if (!lorebook) return res.status(404).json({ error: 'Lorebook not found' });
  res.json(previewActivation(lorebook, text || ''));
});

router.post('/:id/entries', (req: Request, res: Response) => {
  try {
    const entry = req.body as Partial<import('../types.js').LorebookEntry>;
    const lorebook = upsertEntry(req.params.id, null, entry);
    const entries = Object.entries(lorebook.entries);
    const eid = entries[entries.length - 1]?.[0];
    res.json({ ok: true, entryId: eid, lorebook });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/:id/entries/:entryId', (req: Request, res: Response) => {
  try {
    const entry = req.body as Partial<import('../types.js').LorebookEntry>;
    const lorebook = upsertEntry(req.params.id, req.params.entryId, entry);
    res.json({ ok: true, lorebook });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete('/:id/entries/:entryId', (req: Request, res: Response) => {
  try {
    const lorebook = deleteEntry(req.params.id, req.params.entryId);
    res.json({ ok: true, lorebook });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/import', (req: Request, res: Response) => {
  try {
    const { name, data } = req.body as { name?: string; data?: unknown };
    if (!data) return res.status(400).json({ error: 'data is required' });
    const lorebook = importLorebook(name || 'Imported Lorebook', data);
    res.json(lorebook);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/export/:id', (req: Request, res: Response) => {
  try {
    const lorebook = exportLorebook(req.params.id);
    res.json(lorebook);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/validate', (req: Request, res: Response) => {
  try {
    const { data } = req.body as { data?: unknown };
    if (!data || typeof data !== 'object' || !(data as { entries?: unknown }).entries) {
      return res.json({ valid: false, reason: 'Not a lorebook: missing "entries" object.' });
    }
    const entries = (data as { entries: Record<string, unknown> }).entries;
    let count = 0;
    for (const raw of Object.values(entries)) {
      normalizeEntry(raw, count);
      count++;
    }
    res.json({ valid: true, entryCount: count });
  } catch (err) {
    res.json({ valid: false, reason: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
