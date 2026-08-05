// Shared types for the Lorebook Creator backend.

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ContentTextPart {
  type: 'text';
  text: string;
}

export interface ContentImagePart {
  type: 'image_url';
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export interface ContentInputAudioPart {
  type: 'input_audio';
  input_audio: { data: string; format: 'wav' | 'mp3' | 'ogg' | 'aac' | 'flac' | 'opus' };
}

export type ContentPart = ContentTextPart | ContentImagePart | ContentInputAudioPart;

export type MessageContent = string | ContentPart[];

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: Role;
  content: MessageContent;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface GenerationParams {
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
  max_tokens?: number | null;
  max_completion_tokens?: number | null;
  presence_penalty?: number | null;
  frequency_penalty?: number | null;
  stop?: string[] | null;
  seed?: number | null;
  n?: number | null;
  logit_bias?: Record<string, number> | null;
  reasoning_effort?: 'low' | 'medium' | 'high' | string | null;
  stream?: boolean;
}

export interface ApiConnection {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Extra headers forwarded to the provider (e.g. X-Title, HTTP-Referer). */
  extraHeaders?: Record<string, string>;
}

export interface PromptBlock {
  name: string;
  content: string;
  role: Role;
  /** Depth from the end of the conversation. 0 = injected at the very end. */
  depth: number;
  /** 0 = top of its depth group, 1 = bottom. */
  position: number;
  /** If true, injected as its own message in the conversation; else merged as system content. */
  injection: boolean;
  enabled: boolean;
  /** Strip surrounding whitespace when injecting. */
  strip: boolean;
  id: string;
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

export interface LorebookSettings {
  /** Where the activated lorebook block is injected (depth from end). 0 = end. */
  insertionDepth: number;
  /** Role of the injected lorebook block. */
  role: 'system' | 'user' | 'assistant';
  /** Maximum number of activated entries to include. 0 = unlimited. */
  maxEntries: number;
  /** Wrap activated entries in this prefix/suffix template. `{content}` placeholder. */
  template: string;
  /** Prepend the entry key before content. */
  showKeys: boolean;
  /** Characters of recent chat scanned for keys. */
  scanWindowChars: number;
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

export interface AgentConfig {
  autonomy: 'off' | 'collaborative' | 'autonomous';
  reviewRequired: boolean;
  maxTurns: number;
  systemPrompt: string;
  enabledTools: string[];
}

export interface HistoryMessage {
  id: string;
  role: Role;
  content: string;
  reasoning?: string;
  name?: string;
  createdAt: number;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  kind: 'image' | 'audio' | 'video';
  mime: string;
  url: string;
  name: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  messages: HistoryMessage[];
}

export interface AppSettings {
  api: ApiConnection & { baseUrl: string; apiKey: string; model: string };
  params: GenerationParams;
  lorebookId: string | null;
  lorebook: LorebookSettings;
  agent: AgentConfig;
  ui: Record<string, unknown>;
}

export interface ActivatedEntry {
  entry: LorebookEntry;
  entryId: string;
  matchedKeys: string[];
  score: number;
}
