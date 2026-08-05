import { useStore } from '../../store/useStore';
import type { Attachment } from '../../types';
import { api } from '../../lib/api';

const MAX_UPLOAD_BYTES = 90 * 1024 * 1024;

export function UploadButton({ onUploaded }: { onUploaded: (att: Attachment) => void }) {
  return (
    <label className="icon-btn" title="Attach image, audio or video" style={{ cursor: 'pointer' }}>
      ➕
      <input
        type="file"
        accept="image/*,audio/*,video/*"
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          for (const file of files) {
            if (file.size > MAX_UPLOAD_BYTES) {
              alert(`${file.name} is larger than 90MB and was skipped.`);
              continue;
            }
            try {
              const att = await api.uploadMedia(file);
              onUploaded(att);
            } catch (err) {
              alert(`Upload failed for ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }}
      />
    </label>
  );
}

export function AttachmentPreview({ att, onRemove }: { att: Attachment; onRemove?: () => void }) {
  const url = api.mediaUrl(att.url.split('/').pop() || '');
  return (
    <div className="attach-chip" title={att.name}>
      {att.kind === 'image' ? (
        <img src={url} alt={att.name} className="attach-thumb" />
      ) : (
        <span style={{ fontSize: 15 }}>{att.kind === 'video' ? '🎬' : '🎵'}</span>
      )}
      <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
      {onRemove && (
        <button className="panel-btn" onClick={onRemove} style={{ color: 'var(--red)' }}>✕</button>
      )}
    </div>
  );
}
