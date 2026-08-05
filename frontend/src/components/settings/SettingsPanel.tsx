import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { api } from '../../lib/api';

const PARAM_FIELDS: Array<{ key: keyof import('../../types').GenerationParams; label: string; step?: number; min?: number; max?: number }> = [
  { key: 'temperature', label: 'Temperature', step: 0.05, min: 0, max: 2 },
  { key: 'top_p', label: 'Top P', step: 0.05, min: 0, max: 1 },
  { key: 'top_k', label: 'Top K', step: 1, min: 0 },
  { key: 'max_tokens', label: 'Max tokens', step: 1, min: 0 },
  { key: 'max_completion_tokens', label: 'Max completion tokens', step: 1, min: 0 },
  { key: 'presence_penalty', label: 'Presence penalty', step: 0.05, min: -2, max: 2 },
  { key: 'frequency_penalty', label: 'Frequency penalty', step: 0.05, min: -2, max: 2 },
];

export default function SettingsPanel() {
  const settings = useStore((s) => s.settings)!;
  const saveSettings = useStore((s) => s.saveSettings);
  const refreshSettings = useStore((s) => s.refreshSettings);
  const refreshLorebooks = useStore((s) => s.refreshLorebooks);

  const [baseUrl, setBaseUrl] = useState(settings.api.baseUrl);
  const [apiKey, setApiKey] = useState(settings.api.apiKey);
  const [extraHeaders, setExtraHeaders] = useState(JSON.stringify(settings.api.extraHeaders || {}, null, 2));
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ ok: boolean; message: string } | null>(null);

  const saveApi = async () => {
    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(extraHeaders || '{}');
    } catch {
      setValidation({ ok: false, message: 'Extra headers must be valid JSON.' });
      return;
    }
    const next = await api.saveSettings({ api: { baseUrl: baseUrl.trim(), apiKey, model: settings.api.model, extraHeaders: headers } });
    useStore.setState({ settings: next });
    setValidation({ ok: true, message: 'Connection settings saved.' });
  };

  const test = async () => {
    setValidating(true);
    setValidation(null);
    try {
      const res = await api.validateConnection(baseUrl.trim(), apiKey);
      if (res.ok) {
        setValidation({ ok: true, message: `Connected — ${res.modelCount} models available.` });
      } else {
        setValidation({ ok: false, message: res.error || 'Connection failed.' });
      }
    } finally {
      setValidating(false);
    }
  };

  const setParam = (key: string, value: string) => {
    const num = value === '' ? null : Number(value);
    void saveSettings({ params: { ...settings.params, [key]: num } });
  };

  const setStop = (value: string) => {
    const stops = value.split('\n').map((s) => s.trim()).filter(Boolean);
    void saveSettings({ params: { ...settings.params, stop: stops.length ? stops : null } });
  };

  return (
    <div className="panel-body-pad">
      <div className="section-title">API connection</div>
      <div className="field">
        <label>Base URL (OpenAI-compatible)</label>
        <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
      </div>
      <div className="field">
        <label>API key</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
      </div>
      <div className="field">
        <label>Extra headers (JSON)</label>
        <textarea rows={3} value={extraHeaders} onChange={(e) => setExtraHeaders(e.target.value)} placeholder="{ &quot;X-Title&quot;: &quot;Loredeck&quot; }" />
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn primary" onClick={() => void saveApi()}>Save connection</button>
        <button className="btn" onClick={() => void test()} disabled={validating}>{validating ? 'Testing…' : 'Test connection'}</button>
      </div>
      {validation && <div className={`notice ${validation.ok ? 'info' : 'err'}`}>{validation.message}</div>}

      <div className="section-title">Main system prompt</div>
      <div className="field">
        <label>Applied to every chat (leave empty for none)</label>
        <textarea rows={6} value={settings.systemPrompt} onChange={(e) => void saveSettings({ systemPrompt: e.target.value })} placeholder="You are the narrator of a gritty fantasy world. Use {user} / {char} placeholders if you like." />
      </div>

      <div className="section-title">Generation parameters</div>
      {PARAM_FIELDS.map((f) => (
        <div className="field" key={f.key}>
          <label>{f.label}</label>
          <input
            type="number"
            step={f.step ?? 1}
            min={f.min}
            max={f.max}
            value={(settings.params[f.key] as unknown as number | null) ?? ''}
            onChange={(e) => setParam(f.key, e.target.value)}
          />
        </div>
      ))}
      <div className="field">
        <label>Reasoning effort</label>
        <select value={settings.params.reasoning_effort ?? ''} onChange={(e) => void saveSettings({ params: { ...settings.params, reasoning_effort: e.target.value || null } })}>
          <option value="">default</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </div>
      <div className="field">
        <label>Stop sequences (one per line)</label>
        <textarea rows={3} value={settings.params.stop?.join('\n') ?? ''} onChange={(e) => setStop(e.target.value)} />
      </div>
      <div className="field">
        <label>Seed</label>
        <input type="number" value={settings.params.seed ?? ''} onChange={(e) => setParam('seed', e.target.value)} />
      </div>

      <div className="section-title">Lorebook context</div>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Insertion depth</label>
          <input type="number" min={0} value={settings.lorebook.insertionDepth} onChange={(e) => void saveSettings({ lorebook: { ...settings.lorebook, insertionDepth: Number(e.target.value) } })} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Role</label>
          <select value={settings.lorebook.role} onChange={(e) => void saveSettings({ lorebook: { ...settings.lorebook, role: e.target.value as 'system' | 'user' | 'assistant' } })}>
            <option value="system">system</option>
            <option value="user">user</option>
            <option value="assistant">assistant</option>
          </select>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Max entries (0 = all)</label>
          <input type="number" min={0} value={settings.lorebook.maxEntries} onChange={(e) => void saveSettings({ lorebook: { ...settings.lorebook, maxEntries: Number(e.target.value) } })} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Scan window (chars)</label>
          <input type="number" min={0} value={settings.lorebook.scanWindowChars} onChange={(e) => void saveSettings({ lorebook: { ...settings.lorebook, scanWindowChars: Number(e.target.value) } })} />
        </div>
      </div>
      <div className="field">
        <label>Context template</label>
        <input type="text" value={settings.lorebook.template} onChange={(e) => void saveSettings({ lorebook: { ...settings.lorebook, template: e.target.value } })} />
      </div>
      <label className="check-row">
        <input type="checkbox" checked={settings.lorebook.showKeys} onChange={(e) => void saveSettings({ lorebook: { ...settings.lorebook, showKeys: e.target.checked } })} />
        Show trigger keys before entry content
      </label>

      <div className="section-title">System</div>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <button className="btn sm" onClick={() => void (async () => { await fetch('/api/llm/cache/clear', { method: 'POST' }); alert('Cache cleared.'); })()}>Clear cache</button>
        <button className="btn sm danger" onClick={() => { if (confirm('Reset all settings?')) { void (async () => { await api.saveSettings({ api: { baseUrl, apiKey, model: 'gpt-4o-mini', extraHeaders: {} } }); }); alert('Done.'); } }}>Reset</button>
      </div>
      <div className="hint">Data lives in the <span className="code" style={{ fontSize: 11 }}>data/</span> folder next to the app. Lorebooks and chats are plain JSON you can edit by hand.</div>
    </div>
  );
}
