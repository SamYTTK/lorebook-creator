import { useState } from 'react';
import { api } from '../../lib/api';
import type { LorebookEntry } from '../../types';

export default function EntryEditor({
  entry,
  entryId,
  lorebookId,
  isNew,
  onClose,
  onSaved,
}: {
  entry: LorebookEntry | null;
  entryId: string | null;
  lorebookId: string;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [keysText, setKeysText] = useState(entry ? [...new Set([entry.key, ...(entry.keys || [])])].join(', ') : '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [order, setOrder] = useState(entry?.order ?? 100);
  const [constant, setConstant] = useState(entry?.constant ?? false);
  const [enabled, setEnabled] = useState(entry?.enabled ?? true);
  const [depth, setDepth] = useState(entry?.depth ?? 0);
  const [addMemo, setAddMemo] = useState(entry?.addMemo ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const keys = keysText.split(',').map((k) => k.trim()).filter(Boolean);
    if (!keys.length && !constant) {
      setError('Provide at least one trigger key, or enable "Always active".');
      setSaving(false);
      return;
    }
    try {
      const patch: Partial<LorebookEntry> = {
        keys,
        key: keys[0] ?? entry?.key ?? '',
        content,
        comment,
        order,
        constant,
        enabled,
        depth,
        addMemo,
      };
      if (isNew) {
        await api.addEntry(lorebookId, patch);
      } else if (entryId) {
        await api.updateEntry(lorebookId, entryId, patch);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!entryId) return;
    if (!confirm('Delete this entry?')) return;
    setSaving(true);
    try {
      await api.deleteEntry(lorebookId, entryId);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-2)', zIndex: 20, display: 'flex', flexDirection: 'column' }}>
      <div className="row-between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <b>{isNew ? 'New entry' : 'Edit entry'}</b>
        <button className="panel-btn" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body-pad" style={{ flex: 1, overflow: 'auto' }}>
        <div className="field">
          <label>Trigger keys (comma separated)</label>
          <input type="text" value={keysText} onChange={(e) => setKeysText(e.target.value)} placeholder="Aerilon, capital, Aerilon City" />
        </div>
        <div className="field">
          <label>Content (shown to model when activated)</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} placeholder="The world info text…" />
        </div>
        <div className="field">
          <label>Comment / description</label>
          <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Internal note, not shown to model" />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Order (lower = earlier)</label>
            <input type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Depth</label>
            <input type="number" value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
          </div>
        </div>
        <label className="check-row"><input type="checkbox" checked={constant} onChange={(e) => setConstant(e.target.checked)} /> Always active</label>
        <label className="check-row"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
        <label className="check-row"><input type="checkbox" checked={addMemo} onChange={(e) => setAddMemo(e.target.checked)} /> Prepend keys to content</label>
        {error && <div className="notice err">{error}</div>}
      </div>
      <div className="row-between" style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
        <div>
          {!isNew && <button className="btn danger sm" onClick={() => void remove()} disabled={saving}>Delete</button>}
        </div>
        <div className="row">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
