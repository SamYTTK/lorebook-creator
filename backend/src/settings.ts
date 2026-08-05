import { readJson, writeJson, SETTINGS_FILE } from './config.js';
import type { AppSettings } from './types.js';

const defaultSettings: AppSettings = {
  api: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    extraHeaders: {},
  },
  params: {
    temperature: 1,
    top_p: 1,
    top_k: null,
    max_tokens: null,
    max_completion_tokens: null,
    presence_penalty: 0,
    frequency_penalty: 0,
    stop: null,
    seed: null,
    n: null,
    logit_bias: null,
    reasoning_effort: null,
  },
  lorebookId: null,
  systemPrompt: '',
  lorebook: {
    insertionDepth: 0,
    role: 'system',
    maxEntries: 0,
    template: '[Lorebook / World Info]',
    showKeys: true,
    scanWindowChars: 40000,
  },
  agent: {
    autonomy: 'collaborative',
    reviewRequired: true,
    maxTurns: 4,
    systemPrompt: '',
    enabledTools: [
      'lorebook_list_entries',
      'lorebook_get_entry',
      'lorebook_search_entries',
      'lorebook_create_entry',
      'lorebook_update_entry',
      'lorebook_delete_entry',
      'lorebook_bulk_upsert',
      'lorebook_get_context',
    ],
  },
  ui: {},
};

let cache: AppSettings | null = null;

type AnyRecord = Record<string, unknown>;

function deepMerge(base: AnyRecord, patch: AnyRecord): AnyRecord {
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const baseValue = base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) ? base[key] : {};
      base[key] = deepMerge(baseValue as AnyRecord, value as AnyRecord);
    } else if (value !== undefined) {
      base[key] = value;
    }
  }
  return base;
}

export function getSettings(): AppSettings {
  if (cache) return cache;
  const stored = readJson<AnyRecord>(SETTINGS_FILE, {});
  cache = deepMerge(structuredClone(defaultSettings) as unknown as AnyRecord, stored) as unknown as AppSettings;
  return cache!;
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const merged = deepMerge(
    structuredClone(current) as unknown as AnyRecord,
    patch as unknown as AnyRecord,
  ) as unknown as AppSettings;
  cache = merged;
  writeJson(SETTINGS_FILE, merged);
  return merged;
}

export function resetSettings(): AppSettings {
  cache = structuredClone(defaultSettings);
  writeJson(SETTINGS_FILE, cache);
  return cache!;
}
