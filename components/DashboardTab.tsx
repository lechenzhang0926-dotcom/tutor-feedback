'use client';

import { getTodayActivity, getRecentStudentIds } from '@/lib/dashboardUtils';
import { getStudents, getHistory, getStudentById } from '@/lib/storage';
import { COURSE_TYPE_LABEL } from '@/lib/types';
import type { FeedbackRecord, StudentProfile } from '@/lib/types';

interface Props {
  onNavigate: (tab: string) => void;
  onSelectStudent: (studentId: string) => void;
  onCopy: (text: string) => void;
}

export function DashboardTab({ onNavigate, onSelectStudent, onCopy }: Props) {
  const activity = getTodayActivity();
  const students = getStudents();
  const history = getHistory();
  const recentIds = getRecentStudentIds();

  // 最近使用学生：优先 recentIds，否则 students 前 5 个
  const recentStudents: StudentProfile[] = [];
  for (const id of recentIds) {
    const s = getStudentById(id);
    if (s) recentStudents.push(s);
    if (recentStudents.length >= 5) break;
  }
  if (recentStudents.length < 5) {
    for (const s of students) {
      if (!recentStudents.find((rs) => rs.id === s.id)) {
        recentStudents.push(s);
        if (recentStudents.length >= 5) break;
      }
    }
  }

  // 最近反馈：history 前 5 条
  const recentFeedbacks = history.slice(0, 5);

  return (
    <div>
      {/* 欢迎语 */}
      <div className="card">
        <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>欢迎回来</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14 }}>
          <Stat label="今日反馈" value={activity.feedbackCount} />
          <Stat label="作业消息" value={activity.homeworkMsgCount} />
          <Stat label="会议提醒" value={activity.meetingCount} />
          <Stat label="学生档案" value={students.length} />
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="card">
        <div className="card-title">快捷入口</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => onNavigate('regular-feedback')}>
            生成课后反馈
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate('regular-homework')}>
            制作正课作业
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate('meeting')}>
            生成会议提醒
          </button>
        </div>
      </div>

      {/* 最近使用学生 */}
      {recentStudents.length > 0 && (
        <div className="card">
          <div className="card-title">最近学生</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recentStudents.map((s) => (
              <button
                key={s.id}
                className="btn btn-ghost"
                onClick={() => { onSelectStudent(s.id); onNavigate('regular-feedback'); }}
                style={{ fontSize: '.84rem', padding: '6px 16px' }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 最近反馈 */}
      <div className="card">
        <div className="card-title">最近反馈</div>
        {recentFeedbacks.length === 0 ? (
          <div className="empty-state">暂无反馈记录</div>
        ) : (
          recentFeedbacks.map((fb: FeedbackRecord) => (
            <div key={fb.id} className="history-item">
              <div className="history-meta">
                <span>{formatShortDate(fb.createdAt)}</span>
                <span>{fb.studentName}</span>
                <span className="tag">{COURSE_TYPE_LABEL[fb.courseType] || '正课'}</span>
              </div>
              <div className="history-text">{truncate(fb.feedback, 60)}</div>
              <div className="history-actions">
                <button onClick={() => onCopy(fb.feedback)}>复制</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontSize: '.76rem', color: 'var(--muted)' }}>{label}</div>
    </div>
  );
}

function truncate(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '...' : text;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
