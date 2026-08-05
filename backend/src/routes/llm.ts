import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSettings } from '../settings.js';
import { listModels, streamChat, chatCompletion } from '../llm/client.js';
import { getPreset } from '../prompts/preset.js';
import { assembleMessages } from '../prompts/assembler.js';
import { assembleLorebookContext } from '../lorebook/scanner.js';
import { getLorebook } from '../lorebook/store.js';
import { runAgentLoop, defaultAgentSystemPrompt } from '../agent/agent.js';
import { getSession, saveSession, createSession, appendMessage, updateMessage } from '../history/store.js';
import { historyMessageToContent } from '../media/store.js';
import { cache, modelListCache } from '../util/cache.js';
import { startSse, pumpQueue, sseSend, EventQueue } from '../util/sse.js';
import type { ChatMessage, HistoryMessage, Attachment, Role } from '../types.js';

const router = Router();

function textOf(content: string | ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return (content || []).map((p) => (p.type === 'text' ? p.text : '[media]')).join('\n');
}

async function historyToChatMessages(history: HistoryMessage[]): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  for (const m of history) {
    const parts = await historyMessageToContent(m);
    const msg: ChatMessage = { role: m.role, content: parts };
    if (m.reasoning) msg.reasoning_content = m.reasoning;
    out.push(msg);
  }
  return out;
}

router.get('/models', async (req: Request, res: Response) => {
  try {
    const baseUrl = typeof req.query.baseUrl === 'string' ? req.query.baseUrl : undefined;
    const apiKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined;
    const cacheKey = `${baseUrl ?? ''}:${apiKey ?? ''}`;
    if (modelListCache.has(cacheKey)) {
      return res.json({ models: modelListCache.get<string[]>(cacheKey)! });
    }
    const models = await listModels(baseUrl, apiKey);
    modelListCache.set(cacheKey, models);
    res.json({ models });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/chat  — streaming chat (optionally agentic)
router.post('/chat', async (req: Request, res: Response) => {
  const body = req.body as {
    sessionId?: string;
    model?: string;
    params?: unknown;
    history?: HistoryMessage[];
    content: string;
    attachments?: Attachment[];
    agent?: boolean;
    maxTurns?: number;
    autonomy?: 'off' | 'collaborative' | 'autonomous';
    reviewRequired?: boolean;
    promptPresetId?: string;
  };

  const settings = getSettings();
  const session = body.sessionId ? getSession(body.sessionId) : null;
  const workingSession = session || createSession();

  if (!session) {
    // brand new session persisted by createSession already
  }

  const userMsg: HistoryMessage = {
    id: uuidv4(),
    role: 'user',
    content: body.content || '',
    createdAt: Date.now(),
    attachments: body.attachments || [],
  };
  workingSession.messages.push(userMsg);
  workingSession.model = body.model ?? settings.api.model;

  const assistantId = uuidv4();
  const assistantMsg: HistoryMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
  };
  workingSession.messages.push(assistantMsg);

  // Save pending state so history is durable even if streaming fails.
  saveSession(workingSession);

  // Build history for the request (skip the empty assistant placeholder we just added)
  const workingHistory = (body.history && body.history.length ? body.history : workingSession.messages)
    .filter((m) => !(m.role === 'assistant' && !m.content));
  const chatMessages = await historyToChatMessages(workingHistory);

  // Ensure the latest user message is present (it is part of workingHistory or workingSession)
  const chatText = chatMessages
    .filter((m) => m.role === 'user')
    .map((m) => textOf(m.content))
    .join('\n');

  const lorebook = getLorebook(settings.lorebookId ?? '');
  const lorebookCtx = assembleLorebookContext(lorebook, chatText);

  const preset = body.promptPresetId ? getPreset(body.promptPresetId) : null;
  const blocks = preset?.blocks ?? [];

  let messages: ChatMessage[];
  if (body.agent) {
    const agentPrompt = settings.agent.systemPrompt || defaultAgentSystemPrompt();
    messages = assembleMessages(
      chatMessages,
      [
        { id: 'agent', name: 'World Architect', content: agentPrompt, role: 'system', depth: 0, position: 0, injection: false, enabled: true, strip: true },
        ...blocks.filter((b) => !b.name || b.name !== 'agent'),
      ],
      lorebookCtx,
    );
  } else {
    messages = assembleMessages(chatMessages, blocks, lorebookCtx);
  }

  startSse(res);
  const queue = new EventQueue();
  const pump = pumpQueue(res, queue);
  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  const reasoning: string[] = [];

  const send = (event: string, data: unknown) => sseSend(res, event, data);
  let completed = false;

  try {
    if (body.agent) {
      await runAgentLoop(
        messages,
        {
          model: body.model,
          maxTurns: body.maxTurns,
          autonomy: body.autonomy ?? settings.agent.autonomy,
          signal: abortController.signal,
        },
        {
          reasoning: (t) => { reasoning.push(t); send('reasoning', { text: t }); },
          delta: (t) => { assistantMsg.content += t; send('delta', { text: t }); },
          toolCall: (c) => send('tool_call', { id: c.id, name: c.name, args: c.args }),
          toolCallResult: (r) => send('tool_call_result', r),
          turn: (n) => send('turn', { turn: n }),
          done: (r) => send('agent_done', { usage: r.usage, finishReason: r.finishReason }),
          error: (e) => { send('error', { message: e.message }); },
        },
      );
    } else {
      await streamChat(
        { messages, model: body.model },
        {
          reasoning: (t) => { reasoning.push(t); send('reasoning', { text: t }); },
          delta: (t) => { assistantMsg.content += t; send('delta', { text: t }); },
          toolCall: () => undefined,
          done: (r) => {
            assistantMsg.content = r.content || assistantMsg.content;
            send('done', { usage: r.usage, finishReason: r.finishReason });
          },
          error: (e) => { send('error', { message: e.message }); },
        },
      );
    }

    assistantMsg.reasoning = reasoning.join('');
    if (assistantMsg.content) {
      updateMessage(workingSession.id, assistantId, { content: assistantMsg.content, reasoning: assistantMsg.reasoning });
    } else {
      // nothing produced (e.g. fully tool-driven)
      updateMessage(workingSession.id, assistantId, { content: assistantMsg.content || '(no text output)', reasoning: assistantMsg.reasoning });
    }
    completed = true;
    send('final', { messageId: assistantId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send('error', { message });
    try {
      if (assistantMsg.content) {
        updateMessage(workingSession.id, assistantId, { content: assistantMsg.content, reasoning: reasoning.join('') });
      } else {
        updateMessage(workingSession.id, assistantId, { content: `(error: ${message})`, reasoning: reasoning.join('') });
      }
    } catch { /* session may have changed */ }
  } finally {
    queue.close();
    await pump;
    res.end();
  }
});

// Non-streaming chat for quick tests / simple integrations.
router.post('/chat/nonstream', async (req: Request, res: Response) => {
  const body = req.body as { messages?: ChatMessage[]; model?: string; params?: unknown; content?: string; system?: string };
  try {
    let messages: ChatMessage[] = body.messages || [];
    if (!messages.length && body.content) {
      messages = [{ role: 'user', content: body.content }];
      if (body.system) messages.unshift({ role: 'system', content: body.system });
    }
    if (!messages.length) return res.status(400).json({ error: 'No messages provided' });
    const completion = await chatCompletion({ messages, model: body.model, params: body.params as never });
    res.json({ content: completion.choices?.[0]?.message?.content ?? '', reasoning: (completion.choices?.[0]?.message as unknown as { reasoning_content?: string })?.reasoning_content ?? '' });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/cache', (_req: Request, res: Response) => {
  res.json({ cache: cache.status(), modelListCache: modelListCache.status() });
});

router.post('/cache/clear', (_req: Request, res: Response) => {
  cache.clear();
  modelListCache.clear();
  res.json({ ok: true });
});

export default router;
