import { useStore } from '../../store/useStore';
import { timeAgo } from '../../lib/format';

export default function RecentChangesPanel() {
  const review = useStore((s) => s.review);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const selectSession = useStore((s) => s.selectSession);
  const streaming = useStore((s) => s.streaming);

  const applied = review.all.filter((c) => c.status === 'applied').slice().reverse();
  const recentSessions = sessions.slice(0, 15);

  return (
    <div className="panel-body-pad">
      <div className="section-title">Chats</div>
      <div className="list">
        {recentSessions.map((s) => (
          <div
            key={s.id}
            className={`list-item ${currentSessionId === s.id ? 'active' : ''}`}
            onClick={() => { if (!streaming.active) void selectSession(s.id); }}
          >
            <span className="name">{s.title}</span>
            <span className="sub">{timeAgo(s.updatedAt)} · {s.messageCount}</span>
          </div>
        ))}
        {!recentSessions.length && <div className="empty-state">No chats yet.</div>}
      </div>

      <div className="section-title">Lorebook activity</div>
      <div className="list" style={{ gap: 2 }}>
        {applied.slice(0, 20).map((c) => (
          <div className="list-item" key={c.id} style={{ cursor: 'default' }}>
            <span className={`badge ${c.type}`} style={{ textTransform: 'uppercase', fontSize: 9, background: 'var(--green-bg)', color: 'var(--green)' }}>{c.type}</span>
            <span className="name" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.proposed?.key || c.proposed?.keys?.[0] || c.entryId}</span>
            <span className="sub">{timeAgo(c.appliedAt || c.createdAt)}</span>
          </div>
        ))}
        {!applied.length && <div className="empty-state">No applied lorebook changes yet. Approved agent edits appear here.</div>}
      </div>

      <div className="section-title">Last agent turns</div>
      {streaming.toolLog.length ? (
        <div className="list" style={{ gap: 2 }}>
          {streaming.toolLog.map((t, i) => (
            <div className="list-item" key={i} style={{ cursor: 'default' }}>
              <span className={`badge ${t.staged ? 'staged' : 'applied'}`}>{t.staged ? 'staged' : 'ok'}</span>
              <span className="name" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{t.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">Nothing yet.</div>
      )}
    </div>
  );
}
