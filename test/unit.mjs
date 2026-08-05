// Unit tests for the pure lorebook scanner and prompt assembler.
// Requires a fresh backend build (backend/dist). Run: node test/unit.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'backend', 'dist');
const distURL = (p) => pathToFileURL(path.join(DIST, p)).href;

const { keyMatches, scanLorebook, buildContextBlock } = await import(distURL('lorebook/scanner.js'));
const { assembleMessages } = await import(distURL('prompts/assembler.js'));

let passed = 0;
let failed = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  \u2714 ${name}`); }
  else { failed++; failures.push(name); console.log(`  \u2718 ${name}${extra ? ' :: ' + extra : ''}`); }
}

function mkEntry(overrides = {}) {
  return {
    id: 'e1', key: '', keys: [], content: 'content', enabled: true, order: 100,
    ...overrides,
  };
}

const baseSettings = { scanWindowChars: 40000, maxEntries: 0, showKeys: false, template: '[Lorebook]', role: 'system', insertionDepth: 0 };

// ---- keyMatches ----
{
  const entry = mkEntry();
  ok(keyMatches('King', 'the king rules', entry) === true, 'case-insensitive match');
  ok(keyMatches('King', 'the King rules', { ...entry, caseSensitive: true }) === true, 'case-sensitive match ok');
  ok(keyMatches('king', 'the King rules', { ...entry, caseSensitive: true }) === false, 'case-sensitive mismatch');
  ok(keyMatches('king', 'the kingdom rules', { ...entry, matchWholeWords: true }) === false, 'whole-word: king != kingdom');
  ok(keyMatches('king', 'a king sits', { ...entry, matchWholeWords: true }) === true, 'whole-word: standalone king');
  ok(keyMatches('龙', '神龙传说', { ...entry, matchWholeWords: true }) === true, 'CJK whole-word matches anywhere');
  ok(keyMatches('café', 'a café opens', { ...entry, matchWholeWords: true }) === true, 'accented whole-word');
}

// ---- scanLorebook: selective logic ----
{
  // logic 2 = "none": activates when NO key is present
  const noneEntry = mkEntry({ id: 'none', key: 'forbidden', keys: ['forbidden', 'taboo'], selective: true, selectiveLogic: 2 });
  const lb = { id: 'lb', name: 't', description: '', entries: { none: noneEntry } };
  const activated = scanLorebook(lb, baseSettings, 'the text mentions nothing relevant');
  ok(activated.length === 1 && activated[0].entryId === 'none', 'selectiveLogic 2 (none) activates when key absent', JSON.stringify(activated));
  const suppressed = scanLorebook(lb, baseSettings, 'we discuss the forbidden topic');
  ok(suppressed.length === 0, 'selectiveLogic 2 (none) suppressed when key present');

  // logic 1 = "all": activates only when every key present
  const allEntry = mkEntry({ id: 'all', key: 'a', keys: ['a', 'b', 'c'], selective: true, selectiveLogic: 1 });
  const lb2 = { id: 'lb', name: 't', description: '', entries: { all: allEntry } };
  ok(scanLorebook(lb2, baseSettings, 'only a here').length === 0, 'selectiveLogic 1 (all) partial keys inactive');
  ok(scanLorebook(lb2, baseSettings, 'a and b and c').length === 1, 'selectiveLogic 1 (all) all keys active');

  // logic 0 / non-selective: any key
  const anyEntry = mkEntry({ id: 'any', key: 'a', keys: ['a', 'b'], selective: true, selectiveLogic: 0 });
  const lb3 = { id: 'lb', name: 't', description: '', entries: { any: anyEntry } };
  ok(scanLorebook(lb3, baseSettings, 'just b').length === 1, 'selectiveLogic 0 (any) activates on one key');

  // entry with no keys at all always activates
  const noKeys = mkEntry({ id: 'nk', key: '', keys: [] });
  const lb4 = { id: 'lb', name: 't', description: '', entries: { nk: noKeys } };
  ok(scanLorebook(lb4, baseSettings, 'anything').length === 1, 'entry with no keys activates');
}

// ---- buildContextBlock ----
{
  const block = buildContextBlock([
    { entry: mkEntry({ key: 'K1', content: 'One' }), entryId: 'e1', matchedKeys: ['K1'], score: 1 },
  ], baseSettings);
  ok(block === '[Lorebook]\nOne', 'context block uses template + content');
  const blockKeys = buildContextBlock([
    { entry: mkEntry({ key: 'K1', content: 'One' }), entryId: 'e1', matchedKeys: ['K1'], score: 1 },
  ], { ...baseSettings, showKeys: true });
  ok(blockKeys === '[Lorebook]\nK1: One', 'showKeys prefixes keys');
}

// ---- assembleMessages ----
{
  const history = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ];
  // macros + leading assistant clamp
  const blocks = [
    { id: 'b1', name: 'pre', content: '{user} vs {char} at {time} {newline}done', role: 'system', depth: 0, position: 0, injection: false, enabled: true, strip: false },
    { id: 'b2', name: 'inj', content: 'injected', role: 'assistant', depth: 0, position: 0, injection: true, enabled: true, strip: false },
  ];
  const out = assembleMessages(history, blocks);
  const first = out[0];
  ok(first.role === 'system', 'leading assistant injected block clamped to system', JSON.stringify(first));
  const rendered = first.content;
  ok(!/\{user\}|\{char\}|\{time\}|\{newline\}/.test(rendered), 'macros substituted', rendered);
  ok(rendered.includes('User vs Character'), 'user/char macro values', rendered);
  ok(rendered.includes('\ndone'), 'newline macro', rendered);
  ok(out.length === 4, 'system + injected + 2 history messages');

  // lorebook block inserted before injected prompt at same depth
  const out2 = assembleMessages(history, [{ id: 'b', name: 'inj', content: 'inj', role: 'user', depth: 1, position: 0, injection: true, enabled: true, strip: false }], {
    block: 'LOREBLOCK', role: 'system', depth: 1,
  });
  const idxLore = out2.findIndex((m) => m.content === 'LOREBLOCK');
  const idxInj = out2.findIndex((m) => m.content === 'inj');
  ok(idxLore !== -1 && idxInj !== -1 && idxLore < idxInj, 'lorebook precedes injected prompt at same depth');
  ok(out2[out2.length - 1].role === 'assistant' && out2[out2.length - 1].content === 'hello', 'history order preserved');

  // depth counted from end: depth 1 => injected after first history message
  const out3 = assembleMessages(history, [], { block: 'LORE', role: 'system', depth: 1 });
  ok(out3[1].content === 'LORE' && out3[2].content === 'hello', 'depth=1 injects before last history message', out3.map((m) => m.content).join('|'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('Failures:', failures.join(', ')); process.exit(1); }
