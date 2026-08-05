import { useStore } from '../../store/useStore';

export default function FloatingPanel({ id, title, closable, onClose }: { id: string; title: string; closable?: boolean; onClose?: () => void }) {
  const updatePanel = useStore((s) => s.updatePanel);
  const locked = useStore((s) => s.panelLocked);
  const config = useStore((s) => s.panels[id]);
  const isMax = config?.maximized ?? false;

  const toggleMax = () => {
    if (isMax) {
      // restore from saved
      const ui = useStore.getState().settings?.ui as { savedPanel?: Record<string, { x: number; y: number; width: number; height: number }> };
      const saved = ui?.savedPanel?.[id];
      const base = useStore.getState().settings?.ui as { basePanel?: Record<string, { x: number; y: number; width: number; height: number }> };
      const baseCfg = base?.basePanel?.[id] || { x: 20, y: 40, width: 600, height: 500 };
      const restore = saved || baseCfg;
      updatePanel(id, { maximized: false, x: restore.x, y: restore.y, width: restore.width, height: restore.height });
    } else {
      const el = document.getElementById('panel-host-root');
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const s = useStore.getState();
      const saved = (s.settings?.ui as { savedPanel?: Record<string, unknown> })?.savedPanel || {};
      void s.saveSettings({
        ui: { ...s.settings!.ui, savedPanel: { ...saved, [id]: { x: config.x, y: config.y, width: config.width, height: config.height } } },
      });
      updatePanel(id, { maximized: true, x: 0, y: 0, width: rect.width, height: rect.height });
    }
  };

  return (
    <div className="panel-head" onDoubleClick={toggleMax}>
      <span className="title">{title}</span>
      <div className="spacer" />
      {!locked && (
        <button className="panel-btn" title={isMax ? 'Restore' : 'Maximize'} onClick={toggleMax}>{isMax ? '🗗' : '⛶'}</button>
      )}
      {closable && (
        <button className="panel-btn" title="Hide panel" onClick={onClose}>✕</button>
      )}
    </div>
  );
}
