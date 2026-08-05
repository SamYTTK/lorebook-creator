import { useState } from 'react';
import { useStore } from '../../store/useStore';

export default function ToolLogView() {
  const toolLog = useStore((s) => s.streaming.toolLog);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  if (!toolLog.length) return null;

  return (
    <div className="tool-log">
      <div className="section-title" style={{ margin: '2px 0 4px' }}>Agent tool calls</div>
      {toolLog.map((entry, i) => {
        const key = `${entry.id}-${i}`;
        const open = openIds[key] ?? false;
        return (
          <div className="tool-entry" key={key}>
            <div className="tool-entry-head" onClick={() => setOpenIds((o) => ({ ...o, [key]: !o }))}>
              <span className="chevron" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>
              <span className="fn">{entry.name}</span>
              <span className={`badge ${entry.staged ? 'staged' : 'applied'}`}>{entry.staged ? 'staged' : 'applied'}</span>
            </div>
            {open && <div className="tool-entry-body">{entry.result}</div>}
          </div>
        );
      })}
    </div>
  );
}
