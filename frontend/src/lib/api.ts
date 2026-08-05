import type { AppSettings, Attachment, ChatHandlers, ChatRequest, Lorebook, LorebookSummary, PromptPreset, StagedChange, HistoryMessage, ChatSession } from '../types';

const BASE = '/api';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // settings
  getSettings: () => request<AppSettings>('/api/settings'),
  saveSettings: (patch: Partial<AppSettings>) => request<AppSettings>('/api/settings', { method: 'POST', body: JSON.stringify(patch) }),
  validateConnection: (baseUrl: string, apiKey: string) =>
    request<{ ok: boolean; error?: string; modelCount?: number; models?: string[] }>('/api/settings/validate-connection', { method: 'POST', body: JSON.stringify({ baseUrl, apiKey }) }),
  getModels: (baseUrl?: string, apiKey?: string) =>
    request<{ models: string[] }>(`/api/llm/models?${new URLSearchParams(baseUrl ? { baseUrl, apiKey: apiKey || '' } : {}).toString()}`),

  // lorebooks
  listLorebooks: () => request<{ lorebooks: LorebookSummary[]; currentId: string | null }>('/api/lorebooks'),
  getLorebook: (id: string) => request<Lorebook>(`/api/lorebooks/${id}`),
  createLorebook: (name: string, description = '') => request<Lorebook>('/api/lorebooks', { method: 'POST', body: JSON.stringify({ name, description }) }),
  updateLorebook: (id: string, patch: { name?: string; description?: string }) => request<Lorebook>(`/api/lorebooks/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteLorebook: (id: string) => request<{ ok: boolean }>(`/api/lorebooks/${id}`, { method: 'DELETE' }),
  selectLorebook: (id: string | null) => request<{ ok: boolean }>('/api/lorebooks/select', { method: 'POST', body: JSON.stringify({ id }) }),
  importLorebook: (name: string, data: unknown) => request<Lorebook>('/api/lorebooks/import', { method: 'POST', body: JSON.stringify({ name, data }) }),
  exportLorebook: (id: string) => request<Lorebook>(`/api/lorebooks/export/${id}`),
  validateLorebook: (data: unknown) => request<{ valid: boolean; reason?: string; entryCount?: number }>('/api/lorebooks/validate', { method: 'POST', body: JSON.stringify({ data }) }),
  previewLorebook: (id: string, text: string) => request<{ activated: Array<{ entryId: string; matchedKeys: string[]; entry: import('../types').LorebookEntry }>; block: string }>('/api/lorebooks/preview', { method: 'POST', body: JSON.stringify({ id, text }) }),
  addEntry: (id: string, entry: Partial<import('../types').LorebookEntry>) => request<{ ok: boolean; entryId: string; lorebook: Lorebook }>(`/api/lorebooks/${id}/entries`, { method: 'POST', body: JSON.stringify(entry) }),
  updateEntry: (id: string, entryId: string, entry: Partial<import('../types').LorebookEntry>) => request<{ ok: boolean; lorebook: Lorebook }>(`/api/lorebooks/${id}/entries/${entryId}`, { method: 'PUT', body: JSON.stringify(entry) }),
  deleteEntry: (id: string, entryId: string) => request<{ ok: boolean; lorebook: Lorebook }>(`/api/lorebooks/${id}/entries/${entryId}`, { method: 'DELETE' }),

  // prompts
  listPresets: () => request<{ presets: Array<{ id: string; name: string; blockCount: number; updatedAt: number }>; activeId: string | null }>('/api/prompts'),
  getPreset: (id: string) => request<PromptPreset>(`/api/prompts/${id}`),
  createPreset: (name: string, blocks: import('../types').PromptBlock[]) => request<PromptPreset>('/api/prompts', { method: 'POST', body: JSON.stringify({ name, blocks }) }),
  updatePreset: (id: string, patch: { name?: string; blocks?: import('../types').PromptBlock[] }) => request<PromptPreset>(`/api/prompts/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deletePreset: (id: string) => request<{ ok: boolean }>(`/api/prompts/${id}`, { method: 'DELETE' }),
  selectPreset: (id: string | null) => request<{ ok: boolean }>('/api/prompts/select', { method: 'POST', body: JSON.stringify({ id }) }),
  importPreset: (name: string, data: unknown) => request<PromptPreset>('/api/prompts/import', { method: 'POST', body: JSON.stringify({ name, data }) }),
  exportPreset: (id: string) => request<PromptPreset>(`/api/prompts/export/${id}`),

  // history
  listSessions: () => request<{ sessions: Array<{ id: string; title: string; createdAt: number; updatedAt: number; messageCount: number; model: string }> }>('/api/history'),
  getSession: (id: string) => request<ChatSession>(`/api/history/${id}`),
  createSession: (title?: string, model?: string) => request<ChatSession>('/api/history', { method: 'POST', body: JSON.stringify({ title, model }) }),
  renameSession: (id: string, title: string) => request<ChatSession>(`/api/history/${id}/rename`, { method: 'POST', body: JSON.stringify({ title }) }),
  deleteSession: (id: string) => request<{ ok: boolean }>(`/api/history/${id}`, { method: 'DELETE' }),
  exportUrl: (id: string, format: 'json' | 'txt') => `${BASE}/history/${id}/export?format=${format}`,

  // media
  uploadMedia: async (file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/media/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },
  mediaUrl: (filename: string) => `${BASE}/media/${filename}`,

  // review
  getReview: () => request<{ pending: StagedChange[]; all: StagedChange[] }>('/api/review'),
  applyChange: (id: string) => request<{ ok: boolean; change: StagedChange }>(`/api/review/${id}/apply`, { method: 'POST' }),
  rejectChange: (id: string) => request<{ ok: boolean; change: StagedChange }>(`/api/review/${id}/reject`, { method: 'POST' }),
  applyAll: () => request<{ ok: boolean; results: Array<{ id: string; ok: boolean; error?: string }> }>('/api/review/apply-all', { method: 'POST' }),
  clearReviewHistory: () => request<{ ok: boolean }>('/api/review/clear-history', { method: 'POST' }),

  // chat
  streamChat(body: ChatRequest, handlers: ChatHandlers): AbortController {
    const controller = new AbortController();
    const effectiveSignal = handlers.signal ? AbortSignal.any([controller.signal, handlers.signal]) : controller.signal;
    void (async () => {
      let res: Response;
      try {
        res = await fetch(`${BASE}/llm/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: effectiveSignal,
        });
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err.message : String(err));
        return;
      }
      if (!res.ok || !res.body) {
        handlers.onError?.(`HTTP ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            parseSseEvent(part, handlers);
          }
        }
        if (buffer.trim()) parseSseEvent(buffer, handlers);
      } catch (err) {
        if (!controller.signal.aborted) {
          handlers.onError?.(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return controller;
  },
};

function parseSseEvent(part: string, handlers: ChatHandlers): void {
  const lines = part.split('\n');
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return;
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return;
  }
  switch (event) {
    case 'reasoning': handlers.onReasoning?.((data as { text: string }).text); break;
    case 'delta': handlers.onDelta?.((data as { text: string }).text); break;
    case 'tool_call': handlers.onToolCall?.(data as { id: string; name: string; args: string }); break;
    case 'tool_call_result': handlers.onToolCallResult?.(data as { id: string; name: string; args: string; result: string; staged: boolean }); break;
    case 'turn': handlers.onTurn?.((data as { turn: number }).turn); break;
    case 'done': handlers.onDone?.((data as { usage: unknown; finishReason: string | null })); break;
    case 'agent_done': handlers.onDone?.((data as { usage: unknown; finishReason: string | null })); break;
    case 'error': handlers.onError?.((data as { message: string }).message); break;
    case 'final': handlers.onFinal?.((data as { messageId: string })); break;
  }
}
