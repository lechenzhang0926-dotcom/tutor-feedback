'use client';

import type { FeedbackRecord } from '@/lib/types';
import { COURSE_TYPE_LABEL } from '@/lib/types';

interface Props {
  history: FeedbackRecord[];
  onCopy: (text: string) => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function HistoryList({ history, onCopy, onDelete }: Props) {
  return (
    <div className="card">
      <div className="card-title">
        历史记录
        {history.length > 0 && (
          <span style={{ fontWeight: 400, fontSize: '.78rem', color: 'var(--muted)' }}>
            ({history.length})
          </span>
        )}
      </div>

      {history.length === 0 ? (
        <div className="empty-state">暂无记录</div>
      ) : (
        history.map((item) => (
          <div key={item.id} className="history-item">
            <div className="history-meta">
              <span>{formatDate(item.createdAt)}</span>
              <span>{item.studentName}</span>
              <span className="tag">{COURSE_TYPE_LABEL[item.courseType]}</span>
            </div>
            <div className="history-text">{item.feedback}</div>
            <div className="history-actions">
              <button onClick={() => onCopy(item.feedback)}>复制</button>
              <button className="danger" onClick={() => onDelete(item.id)}>
                删除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
