import { useEffect, useMemo } from 'react';
import { useStore, PANEL_DEFS } from './store/useStore';
import TopBar from './components/layout/TopBar';
import ChatWindow from './components/chat/ChatWindow';
import LorebookPanel from './components/lorebook/LorebookPanel';
import AgentPanel from './components/agent/AgentPanel';
import PromptPanel from './components/prompts/PromptPanel';
import RecentChangesPanel from './components/recent/RecentChangesPanel';
import SettingsPanel from './components/settings/SettingsPanel';
import FloatingPanel from './components/layout/FloatingPanel';
import { Rnd } from 'react-rnd';

function PanelContent({ id }: { id: string }) {
  switch (id) {
    case 'chat': return <ChatWindow />;
    case 'lorebook': return <LorebookPanel />;
    case 'agent': return <AgentPanel />;
    case 'prompts': return <PromptPanel />;
    case 'recent': return <RecentChangesPanel />;
    case 'settings': return <SettingsPanel />;
    default: return <div className="empty-state">Unknown panel</div>;
  }
}

export default function App() {
  const init = useStore((s) => s.init);
  const initialized = useStore((s) => s.initialized);
  const panels = useStore((s) => s.panels);
  const locked = useStore((s) => s.panelLocked);

  useEffect(() => {
    void init();
  }, [init]);

  const panelIds = useMemo(() => PANEL_DEFS.map((p) => p.id), []);

  if (!initialized) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 12, color: 'var(--accent-2)', fontWeight: 700 }}>Lorebook Creator</div>
          <div className="typing-dots"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh' }}>
      <TopBar />
      <div id="panel-host-root" style={{ position: 'absolute', top: 34, left: 0, right: 0, bottom: 0 }}>
        {panelIds.map((id) => {
          const config = panels[id];
          if (!config || !config.visible) return null;
          const isChat = id === 'chat';
          return (
            <Rnd
              key={id}
              bounds="parent"
              enableResizing={!locked}
              disableDragging={locked}
              size={{ width: config.width, height: config.height }}
              position={{ x: config.x, y: config.y }}
              minWidth={config.minWidth}
              minHeight={config.minHeight}
              onDragStop={(_e, d) => useStore.getState().updatePanel(id, { x: d.x, y: d.y })}
              onResizeStop={(_e, _dir, ref, _delta, pos) =>
                useStore.getState().updatePanel(id, { width: ref.offsetWidth, height: ref.offsetHeight, x: pos.x, y: pos.y })
              }
              style={{ zIndex: isChat ? 1 : 2 }}
            >
              <div className="panel" style={{ height: '100%' }}>
                <FloatingPanel
                  id={id}
                  title={config.title}
                  closable={!isChat}
                  onClose={() => useStore.getState().togglePanel(id)}
                />
                <PanelContent id={id} />
              </div>
            </Rnd>
          );
        })}
      </div>
    </div>
  );
}
