import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { api } from '../../lib/api';
import { downloadText, readFileAsText } from '../../lib/format';
import type { PromptBlock } from '../../types';

let localSeq = 0;
const blank = (): PromptBlock => ({ id: `local-${Date.now()}-${localSeq++}`, name: '', content: '', role: 'system', depth: 4, position: 0, injection: false, enabled: true, strip: true });

export default function PromptPanel() {
  const presets = useStore((s) => s.presets);
  const activePreset = useStore((s) => s.activePreset);
  const refreshPresets = useStore((s) => s.refreshPresets);
  const selectPreset = useStore((s) => s.selectPreset);

  const [working, setWorking] = useState<PromptBlock[] | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (activePreset && working === null) {
      setName(activePreset.name);
      setWorking(activePreset.blocks.map((b) => ({ ...b })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePreset]);

  const dirty = useMemo(() => {
    if (!working || !activePreset) return false;
    return JSON.stringify(working) !== JSON.stringify(activePreset.blocks);
  }, [working, activePreset]);

  const addBlock = () => setWorking((w) => [...(w ?? []), blank()]);

  const updateBlock = (i: number, patch: Partial<PromptBlock>) =>
    setWorking((w) => (w ?? []).map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const removeBlock = (i: number) => setWorking((w) => (w ?? []).filter((_, idx) => idx !== i));

  const save = async () => {
    if (!working) return;
    try {
      if (activePreset) {
        await api.updatePreset(activePreset.id, { name, blocks: working });
      } else {
        await api.createPreset(name || 'My Preset', working);
      }
      await refreshPresets();
      setMsg({ type: 'ok', text: 'Preset saved.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await readFileAsText(file);
      const data = JSON.parse(text);
      const preset = await api.importPreset(name || file.name.replace(/\.json$/i, ''), data);
      setMsg({ type: 'ok', text: `Imported "${preset.name}" with ${preset.blocks.length} blocks.` });
      await refreshPresets();
      await selectPreset(preset.id);
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    }
  };

  if (!working) {
    return (
      <div className="panel-body-pad">
        <div className="empty-state">No prompt preset selected.</div>
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <label className="btn" style={{ cursor: 'pointer', justifyContent: 'center' }}>
            📂 Import SillyTavern preset
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleImport(f); }} />
          </label>
          <button className="btn primary" onClick={() => { setWorking([]); setName('My Preset'); }}>Create blank preset</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-body-pad" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <select
            value={activePreset?.id ?? ''}
            onChange={(e) => {
              if (e.target.value) void selectPreset(e.target.value);
            }}
            style={{ flex: 1, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px' }}
          >
            <option value="">— new / select —</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.blockCount})</option>)}
          </select>
          <button className="btn sm" title="Delete preset" onClick={() => { if (activePreset && confirm(`Delete preset "${activePreset.name}"?`)) { void (async () => { await api.deletePreset(activePreset.id); setWorking(null); await refreshPresets(); })(); } }}>🗑</button>
          <button className="btn sm" title="Export preset (SillyTavern format)" onClick={() => { if (activePreset) { void (async () => { const p = await api.exportPreset(activePreset.id); downloadText(`${p.name}.preset.json`, JSON.stringify({ name: p.name, messages: p.blocks }, null, 2)); })(); } }}>⭳</button>
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name" style={{ flex: 1, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px' }} />
          <button className="btn sm" onClick={() => void save()} disabled={!working.length}>Save</button>
          {dirty && <span className="hint" style={{ color: 'var(--amber)' }}>●</span>}
        </div>
        {msg && <div className={`notice ${msg.type === 'ok' ? 'info' : 'err'}`}>{msg.text}</div>}
        <div className="hint">
          <b>depth</b> = messages from end (0 = right before your turn) · <b>position</b> 0 = top / 1 = bottom of its depth group · <b>injection</b> = inject as its own message vs. prepend as system content. Matches SillyTavern prompt manager fields.
        </div>
      </div>

      <div className="panel-body-pad" style={{ flex: 1, overflow: 'auto', paddingTop: 8 }}>
        {working.map((b, i) => (
          <PromptBlockEditor key={b.id} block={b} index={i} onChange={(patch) => updateBlock(i, patch)} onRemove={() => removeBlock(i)} />
        ))}
        {!working.length && <div className="empty-state">No prompt blocks yet. Add one below.</div>}
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={addBlock}>＋ Add prompt block</button>
      </div>
    </div>
  );
}

function PromptBlockEditor({ block, index, onChange, onRemove }: { block: PromptBlock; index: number; onChange: (patch: Partial<PromptBlock>) => void; onRemove: () => void }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 8, background: 'var(--bg-3)' }}>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <b style={{ fontSize: 12 }}>#{index + 1} {block.name && <span style={{ color: 'var(--accent-2)' }}>({block.name})</span>}</b>
        <div className="row" style={{ gap: 6 }}>
          <label className="check-row" style={{ fontSize: 11 }}><input type="checkbox" checked={block.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} /> on</label>
          <button className="panel-btn" onClick={onRemove}>✕</button>
        </div>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Name</label>
          <input type="text" value={block.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="block name" style={{ padding: '3px 6px' }} />
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Role</label>
          <select value={block.role} onChange={(e) => onChange({ role: e.target.value as PromptBlock['role'] })} style={{ padding: '3px 6px' }}>
            <option value="system">system</option>
            <option value="user">user</option>
            <option value="assistant">assistant</option>
          </select>
        </div>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Depth</label>
          <input type="number" min={0} value={block.depth} onChange={(e) => onChange({ depth: Number(e.target.value) })} style={{ padding: '3px 6px' }} />
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Position</label>
          <select value={block.position} onChange={(e) => onChange({ position: Number(e.target.value) as 0 | 1 })} style={{ padding: '3px 6px' }}>
            <option value={0}>Top</option>
            <option value={1}>Bottom</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Inject</label>
          <select value={block.injection ? 1 : 0} onChange={(e) => onChange({ injection: e.target.value === '1' })} style={{ padding: '3px 6px' }}>
            <option value={0}>System content</option>
            <option value={1}>Own message</option>
          </select>
        </div>
        <label className="check-row" style={{ marginTop: 18 }}><input type="checkbox" checked={block.strip} onChange={(e) => onChange({ strip: e.target.checked })} /> strip</label>
      </div>
      <textarea
        rows={4}
        value={block.content}
        onChange={(e) => onChange({ content: e.target.value })}
        placeholder="Prompt content. Supports {char}, {user}, {time} placeholders."
        style={{ width: '100%', background: 'var(--bg-4)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
      />
    </div>
  );
}
