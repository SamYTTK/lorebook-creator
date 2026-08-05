import { useEffect, useRef, useState } from 'react';

export default function ReasoningBlock({ reasoning, streaming }: { reasoning: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streaming && autoOpen) setOpen(true);
  }, [streaming, autoOpen]);

  useEffect(() => {
    if (open && streaming && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [reasoning, open, streaming]);

  if (!reasoning && !streaming) return null;

  return (
    <div className="reasoning-block">
      <div className={`reasoning-head ${open ? 'open' : ''}`} onClick={() => { setOpen(!open); setAutoOpen(false); }}>
        {streaming && <span className="spinner" />}
        <span className="chevron">▸</span>
        <span className="label">Reasoning{streaming ? ' (thinking…)' : ` (${reasoning.split('\n').filter(Boolean).length} lines)`}</span>
      </div>
      {open && (
        <div className="reasoning-body" ref={ref}>
          {reasoning}
          {streaming && <span className="streaming-caret" />}
        </div>
      )}
    </div>
  );
}
