import { Router, type Request, type Response } from 'express';
import { listSessions, getSession, createSession, saveSession, deleteSession, sessionToText, sessionToJson } from '../history/store.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ sessions: listSessions() });
});

router.get('/:id', (req: Request, res: Response) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

router.post('/', (req: Request, res: Response) => {
  const { title, model } = req.body as { title?: string; model?: string };
  const session = createSession(title || 'New Chat', model || '');
  res.json(session);
});

router.put('/:id', (req: Request, res: Response) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { title } = req.body as { title?: string };
  if (typeof title === 'string') session.title = title || 'Untitled';
  saveSession(session);
  res.json(session);
});

router.delete('/:id', (req: Request, res: Response) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/rename', (req: Request, res: Response) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { title } = req.body as { title?: string };
  session.title = title || 'Untitled';
  saveSession(session);
  res.json(session);
});

router.get('/:id/export', (req: Request, res: Response) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const format = req.query.format === 'txt' ? 'txt' : 'json';
  const title = session.title || session.id;
  const disposition = `attachment; filename="loredeck-export.${format}"; filename*=UTF-8''${encodeURIComponent(title)}.${format}`;
  if (format === 'txt') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', disposition);
    return res.send(sessionToText(session));
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', disposition);
  res.send(sessionToJson(session));
});

export default router;
