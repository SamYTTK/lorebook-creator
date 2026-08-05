import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { api } from '../../lib/api';
import type { LorebookEntry } from '../../types';
import LorebookImporter from './LorebookImporter';
import EntryEditor from './EntryEditor';

export default function LorebookPanel() {
  const lorebooks = useStore((s) => s.lorebooks);
  const currentLorebook = useStore((s) => s.currentLorebook);
  const selectLorebook = useStore((s) => s.selectLorebook);
  const createLorebook = useStore((s) => s.createLorebook);
  const refreshLorebooks = useStore((s) => s.refreshLorebooks);

  const [tab, setTab] = useState<'entries' | 'import' | 'new' | 'preview'>('entries');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LorebookEntry | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [preview, setPreview] = useState<{ activated: Array<{ entryId: string; matchedKeys: string[]; entry: LorebookEntry }>; block: string } | null>(null);

  const entries = useMemo(() => {
    if (!currentLorebook) return [];
    const list = Object.entries(currentLorebook.entries).map(([id, e]) => ({ id, entry: e }));
    const q = search.trim().toLowerCase();
    if (q) {
      return list.filter(({ entry }) => {
        const keys = [entry.key, ...entry.keys].join(' ');
        return keys.toLowerCase().includes(q) || entry.comment.toLowerCase().includes(q) || entry.content.toLowerCase().includes(q);
      });
    }
    return list.sort((a, b) => a.entry.order - b.entry.order);
  }, [currentLorebook, search]);

  if (!currentLorebook) {
    return (
      <div className="panel-body-pad">
        <div className="empty-state">
          No lorebook selected. Create or import one to start building your world.
        </div>
        <div className="field">
          <label>New lorebook name</label>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My World" />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional world description" rows={2} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" disabled={!newName.trim()} onClick={() => void createLorebook(newName.trim(), newDesc)}>Create lorebook</button>
          <button className="btn" onClick={() => setTab('import')}>Import…</button>
        </div>
        {tab === 'import' && <div style={{ marginTop: 10 }}><LorebookImporter /></div>}
      </div>
    );
  }

  const runPreview = async () => {
    setPreview(null);
    const res = await api.previewLorebook(currentLorebook.name, previewText);
    setPreview(res);
  };

  const startEdit = (id: string, entry: LorebookEntry) => {
    setEditing({ ...entry });
    setEditingId(id);
    setTab('entries');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-body-pad" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentLorebook.name}</b>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn sm" title="Export as SillyTavern-compatible JSON" onClick={() => void (async () => {
              const lb = await api.exportLorebook(currentLorebook.name);
              const blob = new Blob([JSON.stringify(lb, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `${currentLorebook.name}.lorebook.json`;
              a.click(); URL.revokeObjectURL(url);
            })}>⭳</button>
            <button className="btn sm" title="New entry" onClick={() => { setEditing(null); setEditingId(null); setCreating(true); setTab('entries'); }}>＋</button>
          </div>
        </div>
        <select
          value={currentLorebook.name}
          onChange={(e) => { void selectLorebook(e.target.value); }}
          style={{ width: '100%', background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px' }}
        >
          {lorebooks.map((lb) => <option key={lb.id} value={lb.id}>{lb.name} ({lb.entryCount})</option>)}
        </select>
      </div>

      <div className="tabs" style={{ margin: '8px 12px 0' }}>
        <button className={tab === 'entries' ? 'active' : ''} onClick={() => setTab('entries')}>Entries</button>
        <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>Context</button>
        <button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>Import</button>
      </div>

      <div className="panel-body-pad" style={{ flex: 1, overflow: 'auto', paddingTop: 8 }}>
        {tab === 'entries' && (
          <>
            <input
              type="text"
              placeholder={`Search ${entries.length} entries…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 9px', marginBottom: 8 }}
            />
            <div className="list">
              {entries.map(({ id, entry }) => (
                <div
                  key={id}
                  className={`list-item ${selectedId === id ? 'active' : ''}`}
                  onClick={() => { setSelectedId(id); startEdit(id, entry); }}
                >
                  <span className="name" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {[entry.key, ...(entry.keys || [])].filter(Boolean).join(', ') || '(no keys)'}
                  </span>
                  <span className="sub">{entry.enabled ? '' : 'off '}{entry.constant ? '★' : ''}{entry.order}</span>
                </div>
              ))}
              {!entries.length && <div className="empty-state">No entries yet — ask the agent to build some.</div>}
            </div>
          </>
        )}

        {tab === 'preview' && (
          <>
            <div className="field">
              <label>Conversation text to scan</label>
              <textarea value={previewText} onChange={(e) => setPreviewText(e.target.value)} rows={5} placeholder="Type a snippet of the story here to see which entries activate…" />
            </div>
            <button className="btn primary" onClick={() => void runPreview()}>Preview context</button>
            {preview && (
              <>
                <div className="section-title">Activated ({preview.activated.length})</div>
                <div className="list" style={{ gap: 2 }}>
                  {preview.activated.map((a) => (
                    <div className="list-item" key={a.entryId} onClick={() => startEdit(a.entryId, a.entry)}>
                      <span className="name" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{a.matchedKeys.join(', ') || a.entry.key}</span>
                    </div>
                  ))}
                  {!preview.activated.length && <div className="empty-state">Nothing activates for that text.</div>}
                </div>
                <div className="section-title">Context block</div>
                <div className="code">{preview.block || '(empty)'}</div>
              </>
            )}
          </>
        )}

        {tab === 'import' && <LorebookImporter />}
      </div>

      {(editing || creating) && (
        <EntryEditor
          entry={editing}
          entryId={editingId}
          lorebookId={currentLorebook.name}
          isNew={creating}
          onClose={() => { setEditing(null); setEditingId(null); setCreating(false); }}
          onSaved={async () => { setEditing(null); setEditingId(null); setCreating(false); await refreshLorebooks(); }}
        />
      )}
    </div>
  );
}
