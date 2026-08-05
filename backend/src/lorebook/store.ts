import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { LOREBOOKS_DIR, writeJson, readJson, slugify } from '../config.js';
import type { Lorebook, LorebookEntry } from '../types.js';

function fileFor(id: string): string {
  return path.join(LOREBOOKS_DIR, `${slugify(id)}.json`);
}

export function listLorebooks(): Array<{ id: string; name: string; description: string; entryCount: number; updatedAt: number }> {
  const files = fs.readdirSync(LOREBOOKS_DIR).filter((f) => f.endsWith('.json'));
  const out: Array<{ id: string; name: string; description: string; entryCount: number; updatedAt: number }> = [];
  for (const file of files) {
    try {
      const raw = readJson<Lorebook>(path.join(LOREBOOKS_DIR, file), { name: '', description: '', entries: {} });
      const id = path.basename(file, '.json');
      out.push({
        id,
        name: raw.name || id,
        description: raw.description || '',
        entryCount: Object.keys(raw.entries || {}).length,
        updatedAt: fs.statSync(path.join(LOREBOOKS_DIR, file)).mtimeMs,
      });
    } catch {
      // ignore corrupt files
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLorebook(id: string): Lorebook | null {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return null;
  const raw = readJson<Lorebook>(file, { name: '', description: '', entries: {} });
  raw.entries = raw.entries || {};
  return raw;
}

export function createLorebook(name: string, description = '', entries: Record<string, LorebookEntry> = {}): Lorebook {
  const id = slugify(name);
  if (!id) throw new Error('Lorebook needs a name');
  if (fs.existsSync(fileFor(id))) {
    // unique-ify the id
    return createLorebook(`${name} ${Date.now()}`, description, entries);
  }
  const lorebook: Lorebook = { name, description, entries };
  writeJson(fileFor(id), lorebook);
  return lorebook;
}

export function saveLorebook(id: string, lorebook: Lorebook): Lorebook {
  if (!lorebook.name) lorebook.name = id;
  writeJson(fileFor(id), lorebook);
  return lorebook;
}

export function deleteLorebook(id: string): boolean {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export function nextUid(lorebook: Lorebook): number {
  const uids = Object.values(lorebook.entries || {}).map((e) => e.uid || 0);
  return uids.length ? Math.max(...uids) + 1 : 0;
}

export function upsertEntry(id: string, entryId: string | null, entry: Partial<LorebookEntry> & { key?: string; keys?: string[]; content?: string }): Lorebook {
  const lorebook = getLorebook(id);
  if (!lorebook) throw new Error(`Lorebook '${id}' not found`);
  const eid = entryId || uuidv4();
  const existing = lorebook.entries[eid];
  const merged: LorebookEntry = {
    uid: existing?.uid ?? nextUid(lorebook),
    key: entry.key ?? existing?.key ?? '',
    keys: entry.keys ?? existing?.keys ?? [],
    comment: entry.comment ?? existing?.comment ?? '',
    content: entry.content ?? existing?.content ?? '',
    constant: entry.constant ?? existing?.constant ?? false,
    vectorized: entry.vectorized ?? existing?.vectorized ?? false,
    selective: entry.selective ?? existing?.selective ?? false,
    selectiveLogic: entry.selectiveLogic ?? existing?.selectiveLogic ?? 0,
    addMemo: entry.addMemo ?? existing?.addMemo ?? false,
    order: entry.order ?? existing?.order ?? 100,
    position: entry.position ?? existing?.position ?? 0,
    disable: entry.disable ?? existing?.disable ?? false,
    excludeRecursion: entry.excludeRecursion ?? existing?.excludeRecursion ?? false,
    preventRecursion: entry.preventRecursion ?? existing?.preventRecursion ?? false,
    delayUntilRecursion: entry.delayUntilRecursion ?? existing?.delayUntilRecursion ?? false,
    probability: entry.probability ?? existing?.probability ?? 100,
    useProbability: entry.useProbability ?? existing?.useProbability ?? true,
    depth: entry.depth ?? existing?.depth ?? 0,
    group: entry.group ?? existing?.group ?? '',
    groupOverride: entry.groupOverride ?? existing?.groupOverride ?? false,
    groupWeight: entry.groupWeight ?? existing?.groupWeight ?? 100,
    scanDepth: entry.scanDepth ?? existing?.scanDepth ?? null,
    caseSensitive: entry.caseSensitive ?? existing?.caseSensitive ?? null,
    matchWholeWords: entry.matchWholeWords ?? existing?.matchWholeWords ?? null,
    useGroupScoring: entry.useGroupScoring ?? existing?.useGroupScoring ?? null,
    automationId: entry.automationId ?? existing?.automationId ?? '',
    role: entry.role ?? existing?.role ?? 0,
    enabled: entry.enabled ?? existing?.enabled ?? true,
  };
  if (!merged.key && merged.keys.length) merged.key = merged.keys[0];
  if (!merged.keys.length && merged.key) merged.keys = [merged.key];
  lorebook.entries[eid] = merged;
  saveLorebook(id, lorebook);
  return lorebook;
}

export function deleteEntry(id: string, entryId: string): Lorebook {
  const lorebook = getLorebook(id);
  if (!lorebook) throw new Error(`Lorebook '${id}' not found`);
  delete lorebook.entries[entryId];
  saveLorebook(id, lorebook);
  return lorebook;
}

export function importLorebook(name: string, data: unknown): Lorebook {
  const st = data as { name?: string; description?: string; entries?: Record<string, unknown> };
  const entries: Record<string, LorebookEntry> = {};
  const rawEntries = st?.entries || {};
  let uidCounter = 0;
  for (const [key, raw] of Object.entries(rawEntries)) {
    const e = normalizeEntry(raw, uidCounter++);
    entries[key || uuidv4()] = e;
  }
  const bookName = st?.name || name;
  const lorebook = createLorebook(bookName, st?.description || '', entries);
  return lorebook;
}

export function normalizeEntry(raw: unknown, fallbackUid: number): LorebookEntry {
  const e = (raw || {}) as Partial<LorebookEntry>;
  return {
    uid: typeof e.uid === 'number' ? e.uid : fallbackUid,
    key: e.key ?? '',
    keys: Array.isArray(e.keys) ? e.keys : [],
    comment: e.comment ?? '',
    content: e.content ?? '',
    constant: !!e.constant,
    vectorized: !!e.vectorized,
    selective: !!e.selective,
    selectiveLogic: (e.selectiveLogic as 0 | 1 | 2) ?? 0,
    addMemo: e.addMemo ?? false,
    order: typeof e.order === 'number' ? e.order : 100,
    position: (e.position === 1 ? 1 : 0) as 0 | 1,
    disable: !!e.disable,
    excludeRecursion: !!e.excludeRecursion,
    preventRecursion: !!e.preventRecursion,
    delayUntilRecursion: !!e.delayUntilRecursion,
    probability: typeof e.probability === 'number' ? e.probability : 100,
    useProbability: e.useProbability ?? true,
    depth: typeof e.depth === 'number' ? e.depth : 0,
    group: e.group ?? '',
    groupOverride: !!e.groupOverride,
    groupWeight: typeof e.groupWeight === 'number' ? e.groupWeight : 100,
    scanDepth: e.scanDepth ?? null,
    caseSensitive: e.caseSensitive ?? null,
    matchWholeWords: e.matchWholeWords ?? null,
    useGroupScoring: e.useGroupScoring ?? null,
    automationId: e.automationId ?? '',
    role: (e.role as 0 | 1 | 2 | 3 | 4) ?? 0,
    enabled: e.enabled ?? true,
  };
}

export function exportLorebook(id: string): Lorebook {
  const lorebook = getLorebook(id);
  if (!lorebook) throw new Error(`Lorebook '${id}' not found`);
  return lorebook;
}
