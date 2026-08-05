// End-to-end integration test for the Lorebook Creator backend.
// Requires the mock OpenAI server (test/mock-openai.mjs) on :3200 and the
// backend on :3100. Run: node test/e2e.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✘ ${name}${extra ? ' :: ' + extra : ''}`); }
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  // ---- clean runtime data for deterministic results ----
  for (const sub of ['lorebooks', 'chats', 'review', 'prompts']) {
    const dir = path.join(ROOT, 'data', sub);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.json')) fs.unlinkSync(path.join(dir, f));
      }
    }
  }
  const settingsFile = path.join(ROOT, 'data', 'settings.json');
  if (fs.existsSync(settingsFile)) fs.unlinkSync(settingsFile);

  // ---- spawn servers ----
  console.log('Starting mock-openai on :3200 …');
  const mock = spawn(process.execPath, [path.join(__dirname, 'mock-openai.mjs')], { stdio: 'ignore' });
  console.log('Starting backend on :3100 …');
  const backend = spawn(process.execPath, [path.join(BACKEND, 'dist', 'index.js')], { cwd: BACKEND, stdio: 'ignore' });

  const ready = async (url, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(url); if (r.ok) return true; } catch { /* retry */ }
      await sleep(250);
    }
    return false;
  };

  try {
    if (!(await ready('http://localhost:3200/v1/models'))) throw new Error('mock did not start');
    if (!(await ready('http://localhost:3100/api/health'))) throw new Error('backend did not start');
    console.log('Both servers up.\n');

    const B = 'http://localhost:3100';

    // ---- point settings at mock ----
    await (await fetch(`${B}/api/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api: { baseUrl: 'http://localhost:3200/v1', apiKey: 'test-key', model: 'mock-plain', extraHeaders: {} } }),
    })).json();

    // models list
    {
      console.log('■ models');
      const r = await (await fetch(`${B}/api/llm/models`)).json();
      ok(Array.isArray(r.models) && r.models.includes('mock-reasoner'), 'GET /api/llm/models returns mock models', JSON.stringify(r).slice(0, 120));
    }

    // ---- lorebook CRUD ----
    let lorebookId = null;
    {
      console.log('\n■ lorebook CRUD');
      const created = await (await fetch(`${B}/api/lorebooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test World', description: 'e2e' }) })).json();
      lorebookId = created.id;
      ok(lorebookId === 'test-world', 'create lorebook', JSON.stringify(created).slice(0, 80));

      const entry = await (await fetch(`${B}/api/lorebooks/${lorebookId}/entries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: ['capital', 'Aerilon'], content: 'The capital of Aerilon is called Aria, a city of white towers.', comment: 'place', order: 50, constant: true }),
      })).json();
      ok(entry.ok === true && entry.entryId, 'add entry');

      const withEntry = await (await fetch(`${B}/api/lorebooks/${lorebookId}`)).json();
      ok(Object.keys(withEntry.entries).length === 1, 'entry persisted', `count=${Object.keys(withEntry.entries).length}`);

      await (await fetch(`${B}/api/lorebooks/select`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lorebookId }) })).json();
      const list = await (await fetch(`${B}/api/lorebooks`)).json();
      ok(list.currentId === lorebookId, 'select lorebook');

      const preview = await (await fetch(`${B}/api/lorebooks/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lorebookId, text: 'We walked to the capital of Aerilon.' }) })).json();
      ok(preview.activated.length === 1, 'preview activates entry on key match', JSON.stringify(preview.activated).slice(0, 100));

      const exportBook = await (await fetch(`${B}/api/lorebooks/export/${lorebookId}`)).json();
      ok(!!exportBook.entries && Object.keys(exportBook.entries).length === 1, 'export lorebook (ST format)');
    }

    // ---- prompt presets + ST import ----
    {
      console.log('\n■ prompt presets');
      const imported = await (await fetch(`${B}/api/prompts/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ST Preset', data: { name: 'ST Preset', messages: [
          { name: 'main', content: 'You are roleplaying. {{char}}', role: 'system', depth: 4, position: 0, injection: false, enabled: true, strip: true },
          { name: 'jail', content: 'Always stay in character.', role: 'user', depth: 1, position: 0, injection: true, enabled: true, strip: true },
        ] } }),
      })).json();
      ok(imported.id && imported.blocks.length === 2, 'import ST preset (modern format)');
      const legacy = await (await fetch(`${B}/api/prompts/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Legacy', data: [{ identifier: 'x', content: 'Legacy block', role: 'system', injection: false, enabled: true }] }),
      })).json();
      ok(legacy.blocks.length === 1, 'import ST preset (legacy array format)');
      await (await fetch(`${B}/api/prompts/select`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: imported.id }) })).json();
    }

    // ---- plain streaming chat ----
    let sessionId = null;
    let plainSessionId = null;
    {
      console.log('\n■ streaming chat (plain)');
      const res = await fetch(`${B}/api/llm/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello mock, tell me about the capital.', agent: false }),
      });
      const text = await res.text();
      const deltas = [...text.matchAll(/event: delta\ndata: (\{.*?\})\n\n/g)].map((m) => JSON.parse(m[1]).text).join('');
      const hasReasoning = /event: reasoning/.test(text);
      const hasFinal = /event: final/.test(text);
      ok(text.length > 0, 'got SSE body');
      ok(hasReasoning, 'reasoning events streamed');
      ok(hasFinal, 'final event sent');
      ok(/Hello from the mock/.test(deltas), 'content streamed correctly', deltas.slice(0, 80));
      sessionId = /event: final\ndata: \{"messageId":"([^"]+)"\}/.exec(text)?.[1];
      ok(!!sessionId, 'final carries messageId');
      const sessions = await (await fetch(`${B}/api/history`)).json();
      ok(sessions.sessions.length >= 1, 'session persisted');
      plainSessionId = sessions.sessions[0].id;
    }

    // ---- agent loop with tool calls + staging ----
    let stagedId = null;
    {
      console.log('\n■ agentic chat (tools + review staging)');
      // enable review + agent via settings
      await (await fetch(`${B}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: { autonomy: 'autonomous', reviewRequired: true, maxTurns: 3 } }) })).json();
      const res = await fetch(`${B}/api/llm/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'USE_TOOL: please create an entry for Testland.', agent: true }),
      });
      const text = await res.text();
      const toolResults = [...text.matchAll(/event: tool_call_result\ndata: (\{.*?\})\n\n/g)].map((m) => JSON.parse(m[1]));
      ok(toolResults.length === 1, 'tool_call_result emitted once', `got ${toolResults.length}`);
      ok(toolResults[0]?.staged === true, 'change staged (review required)', JSON.stringify(toolResults[0]).slice(0, 80));
      ok(/STAGED/.test(toolResults[0]?.result || ''), 'result mentions staging');
      ok(/event: turn/.test(text), 'agent turn events emitted');
      const agentDeltas = [...text.matchAll(/event: delta\ndata: (\{.*?\})\n\n/g)].map((m) => JSON.parse(m[1]).text).join('');
      ok(!agentDeltas.includes('Hello from the mock') && agentDeltas.includes('I called the tool'), 'second agent turn resolves tool call', agentDeltas.slice(0, 150));
      stagedId = /id=([a-f0-9-]+)/i.exec(toolResults[0]?.result || '')?.[1];

      const review = await (await fetch(`${B}/api/review`)).json();
      ok(review.pending.length === 1, 'review queue has pending change', `pending=${review.pending.length}`);
      ok(!!stagedId, 'staged id extracted');
    }

    // ---- review apply ----
    {
      console.log('\n■ review queue apply');
      if (stagedId) {
        const applied = await (await fetch(`${B}/api/review/${stagedId}/apply`, { method: 'POST' })).json();
        ok(applied.ok === true, 'apply staged change');
      } else {
        ok(false, 'apply staged change');
      }
      const book = await (await fetch(`${B}/api/lorebooks/${lorebookId}`)).json();
      const hasTestland = Object.values(book.entries).some((e) => e.key === 'Testland' || (e.keys || []).includes('Testland'));
      ok(hasTestland, 'entry committed to lorebook after approval', `entries=${Object.values(book.entries).map((e) => e.key).join(',')}`);
      const review2 = await (await fetch(`${B}/api/review`)).json();
      ok(review2.pending.length === 0, 'no pending after apply');
    }

    // ---- media upload ----
    {
      console.log('\n■ media upload');
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const form = new FormData();
      form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
      const att = await (await fetch(`${B}/api/media/upload`, { method: 'POST', body: form })).json();
      ok(att.id && att.kind === 'image', 'image uploaded', JSON.stringify(att).slice(0, 80));
      const fileRes = await fetch(`${B}${att.url}`);
      ok(fileRes.ok, 'image served back');
    }

    // ---- history export ----
    {
      console.log('\n■ history export');
      const sid = plainSessionId;
      const jsonRes = await (await fetch(`${B}/api/history/${sid}/export?format=json`)).text();
      ok(jsonRes.includes('"messages"'), 'export JSON');
      const txtRes = await (await fetch(`${B}/api/history/${sid}/export?format=txt`)).text();
      ok(txtRes.includes('---') && txtRes.includes('Hello from the mock'), 'export TXT');
    }

    // ---- settings round trip ----
    {
      console.log('\n■ settings');
      const s = await (await fetch(`${B}/api/settings`)).json();
      ok(s.api.baseUrl === 'http://localhost:3200/v1', 'settings persist baseUrl');
      ok(Array.isArray(s.agent.enabledTools) && s.agent.enabledTools.length > 0, 'agent tool permissions persist');
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failures.length) {
      console.log('FAILURES:\n - ' + failures.join('\n - '));
      process.exitCode = 1;
    }
  } finally {
    mock.kill();
    backend.kill();
  }
}

main().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
