import type { ChatMessage } from '../types.js';
import { getSettings } from '../settings.js';
import { streamChat, type StreamEmitter, type StreamResult } from '../llm/client.js';
import { toolDefinitions, executeTool } from './tools.js';

export interface AgentEmitter extends StreamEmitter {
  toolCallResult: (info: { id: string; name: string; args: string; result: string; staged: boolean }) => void;
  turn: (turn: number) => void;
}

export function defaultAgentSystemPrompt(): string {
  return [
    'You are the World Architect, an expert worldbuilding assistant inside a Lorebook Creator.',
    'Your purpose is to help the user build, refine and manage a structured "lorebook" of world information',
    'using the provided tools. Lorebook entries have trigger keys and content that is injected into context',
    'when keys appear in conversation.',
    '',
    'Guidelines:',
    '- When the user describes a person, place, object, faction, or rule, create or update entries for it.',
    '- Keep entries concise, concrete, and self-contained. Use proper nouns as keys.',
    '- Iterate: propose refinements when details change, and tell the user what you changed and why.',
    '- If a tool reports a change is STAGED for review, tell the user it is awaiting their approval.',
    '- If autonomy is off, wait for explicit instructions before calling tools.',
  ].join('\n');
}

/**
 * Run an agentic chat completion with tool-calling loop. Streams all events
 * through the emitter. Returns the assembled final assistant message and any
 * staged changes that were created.
 */
export async function runAgentLoop(
  initialMessages: ChatMessage[],
  input: {
    model?: string;
    maxTurns?: number;
    signal?: AbortSignal;
    autonomy?: 'off' | 'collaborative' | 'autonomous';
  },
  emitter: AgentEmitter,
): Promise<{ content: string; reasoning: string; toolCalls: number }> {
  const settings = getSettings();
  const maxTurns = input.maxTurns ?? settings.agent.maxTurns ?? 4;
  const autonomy = input.autonomy ?? settings.agent.autonomy;

  const enabledToolNames = new Set(settings.agent.enabledTools);
  const tools = toolDefinitions
    .filter((t) => enabledToolNames.has(t.name))
    .map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));

  let messages: ChatMessage[] = [...initialMessages];
  let totalContent = '';
  let totalReasoning = '';
  let toolCallsMade = 0;
  const hasTools = tools.length > 0 && autonomy !== 'off';

  for (let turn = 0; turn <= maxTurns; turn++) {
    emitter.turn(turn);
    const result: StreamResult = await new Promise((resolve, reject) => {
      let settled = false;
      streamChat(
        {
          messages,
          model: input.model,
          tools: hasTools ? tools : undefined,
          signal: input.signal,
        },
        {
          reasoning: (text) => { totalReasoning += text; emitter.reasoning(text); },
          delta: (text) => { totalContent += text; emitter.delta(text); },
          toolCall: (call) => emitter.toolCall(call),
          done: (r) => { if (!settled) { settled = true; resolve(r); } },
          error: (err) => { if (!settled) { settled = true; reject(err); } },
        },
      );
    });

    messages.push({
      role: 'assistant',
      content: result.content || null as unknown as string,
      ...(result.reasoning ? { reasoning_content: result.reasoning } : {}),
      ...(result.toolCalls.length ? { tool_calls: result.toolCalls } : {}),
    });

    if (!result.toolCalls.length) break;

    toolCallsMade += result.toolCalls.length;

    const chatText = messages
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((p) => (p.type === 'text' ? p.text : '[media]')).join(' ')))
      .join('\n');

    for (const call of result.toolCalls) {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(call.function.arguments || '{}'); } catch { /* keep {} */ }
      const { result: toolResult, staged } = await executeTool(call.function.name, parsed, { chatText, history: messages });
      emitter.toolCallResult({
        id: call.id,
        name: call.function.name,
        args: call.function.arguments,
        result: toolResult,
        staged: !!staged,
      });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: toolResult,
      });
    }
  }

  return { content: totalContent, reasoning: totalReasoning, toolCalls: toolCallsMade };
}
