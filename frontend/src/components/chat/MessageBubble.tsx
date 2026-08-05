import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { HistoryMessage } from '../../types';
import ReasoningBlock from './ReasoningBlock';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';

function MessageMedia({ msg }: { msg: HistoryMessage }) {
  if (!msg.attachments?.length) return null;
  return (
    <div className="attachments-row">
      {msg.attachments.map((att) =>
        att.kind === 'image' ? (
          <img key={att.id} src={api.mediaUrl(att.url.split('/').pop() || '')} alt={att.name} className="attach-thumb" />
        ) : (
          <span key={att.id} className="attach-chip">{att.kind === 'video' ? '🎬' : '🎵'} {att.name}</span>
        ),
      )}
    </div>
  );
}

export default function MessageBubble({ msg, streaming }: { msg: HistoryMessage; streaming?: boolean }) {
  if (msg.role === 'system') {
    return (
      <div className="message system">
        <div className="msg-bubble">{msg.content}</div>
      </div>
    );
  }

  const isUser = msg.role === 'user';
  const modelName = ''; // no model name on message for now

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && <ReasoningBlock reasoning={msg.reasoning || ''} streaming={streaming} />}
      <MessageMedia msg={msg} />
      <div className="msg-bubble">
        {streaming && !msg.content ? (
          <div className="typing-dots"><span /><span /><span /></div>
        ) : (
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ''}</ReactMarkdown>
            {streaming && <span className="streaming-caret" />}
          </div>
        )}
      </div>
      <div className="msg-meta">{isUser ? 'You' : modelName || 'Assistant'} · {timeAgo(msg.createdAt)}</div>
    </div>
  );
}
