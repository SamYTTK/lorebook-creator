import { useState } from 'react';
import { api } from '../../lib/api';
import { readFileAsText } from '../../lib/format';
import { useStore } from '../../store/useStore';

export default function LorebookImporter() {
  const refreshLorebooks = useStore((s) => s.refreshLorebooks);
  const [status, setStatus] = useState<'idle' | 'invalid' | 'imported'>('idle');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');

  const handleFile = async (file: File) => {
    setStatus('idle');
    setMessage('');
    try {
      const text = await readFileAsText(file);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        setStatus('invalid');
        setMessage('File is not valid JSON.');
        return;
      }
      const validation = await api.validateLorebook(data);
      if (!validation.valid) {
        setStatus('invalid');
        setMessage(validation.reason || 'Not a valid SillyTavern lorebook.');
        return;
      }
      const bookName = (data as { name?: string })?.name || name || file.name.replace(/\.json$/i, '');
      await api.importLorebook(bookName, data);
      setStatus('imported');
      setMessage(`Imported lorebook "${bookName}" with ${validation.entryCount} entries.`);
      await refreshLorebooks();
    } catch (err) {
      setStatus('invalid');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      <div className="hint" style={{ marginBottom: 10 }}>
        Import a SillyTavern lorebook (.json). The format is <span className="code" style={{ fontSize: 11 }}>{'{ entries: {...} }'}</span>.
      </div>
      <div className="field">
        <label>Name override (optional)</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Uses file name / embedded name" />
      </div>
      <label className="btn" style={{ cursor: 'pointer', display: 'inline-flex' }}>
        📂 Choose lorebook file
        <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }} />
      </label>
      {status === 'imported' && <div className="notice" style={{ marginTop: 10, background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid rgba(52,211,153,0.3)' }}>{message}</div>}
      {status === 'invalid' && <div className="notice err" style={{ marginTop: 10 }}>{message}</div>}
      <div className="hint" style={{ marginTop: 12 }}>
        <b>Tip:</b> paste raw JSON in the chat and ask the agent to analyze it, or drop a preset file here.
      </div>
    </div>
  );
}
