import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { api } from '../../lib/api';
import { timeAgo, truncate } from '../../lib/format';
import type { StagedChange } from '../../types';

const TOOL_LABELS: Record<string, string> = {
  lorebook_list_entries: 'List entries',
  lorebook_get_entry: 'Get entry',
  lorebook_search_entries: 'Search entries',
  lorebook_create_entry: 'Create entry',
  lorebook_update_entry: 'Update entry',
  lorebook_delete_entry: 'Delete entry',
  lorebook_bulk_upsert: 'Bulk upsert',
  lorebook_get_context: 'Show context',
};

export default function AgentPanel() {
  const [tab, setTab] = useState<'agent' | 'review'>('agent');
  const review = useStore((s) => s.review);
  const refreshReview = useStore((s) => s.refreshReview);
  const refreshLorebooks = useStore((s) => s.refreshLorebooks);
  const pendingCount = review.pending.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="tabs" style={{ margin: '8px 12px 0' }}>
        <button className={tab === 'agent' ? 'active' : ''} onClick={() => setTab('agent')}>Agent</button>
        <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Review {pendingCount > 0 && `(${pendingCount})`}</button>
      </div>
      <div className="panel-body-pad" style={{ flex: 1, overflow: 'auto', paddingTop: 8 }}>
        {tab === 'agent' ? <AgentConfig /> : <ReviewQueue />}
      </div>
    </div>
  );
}

function AgentConfig() {
  const settings = useStore((s) => s.settings)!;
  const saveSettings = useStore((s) => s.saveSettings);
  const agent = settings.agent;

  const set = (patch: Partial<typeof agent>) => void saveSettings({ agent: { ...agent, ...patch } });

  return (
    <div>
      <div className="notice info">
        <b>Agent mode</b> lets the model call lorebook tools while chatting. Toggle <b>review</b> to approve or reject every change before it is committed.
      </div>
      <div className="field">
        <label>Autonomy</label>
        <select value={agent.autonomy} onChange={(e) => set({ autonomy: e.target.value as typeof agent.autonomy })}>
          <option value="off">Off — no tool access</option>
          <option value="collaborative">Collaborative — tools, but waits for you</option>
          <option value="autonomous">Autonomous — builds and iterates freely</option>
        </select>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={agent.reviewRequired} onChange={(e) => set({ reviewRequired: e.target.checked })} />
        Require review before committing changes
      </label>
      <div className="field" style={{ marginTop: 8 }}>
        <label>Max tool turns</label>
        <input type="number" min={0} max={20} value={agent.maxTurns} onChange={(e) => set({ maxTurns: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label>Agent system prompt</label>
        <textarea rows={7} value={agent.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} placeholder="Leave empty to use the built-in World Architect prompt…" />
      </div>
      <div className="section-title">Allowed tools (permissions)</div>
      {Object.entries(TOOL_LABELS).map(([name, label]) => {
        const on = agent.enabledTools.includes(name);
        return (
          <label className="check-row" key={name}>
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => {
                const tools = e.target.checked ? [...agent.enabledTools, name] : agent.enabledTools.filter((t) => t !== name);
                set({ enabledTools: tools });
              }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{name}</span>
            <span className="hint">— {label}</span>
          </label>
        );
      })}
    </div>
  );
}

function ReviewQueue() {
  const review = useStore((s) => s.review);
  const refreshReview = useStore((s) => s.refreshReview);
  const refreshLorebooks = useStore((s) => s.refreshLorebooks);
  const streaming = useStore((s) => s.streaming);
  const [busy, setBusy] = useState(false);

  const apply = async (id: string) => {
    setBusy(true);
    try {
      await api.applyChange(id);
      await Promise.all([refreshReview(), refreshLorebooks()]);
    } finally {
      setBusy(false);
    }
  };
  const reject = async (id: string) => {
    setBusy(true);
    try {
      await api.rejectChange(id);
      await refreshReview();
    } finally {
      setBusy(false);
    }
  };
  const applyAll = async () => {
    setBusy(true);
    try {
      await api.applyAll();
      await Promise.all([refreshReview(), refreshLorebooks()]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="hint">{review.pending.length} pending · {review.all.filter((c) => c.status === 'applied').length} applied · {review.all.filter((c) => c.status === 'rejected').length} rejected</span>
        <button className="btn sm primary" onClick={() => void applyAll()} disabled={!review.pending.length || busy || streaming.active}>Apply all</button>
      </div>
      {!review.pending.length && <div className="empty-state">No pending changes. When the agent proposes lorebook edits with review enabled, they land here for your approval.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {review.pending.map((c) => <ReviewItem key={c.id} change={c} onApply={() => void apply(c.id)} onReject={() => void reject(c.id)} disabled={busy} />)}
      </div>
      {(review.all.filter((c) => c.status !== 'pending').length > 0) && (
        <>
          <div className="section-title">History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {review.all.filter((c) => c.status !== 'pending').map((c) => (
              <div className="review-item" key={c.id} style={{ opacity: 0.7 }}>
                <div className="row-between">
                  <span className={`kind ${c.type}`}>{c.type} {c.status}</span>
                  <span className="hint">{timeAgo(c.appliedAt || c.rejectedAt || c.createdAt)}</span>
                </div>
                <div className="hint" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.proposed?.key || c.proposed?.keys?.join(', ') || c.entryId}</div>
              </div>
            ))}
          </div>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => void (async () => { await api.clearReviewHistory(); await refreshReview(); })}>Clear history</button>
        </>
      )}
    </div>
  );
}

function ReviewItem({ change, onApply, onReject, disabled }: { change: StagedChange; onApply: () => void; onReject: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const keys = change.proposed?.keys?.join(', ') || change.proposed?.key || change.entryId || '';
  return (
    <div className="review-item">
      <div className="row-between">
        <span className={`kind ${change.type}`}>{change.type}</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm primary" onClick={onApply} disabled={disabled}>✓ Apply</button>
          <button className="btn sm danger" onClick={onReject} disabled={disabled}>✕</button>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{keys}</div>
      <div className="hint">{change.reason}</div>
      <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? 'Hide diff' : 'Show diff'}</button>
      {open && (
        <>
          <div className="section-title" style={{ margin: '4px 0' }}>Proposed content</div>
          <div className="diff-box">{truncate(change.proposed?.content || '', 800)}</div>
          {change.previous && (
            <>
              <div className="section-title" style={{ margin: '4px 0' }}>Previous</div>
              <div className="diff-box" style={{ opacity: 0.6 }}>{truncate(change.previous?.content || '', 800)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
