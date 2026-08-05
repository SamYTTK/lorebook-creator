import type { ChatMessage, PromptBlock } from '../types.js';

export interface LorebookContextInput {
  block: string;
  role: 'system' | 'user' | 'assistant';
  depth: number;
}

/**
 * Assemble the final message array sent to the model.
 *
 * Mirrors SillyTavern prompt manager semantics:
 *  - non-injected blocks become leading system-ish messages ordered by depth/position
 *  - injected blocks are woven into the conversation at `depth` counted from the end
 *    (depth 0 = right after the last history message; insertion index = len - depth)
 *  - position 0 = top of the depth group, 1 = bottom
 *  - lorebook context is injected like an injected block at its configured depth
 */
export function assembleMessages(
  history: ChatMessage[],
  blocks: PromptBlock[],
  lorebook?: LorebookContextInput | null,
): ChatMessage[] {
  const out: ChatMessage[] = [];

  const strip = (s: string) => s.replace(/^\s+|\s+$/g, '');

  // ST-style macros advertised in the UI: {user}, {char}, {time}, {newline}.
  const render = (content: string): string => content
    .replace(/\{user\}/gi, 'User')
    .replace(/\{char\}/gi, 'Character')
    .replace(/\{time\}/gi, new Date().toLocaleString())
    .replace(/\{newline\}/gi, '\n');

  const renderBlock = (block: PromptBlock) => (block.strip ? strip(render(block.content)) : render(block.content));

  const enabledBlocks = (blocks || []).filter((b) => b.enabled);

  const systemBlocks = enabledBlocks
    .filter((b) => !b.injection)
    .sort((a, b) => a.depth - b.depth || a.position - b.position);

  for (const block of systemBlocks) {
    if (!strip(block.content)) continue;
    out.push({
      role: block.role,
      content: renderBlock(block),
      ...(block.name ? { name: block.name } : {}),
    });
  }

  // History length considered for depth; lorebook block participates too.
  const depthItems = enabledBlocks.filter((b) => b.injection);
  const byIndex = new Map<number, Array<{ block: PromptBlock; isLorebook: boolean }>>();

  const insertAt = (index: number, block: PromptBlock, isLorebook: boolean) => {
    if (!strip(block.content)) return;
    const key = Math.min(Math.max(index, 0), history.length);
    if (!byIndex.has(key)) byIndex.set(key, []);
    byIndex.get(key)!.push({ block, isLorebook });
  };

  for (const block of depthItems) {
    insertAt(history.length - block.depth, block, false);
  }
  if (lorebook) {
    const block: PromptBlock = {
      id: 'lorebook',
      name: 'Lorebook',
      content: lorebook.block,
      role: lorebook.role,
      depth: lorebook.depth,
      position: 0,
      injection: true,
      enabled: true,
      strip: true,
    };
    insertAt(history.length - lorebook.depth, block, true);
  }

  for (let i = 0; i <= history.length; i++) {
    const group = byIndex.get(i);
    if (group) {
      // lorebook context comes first (world info precedes injected prompts at the same depth)
      const lorebookBlocks = group.filter((g) => g.isLorebook);
      const top = group.filter((g) => !g.isLorebook && g.block.position === 0);
      const bottom = group.filter((g) => !g.isLorebook && g.block.position === 1);
      for (const { block } of [...lorebookBlocks, ...top, ...bottom]) {
        out.push({
          role: block.role,
          content: renderBlock(block),
          ...(block.name ? { name: block.name } : {}),
        });
      }
    }
    if (i < history.length) out.push(history[i]);
  }

  // Providers reject an assistant message leading the array; clamp to system.
  if (out.length > 0 && out[0].role === 'assistant') {
    out[0].role = 'system';
  }

  return out;
}
