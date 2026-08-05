import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { v4 as uuidv4 } from 'uuid';
import ffmpegPath from 'ffmpeg-static';
const FFMPEG_BIN = ffmpegPath as unknown as string | null;
import { MEDIA_DIR, VIDEO_FRAMES_DIR, CACHE_DIR, readJson, writeJson } from '../config.js';
import type { ContentPart, Attachment } from '../types.js';

const execFileAsync = promisify(execFile);

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/opus': 'opus',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export function kindForMime(mime: string): 'image' | 'audio' | 'video' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'other';
}

export function saveMedia(buffer: Buffer, mime: string, originalName: string): Attachment {
  const id = uuidv4();
  const ext = MIME_EXT[mime] || 'bin';
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, filename), buffer);
  return { id, kind: kindForMime(mime) as Attachment['kind'], mime, url: `/api/media/${filename}`, name: originalName || filename };
}

export function getMediaPath(filename: string): string | null {
  // prevent path traversal
  const clean = path.basename(filename);
  const file = path.join(MEDIA_DIR, clean);
  return fs.existsSync(file) ? file : null;
}

export function getMediaUrl(filename: string): string {
  return `/api/media/${path.basename(filename)}`;
}

export function readAsBase64(filePath: string): string {
  return fs.readFileSync(filePath).toString('base64');
}

export function mimeFromFile(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/opus',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  };
  return map[ext] || 'application/octet-stream';
}

const FRAME_CACHE_FILE = path.join(CACHE_DIR, 'video-frames.json');

function frameCache(): Record<string, string[]> {
  return readJson<Record<string, string[]>>(FRAME_CACHE_FILE, {});
}

function saveFrameCache(cache: Record<string, string[]>): void {
  writeJson(FRAME_CACHE_FILE, cache);
}

/**
 * Extract up to `maxFrames` frames from a video as data URLs.
 * Uses the bundled ffmpeg-static binary. Results are cached by file mtime.
 */
export async function extractVideoFrames(filePath: string, maxFrames = 4, maxDim = 768): Promise<string[]> {
  if (!FFMPEG_BIN) throw new Error('ffmpeg is not available in this build');
  const stat = fs.statSync(filePath);
  const cache = frameCache();
  const cacheKey = `${path.basename(filePath)}:${stat.mtimeMs}:${maxFrames}`;
  if (cache[cacheKey]) {
    return cache[cacheKey].map((f) => readAsBase64(path.join(VIDEO_FRAMES_DIR, f)));
  }

  const outDir = VIDEO_FRAMES_DIR;
  const prefix = `${path.basename(filePath, path.extname(filePath))}-${Date.now()}`;
  const fps = maxFrames >= 8 ? 2 : 1;
  const args = [
    '-i', filePath,
    '-vf', `fps=${fps},scale=${maxDim}:-1`,
    '-frames:v', String(maxFrames),
    '-q:v', '4',
    path.join(outDir, `${prefix}-%02d.jpg`),
  ];
  await execFileAsync(FFMPEG_BIN, args, { timeout: 120000 });

  const frames = fs.readdirSync(outDir)
    .filter((f) => f.startsWith(prefix))
    .sort()
    .map((f) => path.join(outDir, f));

  cache[cacheKey] = frames;
  saveFrameCache(cache);
  return frames.map((f) => readAsBase64(f));
}

/**
 * Build OpenAI content parts from an attachment. Videos become image sequences.
 */
export async function attachmentToParts(attachment: Attachment): Promise<ContentPart[]> {
  const filePath = getMediaPath(attachment.url.split('/').pop() || '');
  if (!filePath) return [{ type: 'text', text: `[media unavailable: ${attachment.name}]` }];

  if (attachment.kind === 'image') {
    return [{ type: 'image_url', image_url: { url: `data:${mimeFromFile(filePath)};base64,${readAsBase64(filePath)}` } }];
  }
  if (attachment.kind === 'audio') {
    const format = (attachment.mime.split('/')[1] || 'wav').replace('mpeg', 'mp3').replace('wave', 'wav').replace('x-wav', 'wav') as 'wav' | 'mp3' | 'ogg' | 'aac' | 'flac' | 'opus';
    return [{ type: 'input_audio', input_audio: { data: readAsBase64(filePath), format } }];
  }
  if (attachment.kind === 'video') {
    try {
      const frames = await extractVideoFrames(filePath);
      if (frames.length) {
        return frames.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }));
      }
    } catch (err) {
      return [{ type: 'text', text: `[video could not be processed: ${err instanceof Error ? err.message : String(err)}]` }];
    }
    return [{ type: 'text', text: `[video: ${attachment.name} (no frames extracted)]` }];
  }
  return [{ type: 'text', text: `[attachment: ${attachment.name}]` }];
}

/** Turn a HistoryMessage into model content (text + media parts). */
export async function historyMessageToContent(message: { content: string; attachments?: Attachment[] }): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];
  if (message.content) parts.push({ type: 'text', text: message.content });
  for (const att of message.attachments || []) {
    const mediaParts = await attachmentToParts(att);
    parts.push(...mediaParts);
  }
  return parts.length ? parts : [{ type: 'text', text: '...' }];
}
