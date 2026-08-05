import type { ChatMessage, LorebookEntry, StagedChange } from '../types.js';
import { getSettings } from '../settings.js';
import { getLorebook, upsertEntry, deleteEntry } from '../lorebook/store.js';
import { previewActivation } from '../lorebook/scanner.js';
import { addStaged } from '../lorebook/review.js';

export interface ToolContext {
  /** Text of the conversation up to now, for context scans. */
  chatText: string;
  /** Current history (for reasoning about the scene). */
  history: ChatMessage[];
  /** Per-request override of the settings reviewRequired flag. */
  reviewRequired?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function summarizeEntries(entries: Array<[string, LorebookEntry]>, limit = 50): string {
  const rows = entries.slice(0, limit).map(([id, e]) => {
    const keys = [...new Set([e.key, ...(e.keys || [])].filter(Boolean))].join(', ');
    return `- id=${id} | keys="${keys}" | order=${e.order} | enabled=${e.enabled} | ${(e.comment || e.content).slice(0, 80)}`;
  });
  return rows.join('\n') || '(empty lorebook)';
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'lorebook_list_entries',
    description: 'List all entries in the current lorebook with their keys, order and comments.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'lorebook_get_entry',
    description: 'Get the full content of a single lorebook entry by id.',
    parameters: {
      type: 'object',
      properties: { entry_id: { type: 'string', description: 'The entry id (uuid).' } },
      required: ['entry_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'lorebook_search_entries',
    description: 'Full-text search entries by key or content. Returns matching entries.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Text to search for.' }, limit: { type: 'number', description: 'Max results (default 20).' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'lorebook_create_entry',
    description: 'Create a new lorebook entry. Provide trigger keys and the world info content.',
    parameters: {
      type: 'object',
      properties: {
        keys: { type: 'array', items: { type: 'string' }, description: 'Trigger keys that activate the entry. Primary key first.' },
        content: { type: 'string', description: 'The world info content shown to the model when activated.' },
        comment: { type: 'string', description: 'A human-readable description of the entry (not shown to the model).' },
        order: { type: 'number', description: 'Sort priority, lower = earlier in context (default 100).' },
        constant: { type: 'boolean', description: 'Always inject regardless of keys (default false).' },
        enabled: { type: 'boolean', description: 'Whether the entry is active (default true).' },
      },
      required: ['keys', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'lorebook_update_entry',
    description: 'Update fields of an existing entry (keys, content, comment, order, constant, enabled, depth, addMemo). Only provided fields change.',
    parameters: {
      type: 'object',
      properties: {
        entry_id: { type: 'string', description: 'The entry id (uuid).' },
        keys: { type: 'array', items: { type: 'string' } },
        content: { type: 'string' },
        comment: { type: 'string' },
        order: { type: 'number' },
        constant: { type: 'boolean' },
        enabled: { type: 'boolean' },
        depth: { type: 'number' },
        addMemo: { type: 'boolean' },
      },
      required: ['entry_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'lorebook_delete_entry',
    description: 'Delete an entry from the lorebook by id.',
    parameters: {
      type: 'object',
      properties: { entry_id: { type: 'string' } },
      required: ['entry_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'lorebook_bulk_upsert',
    description: 'Create or update many entries in one call. Each item needs keys and content; include entry_id to update an existing entry.',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entry_id: { type: 'string' },
              keys: { type: 'array', items: { type: 'string' } },
              content: { type: 'string' },
              comment: { type: 'string' },
              order: { type: 'number' },
              constant: { type: 'boolean' },
            },
            required: ['keys', 'content'],
          },
        },
      },
      required: ['entries'],
      additionalProperties: false,
    },
  },
  {
    name: 'lorebook_get_context',
    description: "Show exactly which entries are currently activated for the recent conversation and the resulting context block the model sees.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: string; staged?: StagedChange }> {
  const settings = getSettings();
  const lorebookId = settings.lorebookId;
  if (!lorebookId) {
    return { result: 'ERROR: No lorebook selected. The user must create or select a lorebook first.' };
  }
  const lorebook = getLorebook(lorebookId);
  if (!lorebook) {
    return { result: 'ERROR: Current lorebook not found on disk.' };
  }

  const reviewRequired = ctx.reviewRequired ?? settings.agent.reviewRequired;
  const entries = Object.entries(lorebook.entries);
  const stage = (type: StagedChange['type'], entryId: string | undefined, proposed: Partial<LorebookEntry> & { keys: string[]; content: string; key: string }, previous?: Partial<LorebookEntry>): StagedChange | null => {
    if (!reviewRequired) return null;
    return addStaged({
      lorebookId,
      type,
      entryId,
      proposed,
      previous,
      reason: name,
    });
  };

  switch (name) {
    case 'lorebook_list_entries': {
      return { result: summarizeEntries(entries) };
    }
    case 'lorebook_get_entry': {
      const id = String(args.entry_id ?? '');
      const entry = lorebook.entries[id];
      if (!entry) return { result: `ERROR: no entry with id=${id}` };
      return { result: JSON.stringify({ id, keys: [...new Set([entry.key, ...(entry.keys || [])])], comment: entry.comment, content: entry.content, order: entry.order, constant: entry.constant, enabled: entry.enabled }, null, 2) };
    }
    case 'lorebook_search_entries': {
      const query = String(args.query ?? '').toLowerCase();
      const limit = typeof args.limit === 'number' ? args.limit : 20;
      const hits = entries.filter(([, e]) => {
        const haystack = [e.key, ...(e.keys || []), e.content, e.comment].join(' ').toLowerCase();
        return haystack.includes(query);
      });
      return { result: summarizeEntries(hits, limit) || '(no matches)' };
    }
    case 'lorebook_create_entry': {
      const keys = Array.isArray(args.keys) ? args.keys.map(String).filter(Boolean) : [];
      const content = String(args.content ?? '');
      if (!keys.length || !content) return { result: 'ERROR: keys and content are required.' };
      const proposed: Partial<LorebookEntry> & { keys: string[]; content: string; key: string } = {
        key: keys[0],
        keys,
        content,
        comment: String(args.comment ?? ''),
        order: typeof args.order === 'number' ? args.order : 100,
        constant: args.constant === true,
        enabled: args.enabled !== false,
      };
      const staged = stage('create', undefined, proposed);
      if (staged) {
        return { result: `CHANGE STAGED for review (id=${staged.id}): a new entry with keys [${keys.join(', ')}] will be created once the user approves it. Tell the user it is pending approval.`, staged };
      }
      const book = upsertEntry(lorebookId, null, proposed);
      const created = Object.values(book.entries).at(-1)!;
      const eid = Object.keys(book.entries).find((k) => book.entries[k] === created)!;
      return { result: `Created entry id=${eid} keys=[${keys.join(', ')}].` };
    }
    case 'lorebook_update_entry': {
      const id = String(args.entry_id ?? '');
      if (!lorebook.entries[id]) return { result: `ERROR: no entry with id=${id}` };
      const existing = lorebook.entries[id];
      const patch: Partial<LorebookEntry> = {};
      if (Array.isArray(args.keys)) { patch.keys = args.keys.map(String).filter(Boolean); patch.key = patch.keys[0] ?? ''; }
      if (typeof args.content === 'string') patch.content = args.content;
      if (typeof args.comment === 'string') patch.comment = args.comment;
      if (typeof args.order === 'number') patch.order = args.order;
      if (typeof args.constant === 'boolean') patch.constant = args.constant;
      if (typeof args.enabled === 'boolean') patch.enabled = args.enabled;
      if (typeof args.depth === 'number') patch.depth = args.depth;
      if (typeof args.addMemo === 'boolean') patch.addMemo = args.addMemo;
      const proposed = { ...existing, ...patch };
      const staged = stage('update', id, proposed as typeof proposed & { keys: string[]; content: string; key: string }, existing);
      if (staged) {
        return { result: `CHANGE STAGED for review (id=${staged.id}): updates to entry ${id} will be applied once approved.`, staged };
      }
      upsertEntry(lorebookId, id, patch);
      return { result: `Updated entry id=${id}.` };
    }
    case 'lorebook_delete_entry': {
      const id = String(args.entry_id ?? '');
      if (!lorebook.entries[id]) return { result: `ERROR: no entry with id=${id}` };
      const staged = stage('delete', id, { key: '', keys: [], content: '' }, { ...lorebook.entries[id] });
      if (staged) {
        return { result: `CHANGE STAGED for review (id=${staged.id}): deletion of entry ${id} will be applied once approved.`, staged };
      }
      deleteEntry(lorebookId, id);
      return { result: `Deleted entry id=${id}.` };
    }
    case 'lorebook_bulk_upsert': {
      const items = Array.isArray(args.entries) ? (args.entries as Array<Record<string, unknown>>) : [];
      if (!items.length) return { result: 'ERROR: entries array is required.' };
      const results: string[] = [];
      for (const item of items) {
        const keys = Array.isArray(item.keys) ? item.keys.map(String).filter(Boolean) : [];
        const content = String(item.content ?? '');
        if (!keys.length || !content) { results.push('SKIPPED an item without keys/content'); continue; }
        const proposed: Partial<LorebookEntry> & { keys: string[]; content: string; key: string } = {
          key: keys[0], keys, content,
          comment: String(item.comment ?? ''),
          order: typeof item.order === 'number' ? item.order : 100,
          constant: item.constant === true,
        };
        const id = typeof item.entry_id === 'string' ? item.entry_id : undefined;
        const staged = stage(id ? 'update' : 'create', id, proposed, id ? { ...lorebook.entries[id] } : undefined);
        if (staged) { results.push(`STAGED (${staged.id}): ${id ? `update ${id}` : `new entry [${keys.join(', ')}]`}`); continue; }
        const book = upsertEntry(lorebookId, id || null, proposed);
        if (id) {
          results.push(`Updated ${id} keys=[${keys.join(', ')}]`);
          continue;
        }
        const created = Object.values(book.entries).at(-1)!;
        const eid = Object.keys(book.entries).find((k) => book.entries[k] === created)!;
        results.push(`Created ${eid} keys=[${keys.join(', ')}]`);
      }
      return { result: results.join('\n') };
    }
    case 'lorebook_get_context': {
      const { activated, block } = previewActivation(lorebook, ctx.chatText);
      const list = activated.map((a) => `- ${a.entryId} keys=[${a.matchedKeys.join(', ') || a.entry.key}] order=${a.entry.order}`).join('\n');
      return { result: `Activated entries (${activated.length}):\n${list || '(none)'}\n\nContext block:\n${block || '(empty)'}` };
    }
    default:
      return { result: `ERROR: unknown tool ${name}` };
  }
}
