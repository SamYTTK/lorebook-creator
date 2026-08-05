import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..', '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const CHATS_DIR = path.join(DATA_DIR, 'chats');
export const LOREBOOKS_DIR = path.join(DATA_DIR, 'lorebooks');
export const PROMPTS_DIR = path.join(DATA_DIR, 'prompts');
export const REVIEW_DIR = path.join(DATA_DIR, 'review');
export const VIDEO_FRAMES_DIR = path.join(DATA_DIR, 'video-frames');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const PORT = Number(process.env.PORT || 3100);
export const FRONTEND_DIST = path.join(ROOT_DIR, 'frontend', 'dist');

for (const dir of [DATA_DIR, MEDIA_DIR, CACHE_DIR, CHATS_DIR, LOREBOOKS_DIR, PROMPTS_DIR, REVIEW_DIR, VIDEO_FRAMES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}
