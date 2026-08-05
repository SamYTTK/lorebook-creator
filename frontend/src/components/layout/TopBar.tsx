import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, PANEL_DEFS } from '../../store/useStore';
import { api } from '../../lib/api';
import { downloadText } from '../../lib/format';

export default function TopBar() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const panels = useStore((s) => s.panels);
  const togglePanel = useStore((s) => s.togglePanel);
  const locked = useStore((s) => s.panelLocked);
  const toggleLock = useStore((s) => s.toggleLock);
  const resetLayout = useStore((s) => s.resetLayout);
  const newSession = useStore((s) => s.newSession);
  const currentSession = useStore((s) => s.currentSession);
  const streaming = useStore((s) => s.streaming);
  const [models, setModels] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refreshModels = useCallback(async () => {
    if (!settings) return;
    setRefreshing(true);
    try {
      const res = await api.getModels(settings.api.baseUrl, settings.api.apiKey);
      setModels(res.models);
    } catch {
      setModels([]);
    } finally {
      setRefreshing(false);
    }
  }, [settings]);

  useEffect(() => {
    if (settings && settings.api.apiKey) void refreshModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.api.baseUrl, settings?.api.apiKey]);

  if (!settings) return null;

  return (
    <div className="topbar">
      <div className="logo"><span className="dot" /> LOREDECK</div>
      <div className="sep" />
      <input
        list="model-list"
        title="Model ID"
        style={{ maxWidth: 200 }}
        value={settings.api.model}
        onChange={(e) => void saveSettings({ api: { ...settings.api, model: e.target.value } })}
        placeholder="model-id"
      />
      <datalist id="model-list">
        {models.map((m) => <option key={m} value={m} />)}
      </datalist>
      <button className="pill-btn" onClick={() => void refreshModels()} title="Fetch models from provider" disabled={refreshing}>
        {refreshing ? '…' : '↻'}
      </button>
      <div className="spacer" />
      {PANEL_DEFS.filter((p) => p.id !== 'chat').map((p) => (
        <button
          key={p.id}
          className={`pill-btn ${panels[p.id]?.visible ? 'active' : ''}`}
          onClick={() => togglePanel(p.id)}
        >
          {p.title}
        </button>
      ))}
      <div className="sep" />
      <button className={`pill-btn ${locked ? 'active' : ''}`} onClick={toggleLock} title="Lock panel layout">
        {locked ? '🔒' : '🔓'} Layout
      </button>
      <button className="pill-btn" onClick={resetLayout} title="Reset panel layout">⟲</button>
      <div className="sep" />
      <button className="pill-btn" onClick={() => void newSession()} disabled={streaming.active}>＋ New chat</button>
      {currentSession && (
        <>
          <button
            className="pill-btn"
            title="Export chat as JSON"
            onClick={() => { void (async () => { const json = await (await fetch(api.exportUrl(currentSession.id, 'json'))).text(); downloadText(`${currentSession.title || currentSession.id}.json`, json); })(); }}
          >
            ⬇ JSON
          </button>
          <button
            className="pill-btn"
            title="Export chat as plain text"
            onClick={() => { void (async () => { const txt = await (await fetch(api.exportUrl(currentSession.id, 'txt'))).text(); downloadText(`${currentSession.title || currentSession.id}.txt`, txt, 'text/plain'); })(); }}
          >
            ⬇ TXT
          </button>
        </>
      )}
    </div>
  );
}
