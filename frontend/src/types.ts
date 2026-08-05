export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Attachment {
  id: string;
  kind: 'image' | 'audio' | 'video';
  mime: string;
  url: string;
  name: string;
}

export interface HistoryMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: string;
  name?: string;
  createdAt: number;
  attachments?: Attachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  messages: HistoryMessage[];
}

export interface LorebookEntry {
  uid: number;
  key: string;
  keys: string[];
  comment: string;
  content: string;
  constant: boolean;
  vectorized: boolean;
  selective: boolean;
  selectiveLogic: 0 | 1 | 2;
  addMemo: boolean;
  order: number;
  position: 0 | 1;
  disable: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  delayUntilRecursion: boolean;
  probability: number;
  useProbability: boolean;
  depth: number;
  group: string;
  groupOverride: boolean;
  groupWeight: number;
  scanDepth: number | null;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  useGroupScoring: boolean | null;
  automationId: string;
  role: 0 | 1 | 2 | 3 | 4;
  enabled: boolean;
}

export interface Lorebook {
  /** Canonical id (slugified name), matches the on-disk filename. */
  id: string;
  name: string;
  description: string;
  entries: Record<string, LorebookEntry>;
}

export interface LorebookSummary {
  id: string;
  name: string;
  description: string;
  entryCount: number;
  updatedAt: number;
}

export interface PromptBlock {
  id: string;
  name: string;
  content: string;
  role: 'system' | 'user' | 'assistant';
  depth: number;
  position: number;
  injection: boolean;
  enabled: boolean;
  strip: boolean;
}

export interface PromptPreset {
  id: string;
  name: string;
  blocks: PromptBlock[];
}

export interface StagedChange {
  id: string;
  createdAt: number;
  lorebookId: string;
  type: 'create' | 'update' | 'delete';
  entryId?: string;
  proposed: Partial<LorebookEntry> & { keys: string[]; content: string; key: string };
  previous?: Partial<LorebookEntry>;
  reason: string;
  status: 'pending' | 'applied' | 'rejected';
  appliedAt?: number;
  rejectedAt?: number;
}

export interface GenerationParams {
  temperature: number | null;
  top_p: number | null;
  top_k: number | null;
  max_tokens: number | null;
  max_completion_tokens: number | null;
  presence_penalty: number | null;
  frequency_penalty: number | null;
  stop: string[] | null;
  seed: number | null;
  n: number | null;
  logit_bias: Record<string, number> | null;
  reasoning_effort: string | null;
}

export interface AppSettings {
  api: { baseUrl: string; apiKey: string; model: string; extraHeaders: Record<string, string> };
  params: GenerationParams;
  lorebookId: string | null;
  lorebook: {
    insertionDepth: number;
    role: 'system' | 'user' | 'assistant';
    maxEntries: number;
    template: string;
    showKeys: boolean;
    scanWindowChars: number;
  };
  agent: {
    autonomy: 'off' | 'collaborative' | 'autonomous';
    reviewRequired: boolean;
    maxTurns: number;
    systemPrompt: string;
    enabledTools: string[];
  };
  ui: Record<string, unknown>;
}

export interface AgentConfig {
  autonomy: 'off' | 'collaborative' | 'autonomous';
  reviewRequired: boolean;
  maxTurns: number;
  systemPrompt: string;
  enabledTools: string[];
}

export interface ChatHandlers {
  onReasoning?: (text: string) => void;
  onDelta?: (text: string) => void;
  onToolCall?: (call: { id: string; name: string; args: string }) => void;
  onToolCallResult?: (r: { id: string; name: string; args: string; result: string; staged: boolean }) => void;
  onTurn?: (turn: number) => void;
  onDone?: (r: { usage: unknown; finishReason: string | null }) => void;
  onError?: (message: string) => void;
  onFinal?: (r: { messageId: string }) => void;
  signal?: AbortSignal;
}

export interface ChatRequest {
  sessionId?: string;
  model?: string;
  history?: HistoryMessage[];
  content: string;
  attachments?: Attachment[];
  agent?: boolean;
  maxTurns?: number;
  autonomy?: 'off' | 'collaborative' | 'autonomous';
  reviewRequired?: boolean;
  promptPresetId?: string | null;
}

export interface PanelConfig {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  visible: boolean;
  maximized: boolean;
}
