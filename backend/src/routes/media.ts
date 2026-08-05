import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { saveMedia, getMediaPath } from '../media/store.js';
import { MEDIA_DIR } from '../config.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const mime = (req.file.mimetype || 'application/octet-stream').split(';')[0];
    const attachment = saveMedia(req.file.buffer, mime, req.file.originalname);
    res.json(attachment);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/media/:filename', (req: Request, res: Response) => {
  const filePath = getMediaPath(req.params.filename);
  if (!filePath) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

router.get('/media-dir', (_req: Request, res: Response) => {
  res.json({ dir: MEDIA_DIR });
});

export default router;
