import type { ActivatedEntry, ChatMessage, Lorebook, LorebookEntry, LorebookSettings } from '../types.js';
import { getSettings } from '../settings.js';

/** Escape a string for use inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches a single key against the scanned text, honoring the entry's
 * caseSensitive / matchWholeWords overrides (falling back to lorebook defaults).
 */
export function keyMatches(key: string, text: string, entry: LorebookEntry): boolean {
  if (!key) return false;
  const caseSensitive = entry.caseSensitive ?? false;
  const wholeWords = entry.matchWholeWords ?? false;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? key : key.toLowerCase();
  if (wholeWords) {
    const pattern = new RegExp(`(^|\\b)${escapeRegExp(needle)}(\\b|$)`, caseSensitive ? 'g' : 'gi');
    return pattern.test(haystack);
  }
  return haystack.includes(needle);
}

/**
 * Scan recent conversation text and return activated entries.
 * Honours constant entries, probability, scan window and entry depth limits.
 */
export function scanLorebook(lorebook: Lorebook, settings: LorebookSettings, chatText: string): ActivatedEntry[] {
  const out: ActivatedEntry[] = [];
  const scanWindow = settings.scanWindowChars || 40000;
  const scanned = chatText.slice(-scanWindow);

  for (const [entryId, entry] of Object.entries(lorebook.entries || {})) {
    if (!entry.enabled || entry.disable) continue;
    if (entry.constant) {
      out.push({ entry, entryId, matchedKeys: [], score: Infinity });
      continue;
    }
    if (entry.useProbability && entry.probability < 100 && Math.random() * 100 > entry.probability) continue;

    const allKeys = [entry.key, ...(entry.keys || [])].filter(Boolean);
    const matchedKeys: string[] = [];
    for (const key of allKeys) {
      if (keyMatches(key, scanned, entry)) {
        matchedKeys.push(key);
        if (!entry.selective) break;
      }
    }
    if (matchedKeys.length === 0) continue;
    // selective logic: 0 = any, 1 = all, 2 = none
    if (entry.selective) {
      const hitCount = matchedKeys.length;
      if (entry.selectiveLogic === 1 && hitCount < allKeys.length) continue;
      if (entry.selectiveLogic === 2 && hitCount > 0) continue;
    }
    out.push({ entry, entryId, matchedKeys, score: matchedKeys.length });
  }

  // Sort: lower order number first; ties broken by more key matches, then key length.
  out.sort((a, b) => {
    if (a.entry.order !== b.entry.order) return a.entry.order - b.entry.order;
    if (a.score !== b.score) return b.score - a.score;
    return 0;
  });

  const max = settings.maxEntries || 0;
  return max > 0 ? out.slice(0, max) : out;
}

/**
 * Build the lorebook context string from activated entries.
 */
export function buildContextBlock(entries: ActivatedEntry[], settings: LorebookSettings): string {
  const parts: string[] = [];
  for (const { entry, matchedKeys } of entries) {
    let content = entry.content || '';
    if (settings.showKeys || entry.addMemo) {
      const keys = [...new Set([entry.key, ...matchedKeys].filter(Boolean))];
      if (keys.length) content = `${keys.join(', ')}: ${content}`;
    }
    if (content.trim()) parts.push(content.trim());
  }
  if (!parts.length) return '';
  const template = settings.template || '[Lorebook / World Info]';
  if (template.includes('{content}')) {
    return template.replace('{content}', parts.join('\n\n'));
  }
  return `${template}\n${parts.join('\n\n')}`;
}

/**
 * Assemble the lorebook block and the role/depth for injection into the message list.
 */
export function assembleLorebookContext(
  lorebook: Lorebook | null,
  chatText: string,
): { block: string; role: 'system' | 'user' | 'assistant'; depth: number } | null {
  if (!lorebook) return null;
  const settings = getSettings();
  const activated = scanLorebook(lorebook, settings.lorebook, chatText);
  const block = buildContextBlock(activated, settings.lorebook);
  if (!block) return null;
  return {
    block,
    role: settings.lorebook.role,
    depth: settings.lorebook.insertionDepth,
  };
}

export function roleOf(entry: LorebookEntry): 'system' | 'user' | 'assistant' {
  switch (entry.role) {
    case 1: return 'user';
    case 2: return 'assistant';
    default: return 'system';
  }
}

/** A debug preview of what will be activated for the current text. */
export function previewActivation(lorebook: Lorebook, chatText: string): {
  activated: ActivatedEntry[];
  block: string;
} {
  const settings = getSettings();
  const activated = scanLorebook(lorebook, settings.lorebook, chatText);
  const block = buildContextBlock(activated, settings.lorebook);
  return { activated, block };
}
