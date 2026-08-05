import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Attachment } from '../../types';
import MessageBubble from './MessageBubble';
import ToolLogView from './ToolLogView';
import { UploadButton, AttachmentPreview } from './UploadButton';

export default function ChatWindow() {
  const messages = useStore((s) => s.messages);
  const streaming = useStore((s) => s.streaming);
  const streamingContent = useStore((s) => s.streamingContent);
  const streamingReasoning = useStore((s) => s.streamingReasoning);
  const sendMessage = useStore((s) => s.sendMessage);
  const stopStream = useStore((s) => s.stopStream);
  const currentSession = useStore((s) => s.currentSession);
  const agentAutonomy = useStore((s) => s.settings?.agent.autonomy);

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const submit = () => {
    if (streaming.active) return;
    const content = text.trim();
    if (!content && !attachments.length) return;
    setText('');
    setAttachments([]);
    void sendMessage(content, attachments);
  };

  const placeholder = streaming.active
    ? `streaming… ${currentSession?.model || ''}`
    : agentAutonomy === 'off'
      ? 'Type a message…'
      : `Message the World Architect${agentAutonomy === 'autonomous' ? ' (autonomous mode)' : ''}…`;

  return (
    <div className="chat-wrap">
      <div className="message-list" ref={listRef}>
        {!messages.length && (
          <div className="empty-state">
            <div style={{ fontSize: 15, color: 'var(--text-dim)', marginBottom: 6 }}>Welcome to LOREDECK</div>
            Discuss a world with the model — entries are suggested, drafted and refined live.
            Enable <b>Agent</b> mode to let the model build your lorebook autonomously with review control.
          </div>
        )}
        {messages.map((m, i) => {
          const isStreaming = streaming.active && m.id === streaming.assistantId;
          return <MessageBubble key={m.id} msg={isStreaming ? { ...m, content: streamingContent, reasoning: streamingReasoning } : m} streaming={isStreaming} />;
        })}
        {streaming.active && streaming.toolLog.length > 0 && <ToolLogView />}
        {streaming.error && (
          <div className="notice err" style={{ alignSelf: 'center', maxWidth: 500 }}>
            <b>Error:</b> {streaming.error}
          </div>
        )}
      </div>

      <div className="composer">
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((att) => (
              <AttachmentPreview key={att.id} att={att} onRemove={() => setAttachments((a) => a.filter((x) => x.id !== att.id))} />
            ))}
          </div>
        )}
        <div className="input-row">
          <textarea
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
          />
          <UploadButton onUploaded={(att) => setAttachments((a) => [...a, att])} />
          {streaming.active ? (
            <button className="icon-btn stop" onClick={stopStream} title="Stop generating">■</button>
          ) : (
            <button className="icon-btn accent" onClick={submit} title="Send (Enter)" disabled={!text.trim() && !attachments.length}>➤</button>
          )}
        </div>
      </div>
    </div>
  );
}
