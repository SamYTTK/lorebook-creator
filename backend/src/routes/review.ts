import { Router, type Request, type Response } from 'express';
import { listPending, listAll, markApplied, markRejected, clearHistory, getStaged } from '../lorebook/review.js';
import { upsertEntry, deleteEntry } from '../lorebook/store.js';
import { getSettings } from '../settings.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ pending: listPending(), all: listAll() });
});

router.post('/:id/apply', (req: Request, res: Response) => {
  const change = getStaged(req.params.id);
  if (!change) return res.status(404).json({ error: 'Change not found' });
  if (change.status !== 'pending') return res.status(400).json({ error: `Change already ${change.status}` });

  try {
    if (change.type === 'delete') {
      deleteEntry(change.lorebookId, change.entryId!);
    } else {
      const patch = {
        ...change.proposed,
        key: change.proposed.key,
        keys: change.proposed.keys,
        content: change.proposed.content,
        comment: change.proposed.comment,
        order: change.proposed.order,
        constant: change.proposed.constant,
        enabled: change.proposed.enabled,
        depth: change.proposed.depth,
        addMemo: change.proposed.addMemo,
      };
      upsertEntry(change.lorebookId, change.type === 'update' ? change.entryId ?? null : null, patch);
    }
    markApplied(req.params.id);
    res.json({ ok: true, change: getStaged(req.params.id) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/:id/reject', (req: Request, res: Response) => {
  const change = getStaged(req.params.id);
  if (!change) return res.status(404).json({ error: 'Change not found' });
  markRejected(req.params.id);
  res.json({ ok: true, change: getStaged(req.params.id) });
});

router.post('/apply-all', (req: Request, res: Response) => {
  const changes = listPending();
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const change of changes) {
    try {
      if (change.type === 'delete') {
        deleteEntry(change.lorebookId, change.entryId!);
      } else {
        const patch = { ...change.proposed, key: change.proposed.key, keys: change.proposed.keys, content: change.proposed.content, comment: change.proposed.comment, order: change.proposed.order, constant: change.proposed.constant, enabled: change.proposed.enabled, depth: change.proposed.depth, addMemo: change.proposed.addMemo };
        upsertEntry(change.lorebookId, change.type === 'update' ? change.entryId ?? null : null, patch);
      }
      markApplied(change.id);
      results.push({ id: change.id, ok: true });
    } catch (err) {
      results.push({ id: change.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  res.json({ ok: true, results });
});

router.post('/clear-history', (req: Request, res: Response) => {
  clearHistory(false);
  res.json({ ok: true });
});

export default router;
