import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import { PORT, FRONTEND_DIST } from './config.js';
import llmRouter from './routes/llm.js';
import lorebookRouter from './routes/lorebook.js';
import reviewRouter from './routes/review.js';
import promptsRouter from './routes/prompts.js';
import historyRouter from './routes/history.js';
import mediaRouter from './routes/media.js';
import settingsRouter from './routes/settings.js';

const app = express();
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3100',
    'http://127.0.0.1:3100',
  ],
}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

app.use('/api/llm', llmRouter);
app.use('/api/lorebooks', lorebookRouter);
app.use('/api/review', reviewRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/history', historyRouter);
app.use('/api/media', mediaRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Serve the built frontend in production.
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(FRONTEND_DIST + '/index.html');
  });
}

app.listen(PORT, () => {
  console.log(`[lorebook-creator] backend listening on http://localhost:${PORT}`);
});
