import OpenAI from 'openai';
import type { ChatMessage, GenerationParams } from '../types.js';
import { getSettings } from '../settings.js';

export interface ChatRequestInput {
  messages: ChatMessage[];
  model?: string;
  params?: Partial<GenerationParams>;
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  tool_choice?: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | null;
  signal?: AbortSignal;
}

export interface StreamResult {
  content: string;
  reasoning: string;
  toolCalls: NonNullable<ChatMessage['tool_calls']>;
  usage: OpenAI.Completions.CompletionUsage | null;
  finishReason: string | null;
}

export interface StreamEmitter {
  reasoning: (text: string) => void;
  delta: (text: string) => void;
  toolCall: (call: { id: string; name: string; args: string }) => void;
  done: (result: StreamResult) => void;
  error: (err: Error) => void;
}

function buildClient(baseUrl: string, apiKey: string, extraHeaders?: Record<string, string>) {
  return new OpenAI({
    baseURL: baseUrl,
    apiKey: apiKey || 'not-needed',
    defaultHeaders: extraHeaders || {},
    timeout: 600000,
  });
}

function resolveModel(model?: string): string {
  if (model && model.trim()) return model.trim();
  return getSettings().api.model;
}

function buildParams(params?: Partial<GenerationParams>): Record<string, unknown> {
  const p = { ...getSettings().params, ...(params || {}) };
  const out: Record<string, unknown> = {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  if (p.temperature !== undefined) out.temperature = num(p.temperature);
  if (p.top_p !== undefined) out.top_p = num(p.top_p);
  if (p.top_k !== undefined) out.top_k = num(p.top_k);
  if (p.presence_penalty !== undefined) out.presence_penalty = num(p.presence_penalty);
  if (p.frequency_penalty !== undefined) out.frequency_penalty = num(p.frequency_penalty);
  if (p.seed !== undefined) out.seed = num(p.seed);
  if (p.n !== undefined) out.n = num(p.n);
  if (p.logit_bias !== undefined && p.logit_bias && Object.keys(p.logit_bias).length) out.logit_bias = p.logit_bias;
  if (p.reasoning_effort) out.reasoning_effort = p.reasoning_effort;
  if (Array.isArray(p.stop) && p.stop.length) out.stop = p.stop;
  if (typeof p.max_tokens === 'number' && Number.isFinite(p.max_tokens)) out.max_tokens = p.max_tokens;
  if (typeof p.max_completion_tokens === 'number' && Number.isFinite(p.max_completion_tokens)) {
    out.max_completion_tokens = p.max_completion_tokens;
  }
  return out;
}

export async function listModels(baseUrl?: string, apiKey?: string, extraHeaders?: Record<string, string>): Promise<string[]> {
  const settings = getSettings();
  const client = buildClient(
    baseUrl ?? settings.api.baseUrl,
    apiKey ?? settings.api.apiKey,
    extraHeaders ?? settings.api.extraHeaders,
  );
  const response = await client.models.list();
  const data = response.data as unknown as Array<{ id?: string }>;
  return (data || []).map((m) => m.id).filter((id): id is string => typeof id === 'string').sort();
}

export async function chatCompletion(input: ChatRequestInput): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const settings = getSettings();
  const client = buildClient(settings.api.baseUrl, settings.api.apiKey, settings.api.extraHeaders);
  const model = resolveModel(input.model);
  const params = buildParams(input.params);
  return client.chat.completions.create({
    model,
    messages: input.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    ...params,
    ...(input.tools?.length ? { tools: input.tools } : {}),
    ...(input.tool_choice ? { tool_choice: input.tool_choice } : {}),
    stream: false,
  });
}

/**
 * Stream a chat completion. Emits reasoning/delta/toolCall/done/error via the emitter.
 * The emitter is driven synchronously within this async function; the route layer
 * bridges it to an SSE stream.
 */
export async function streamChat(
  input: ChatRequestInput,
  emitter: StreamEmitter,
): Promise<void> {
  const settings = getSettings();
  const client = buildClient(settings.api.baseUrl, settings.api.apiKey, settings.api.extraHeaders);
  const model = resolveModel(input.model);
  const params = buildParams(input.params);

  // o-series models require max_completion_tokens, not max_tokens.
  if (/^o\d/i.test(model) && params.max_tokens && !params.max_completion_tokens) {
    params.max_completion_tokens = params.max_tokens;
    delete params.max_tokens;
  }

  let content = '';
  let reasoning = '';
  const toolCalls: NonNullable<ChatMessage['tool_calls']> = [];
  let finishReason: string | null = null;
  let usage: OpenAI.Completions.CompletionUsage | null = null;

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: input.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      ...params,
      ...(input.tools?.length ? { tools: input.tools } : {}),
      ...(input.tool_choice ? { tool_choice: input.tool_choice } : {}),
      stream: true,
    });

    for await (const chunk of stream) {
      if (input.signal?.aborted) break;
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta as unknown as Record<string, unknown>;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const reasoningText = (delta?.reasoning_content ?? delta?.reasoning ?? '') as string;
      if (reasoningText) {
        reasoning += reasoningText;
        emitter.reasoning(reasoningText);
      }

      const text = (delta?.content ?? '') as string;
      if (text) {
        content += text;
        emitter.delta(text);
      }

      const toolDelta = delta?.tool_calls as Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined;
      if (Array.isArray(toolDelta)) {
        for (const tc of toolDelta) {
          const index = tc.index ?? 0;
          if (!toolCalls[index]) {
            toolCalls[index] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
          }
          if (tc.id) toolCalls[index].id = tc.id;
          if (tc.function?.name) toolCalls[index].function.name = tc.function.name;
          if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
        }
      }

      if (chunk.usage) usage = chunk.usage;
    }
  } catch (err) {
    emitter.error(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (input.signal?.aborted) {
    emitter.error(new Error('aborted'));
    return;
  }

  emitter.done({
    content,
    reasoning,
    toolCalls: toolCalls.filter((tc) => tc.function.name),
    usage,
    finishReason,
  });
}
