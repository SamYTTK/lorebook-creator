import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { PROMPTS_DIR, writeJson, readJson, slugify } from '../config.js';
import type { PromptBlock } from '../types.js';

export interface PromptPreset {
  id: string;
  name: string;
  blocks: PromptBlock[];
}

function fileFor(id: string): string {
  return path.join(PROMPTS_DIR, `${slugify(id)}.json`);
}

export function listPresets(): Array<{ id: string; name: string; blockCount: number; updatedAt: number }> {
  const files = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((file) => {
    const id = path.basename(file, '.json');
    const preset = readJson<PromptPreset>(path.join(PROMPTS_DIR, file), { id, name: id, blocks: [] });
    return {
      id,
      name: preset.name || id,
      blockCount: (preset.blocks || []).length,
      updatedAt: fs.statSync(path.join(PROMPTS_DIR, file)).mtimeMs,
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPreset(id: string): PromptPreset | null {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return null;
  const preset = readJson<PromptPreset>(file, { id, name: id, blocks: [] });
  preset.blocks = preset.blocks || [];
  return preset;
}

export function savePreset(id: string, preset: PromptPreset): PromptPreset {
  writeJson(fileFor(id), preset);
  return preset;
}

export function createPreset(name: string, blocks: PromptBlock[] = []): PromptPreset {
  const id = slugify(name) || `preset-${Date.now()}`;
  const preset: PromptPreset = { id, name, blocks };
  writeJson(fileFor(id), preset);
  return preset;
}

export function deletePreset(id: string): boolean {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

function normalizeBlock(raw: Record<string, unknown>, index: number): PromptBlock {
  const role = ['system', 'user', 'assistant'].includes(raw.role as string) ? (raw.role as PromptBlock['role']) : 'system';
  return {
    id: typeof raw.id === 'string' ? raw.id : uuidv4(),
    name: (raw.name as string) || '',
    content: (raw.content as string) ?? '',
    role,
    depth: typeof raw.depth === 'number' ? raw.depth : 4,
    position: (raw.position === 1 ? 1 : 0) as 0 | 1,
    injection: !!raw.injection,
    enabled: raw.enabled !== false,
    strip: raw.strip !== false,
  };
}

/**
 * Import a SillyTavern prompt preset. Supports both the modern
 * { name, messages: [...] } object format and the legacy bare array format.
 */
export function importPreset(name: string, data: unknown): PromptPreset {
  let blocks: PromptBlock[] = [];
  let presetName = name;

  if (Array.isArray(data)) {
    // legacy format
    blocks = data
      .filter((b) => b && typeof b === 'object')
      .map((b, i) => normalizeBlock(b as Record<string, unknown>, i));
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (obj.name) presetName = String(obj.name);
    if (Array.isArray(obj.messages)) {
      blocks = (obj.messages as unknown[])
        .filter((b) => b && typeof b === 'object')
        .map((b, i) => normalizeBlock(b as Record<string, unknown>, i));
    }
  }

  return createPreset(presetName, blocks);
}

export function exportPreset(id: string): PromptPreset {
  const preset = getPreset(id);
  if (!preset) throw new Error(`Preset '${id}' not found`);
  return preset;
}
