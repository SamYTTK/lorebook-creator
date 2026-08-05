import { create } from 'zustand';
import { api } from '../lib/api';
import type {
  AppSettings, Attachment, ChatSession, HistoryMessage, Lorebook, LorebookSummary,
  PanelConfig, PromptPreset, StagedChange,
} from '../types';

export interface ToolLogEntry {
  id: string;
  name: string;
  args: string;
  result: string;
  staged: boolean;
  ts: number;
}

export interface StreamingState {
  active: boolean;
  assistantId: string | null;
  turns: number;
  toolLog: ToolLogEntry[];
  error: string | null;
}

export interface PanelMap {
  [id: string]: PanelConfig;
}

export const PANEL_DEFS = [
  { id: 'chat', title: 'Chat' },
  { id: 'lorebook', title: 'Lorebook' },
  { id: 'agent', title: 'Agent' },
  { id: 'prompts', title: 'Prompt Builder' },
  { id: 'recent', title: 'Recent Changes' },
  { id: 'settings', title: 'Settings' },
] as const;

export type PanelId = (typeof PANEL_DEFS)[number]['id'];

export function defaultPanels(w = window.innerWidth, h = window.innerHeight): PanelMap {
  const margin = 8;
  const rightW = Math.min(280, Math.floor(w * 0.22));
  const leftW = Math.min(260, Math.floor(w * 0.2));
  const topY = 40;
  const rightX = w - rightW - margin;
  const bottomH = Math.floor(h * 0.46);
  return {
    chat: { id: 'chat', title: 'Chat', x: leftW + margin, y: topY, width: w - leftW - rightW - margin * 3, height: h - topY - margin, minWidth: 300, minHeight: 200, visible: true, maximized: false },
    lorebook: { id: 'lorebook', title: 'Lorebook', x: rightX, y: topY, width: rightW, height: bottomH, minWidth: 220, minHeight: 160, visible: true, maximized: false },
    agent: { id: 'agent', title: 'Agent', x: rightX, y: topY + bottomH + margin, width: rightW, height: h - topY - bottomH - margin * 2, minWidth: 220, minHeight: 160, visible: true, maximized: false },
    prompts: { id: 'prompts', title: 'Prompt Builder', x: margin, y: topY, width: leftW, height: bottomH, minWidth: 220, minHeight: 160, visible: false, maximized: false },
    recent: { id: 'recent', title: 'Recent Changes', x: margin, y: topY + bottomH + margin, width: leftW, height: h - topY - bottomH - margin * 2, minWidth: 220, minHeight: 160, visible: true, maximized: false },
    settings: { id: 'settings', title: 'Settings', x: Math.max(margin, Math.floor((w - 320) / 2)), y: topY + 20, width: 320, height: Math.floor(h * 0.6), minWidth: 300, minHeight: 300, visible: false, maximized: false },
  };
}

interface StoreState {
  initialized: boolean;
  settings: AppSettings | null;
  sessions: Array<{ id: string; title: string; createdAt: number; updatedAt: number; messageCount: number; model: string }>;
  currentSessionId: string | null;
  currentSession: ChatSession | null;
  messages: HistoryMessage[];
  lorebooks: LorebookSummary[];
  currentLorebook: Lorebook | null;
  presets: Array<{ id: string; name: string; blockCount: number; updatedAt: number }>;
  activePreset: PromptPreset | null;
  review: { pending: StagedChange[]; all: StagedChange[] };
  panels: PanelMap;
  panelLocked: boolean;
  streaming: StreamingState;
  streamingContent: string;
  streamingReasoning: string;

  init: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  refreshSessions: () => Promise<void>;
  newSession: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  refreshLorebooks: () => Promise<void>;
  selectLorebook: (id: string | null) => Promise<void>;
  createLorebook: (name: string, description?: string) => Promise<void>;
  refreshPresets: () => Promise<void>;
  selectPreset: (id: string | null) => Promise<void>;
  refreshReview: () => Promise<void>;
  sendMessage: (text: string, attachments?: Attachment[]) => Promise<void>;
  stopStream: () => void;
  updatePanel: (id: string, patch: Partial<PanelConfig>) => void;
  togglePanel: (id: string) => void;
  toggleLock: () => void;
  resetLayout: () => void;
  setPanelLocked: (locked: boolean) => void;
}

let abortController: AbortController | null = null;

export const useStore = create<StoreState>((set, get) => {
  const persistLayout = (panels: PanelMap) => {
    const settings = get().settings;
    if (settings) {
      void api.saveSettings({ ui: { ...settings.ui, panels, panelLocked: get().panelLocked } });
    }
  };

  return {
    initialized: false,
    settings: null,
    sessions: [],
    currentSessionId: null,
    currentSession: null,
    messages: [],
    lorebooks: [],
    currentLorebook: null,
    presets: [],
    activePreset: null,
    review: { pending: [], all: [] },
    panels: defaultPanels(),
    panelLocked: false,
    streaming: { active: false, assistantId: null, turns: 0, toolLog: [], error: null },
    streamingContent: '',
    streamingReasoning: '',

    init: async () => {
      try {
        const [settings, sessions, lorebooks, presets, review] = await Promise.all([
          api.getSettings(),
          api.listSessions(),
          api.listLorebooks(),
          api.listPresets(),
          api.getReview(),
        ]);
        const ui = settings.ui as { panels?: PanelMap; panelLocked?: boolean };
        let panels = ui.panels;
        if (!panels) {
          panels = defaultPanels();
        }
        set({ settings, sessions: sessions.sessions, lorebooks: lorebooks.lorebooks, presets: presets.presets, review, panels, panelLocked: !!ui.panelLocked, initialized: true });
        if (lorebooks.currentId) {
          const lb = await api.getLorebook(lorebooks.currentId);
          set({ currentLorebook: lb });
        }
        if (presets.activeId) {
          try { set({ activePreset: await api.getPreset(presets.activeId) }); } catch { /* ignore */ }
        }
        if (sessions.sessions.length) {
          await get().selectSession(sessions.sessions[0].id);
        }
      } catch (err) {
        set({ initialized: true });
        console.error('init failed', err);
      }
    },

    refreshSettings: async () => {
      const settings = await api.getSettings();
      set({ settings });
    },

    saveSettings: async (patch) => {
      const settings = await api.saveSettings(patch);
      set({ settings });
    },

    refreshSessions: async () => {
      const res = await api.listSessions();
      set({ sessions: res.sessions });
    },

    newSession: async () => {
      const model = get().settings?.api.model || '';
      const session = await api.createSession('New Chat', model);
      set({ currentSessionId: session.id, currentSession: session, messages: [] });
      await get().refreshSessions();
    },

    selectSession: async (id) => {
      const session = await api.getSession(id);
      set({ currentSessionId: session.id, currentSession: session, messages: session.messages });
    },

    deleteSession: async (id) => {
      await api.deleteSession(id);
      await get().refreshSessions();
      if (get().currentSessionId === id) {
        const sessions = get().sessions.filter((s) => s.id !== id);
        if (sessions.length) await get().selectSession(sessions[0].id);
        else await get().newSession();
      }
    },

    renameSession: async (id, title) => {
      await api.renameSession(id, title);
      await get().refreshSessions();
      const current = get().currentSession;
      if (current && current.id === id) {
        set({ currentSession: { ...current, title } });
      }
    },

    refreshLorebooks: async () => {
      const res = await api.listLorebooks();
      set({ lorebooks: res.lorebooks });
      const currentId = res.currentId;
      if (currentId) {
        try {
          const lb = await api.getLorebook(currentId);
          set({ currentLorebook: lb });
        } catch { set({ currentLorebook: null }); }
      } else {
        set({ currentLorebook: null });
      }
    },

    selectLorebook: async (id) => {
      await api.selectLorebook(id);
      await get().refreshLorebooks();
    },

    createLorebook: async (name, description = '') => {
      const lb = await api.createLorebook(name, description);
      await api.selectLorebook(lb.id);
      await get().refreshLorebooks();
    },

    refreshPresets: async () => {
      const res = await api.listPresets();
      set({ presets: res.presets });
      if (res.activeId) {
        try { set({ activePreset: await api.getPreset(res.activeId) }); } catch { /* ignore */ }
      } else {
        set({ activePreset: null });
      }
    },

    selectPreset: async (id) => {
      await api.selectPreset(id);
      await get().refreshPresets();
    },

    refreshReview: async () => {
      const review = await api.getReview();
      set({ review });
    },

    sendMessage: async (text, attachments = []) => {
      const s = get();
      if (s.streaming.active) return;
      if (!text && !attachments.length) return;

      if (!s.currentSessionId) {
        await get().newSession();
      }
      const sessionId = get().currentSessionId!;
      const settings = get().settings!;

      const userMsg: HistoryMessage = {
        id: `client-${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: Date.now(),
        attachments,
      };
      const assistantId = `client-${Date.now()}-a`;
      const assistantMsg: HistoryMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      };

      set((st) => ({
        messages: [...st.messages, userMsg, assistantMsg],
        streaming: { active: true, assistantId, turns: 0, toolLog: [], error: null },
        streamingContent: '',
        streamingReasoning: '',
      }));

      const updateAssistant = (patch: Partial<HistoryMessage>) => {
        set((st) => ({
          messages: st.messages.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
        }));
      };

      const agentEnabled = settings.agent.autonomy !== 'off';

      abortController = api.streamChat(
        {
          sessionId,
          content: text,
          attachments,
          agent: agentEnabled,
          model: settings.api.model,
          maxTurns: settings.agent.maxTurns,
          autonomy: settings.agent.autonomy,
          reviewRequired: settings.agent.reviewRequired,
          promptPresetId: (settings.ui.activePromptPresetId as string | null) ?? null,
        },
        {
          onReasoning: (t) => {
            set((st) => ({ streamingReasoning: st.streamingReasoning + t }));
            updateAssistant({ reasoning: get().streamingReasoning });
          },
          onDelta: (t) => {
            set((st) => ({ streamingContent: st.streamingContent + t }));
            updateAssistant({ content: get().streamingContent });
          },
          onToolCall: () => undefined,
          onToolCallResult: (r) => {
            set((st) => ({
              streaming: {
                ...st.streaming,
                toolLog: [...st.streaming.toolLog, { id: r.id, name: r.name, args: r.args, result: r.result, staged: r.staged, ts: Date.now() }],
              },
            }));
          },
          onTurn: (n) => set((st) => ({ streaming: { ...st.streaming, turns: n } })),
          onError: (msg) => set((st) => ({ streaming: { ...st.streaming, error: msg, active: false } })),
          onFinal: async () => {
            set((st) => ({ streaming: { ...st.streaming, active: false, error: null } }));
            abortController = null;
            // Ignore stale completion for a session the user switched away from mid-stream.
            if (get().currentSessionId !== sessionId) return;
            try {
              const session = await api.getSession(sessionId);
              if (get().currentSessionId !== sessionId) return;
              set({ currentSession: session, messages: session.messages });
            } catch { /* ignore */ }
            await Promise.all([get().refreshSessions(), get().refreshLorebooks(), get().refreshReview()]);
          },
        },
      );
    },

    stopStream: () => {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      set((st) => ({ streaming: { ...st.streaming, active: false, error: null } }));
    },

    updatePanel: (id, patch) => {
      set((st) => {
        const panels = {
          ...st.panels,
          [id]: { ...st.panels[id], ...patch },
        };
        persistLayout(panels);
        return { panels };
      });
    },

    togglePanel: (id) => {
      set((st) => {
        const panels = {
          ...st.panels,
          [id]: { ...st.panels[id], visible: !st.panels[id].visible, maximized: false },
        };
        persistLayout(panels);
        return { panels };
      });
    },

    toggleLock: () => {
      set((st) => ({ panelLocked: !st.panelLocked }));
      persistLayout(get().panels);
    },

    setPanelLocked: (locked) => {
      set({ panelLocked: locked });
      persistLayout(get().panels);
    },

    resetLayout: () => {
      set({ panels: defaultPanels() });
      persistLayout(get().panels);
    },
  };
});
