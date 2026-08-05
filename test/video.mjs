// Video processing test: upload a video, send it in a chat message, and verify
// the mock receives image frames extracted by ffmpeg.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// generate a small test video with ffmpeg-static
const ffmpeg = execFileSync(process.execPath, ['-e', `import('ffmpeg-static').then(m => process.stdout.write(m.default))`], { encoding: 'utf8' }).trim();
const testVideo = path.join(__dirname, 'test-video.mp4');
execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '2', '-pix_fmt', 'yuv420p', testVideo], { stdio: 'ignore' });
console.log('test video generated:', fs.statSync(testVideo).size, 'bytes');

const mock = spawn(process.execPath, [path.join(__dirname, 'mock-openai.mjs')], { stdio: 'ignore' });
const backend = spawn(process.execPath, [path.join(ROOT, 'backend', 'dist', 'index.js')], { stdio: 'ignore' });
await sleep(1500);

const B = 'http://localhost:3100';
await (await fetch(`${B}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api: { baseUrl: 'http://localhost:3200/v1', apiKey: 'k', model: 'mock-plain', extraHeaders: {} } }) })).json();

let passed = 0, failed = 0;
const ok = (c, n, e) => { if (c) { passed++; console.log('  ✔', n); } else { failed++; console.log('  ✘', n, e || ''); } };

try {
  // upload video
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(testVideo)], { type: 'video/mp4' }), 'test-video.mp4');
  const att = await (await fetch(`${B}/api/media/upload`, { method: 'POST', body: form })).json();
  ok(att.kind === 'video', 'video uploaded', JSON.stringify(att));

  // send a message with the video attachment
  const res = await fetch(`${B}/api/llm/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'What do you see in this video?', attachments: [att], agent: false }),
  });
  const text = await res.text();
  const deltas = [...text.matchAll(/event: delta\ndata: (\{.*?\})\n\n/g)].map((m) => JSON.parse(m[1]).text).join('');
  console.log('  mock response:', deltas.trim());
  ok(!/error/i.test(text) || !/could not be processed/i.test(deltas), 'no video processing error');
  ok(/Media parts: [1-9]/.test(deltas), 'video converted to image frames', deltas.match(/Media parts: \d+/)?.[0]);
} catch (err) {
  ok(false, 'video test threw', err.message);
  console.error(err);
} finally {
  mock.kill(); backend.kill();
  try { fs.unlinkSync(testVideo); } catch { /* ignore */ }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
