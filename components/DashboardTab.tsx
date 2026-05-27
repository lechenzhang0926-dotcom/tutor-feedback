'use client';

import { getTodayActivity, getRecentStudentIds } from '@/lib/dashboardUtils';
import { getStudents, getHistory, getStudentById } from '@/lib/storage';
import { COURSE_TYPE_LABEL } from '@/lib/types';
import type { FeedbackRecord, StudentProfile } from '@/lib/types';

interface Props {
  userEmail?: string;
  onNavigate: (tab: string) => void;
  onSelectStudent: (studentId: string) => void;
  onCopy: (text: string) => void;
}

export function DashboardTab({ userEmail, onNavigate, onSelectStudent, onCopy }: Props) {
  const activity = getTodayActivity();
  const students = getStudents();
  const history = getHistory();
  const recentIds = getRecentStudentIds();

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

  const recentFeedbacks = history.slice(0, 5);

  const stats = [
    { label: '今日反馈', value: activity.feedbackCount, hint: '今日已生成' },
    { label: '作业消息', value: activity.homeworkMsgCount, hint: '作业消息已生成' },
    { label: '会议提醒', value: activity.meetingCount, hint: '提醒已发送' },
    { label: '学生档案', value: students.length, hint: '已建档学生' },
  ];

  const quickActions = [
    {
      label: '生成课后反馈',
      desc: '根据课堂情况生成家长反馈',
      tab: 'regular-feedback',
    },
    {
      label: '制作正课作业',
      desc: '生成作业消息和 PDF',
      tab: 'regular-homework',
    },
    {
      label: '生成会议提醒',
      desc: '快速生成上课提醒',
      tab: 'meeting',
    },
  ];

  return (
    <div>
      {/* 欢迎区 */}
      <div className="card">
        <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 4 }}>
          欢迎回来{userEmail ? <span style={{ fontWeight: 400, fontSize: '.8rem', color: 'var(--muted)', marginLeft: 8 }}>{userEmail}</span> : ''}
        </div>
        <div style={{ fontSize: '.88rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          今天可以先从课后反馈或正课作业开始。
        </div>
        <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 6, opacity: .7 }}>
          建议流程：先生成课后反馈 → 再生成作业消息 → 最后发送会议提醒
        </div>
      </div>

      {/* 今日概览 */}
      <div className="dash-stats">
        {stats.map((s) => (
          <div key={s.label} className="dash-stat-card">
            <div className="dash-stat-num">{s.value}</div>
            <div className="dash-stat-label">{s.label}</div>
            <div className="dash-stat-hint">{s.hint}</div>
          </div>
        ))}
      </div>

      {/* 快捷入口 */}
      <div className="dash-actions">
        {quickActions.map((a) => (
          <button key={a.tab} className="dash-action-card" onClick={() => onNavigate(a.tab)}>
            <div className="dash-action-icon">
              {a.tab === 'regular-feedback' ? '📝' : a.tab === 'regular-homework' ? '📄' : '⏰'}
            </div>
            <div className="dash-action-label">{a.label}</div>
            <div className="dash-action-desc">{a.desc}</div>
          </button>
        ))}
      </div>

      {/* 最近学生 */}
      <div className="card">
        <div className="card-title">最近学生</div>
        {recentStudents.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {recentStudents.map((s) => (
              <button
                key={s.id}
                className="dash-student-pill"
                onClick={() => { onSelectStudent(s.id); onNavigate('regular-feedback'); }}
              >
                <span className="dash-student-name">{s.name}</span>
                {s.recentFeedbacks.length > 0 && (
                  <span className="dash-student-count">反馈 {s.recentFeedbacks.length}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '.84rem', color: 'var(--muted)', marginBottom: 12 }}>
              还没有学生档案，先新增学生后可以自动积累学习特点。
            </div>
            <button className="btn btn-ghost" onClick={() => onNavigate('students')}>去新增学生</button>
          </div>
        )}
      </div>

      {/* 最近反馈 */}
      <div className="card">
        <div className="card-title">最近反馈</div>
        {recentFeedbacks.length === 0 ? (
          <div>
            <div style={{ fontSize: '.88rem', color: 'var(--text)', marginBottom: 4 }}>还没有生成反馈</div>
            <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 12 }}>
              生成第一条课后反馈后，会在这里快速查看和复制。
            </div>
            <button className="btn btn-ghost" onClick={() => onNavigate('regular-feedback')}>去生成反馈</button>
          </div>
        ) : (
          recentFeedbacks.map((fb: FeedbackRecord) => (
            <div key={fb.id} className="history-item">
              <div className="history-meta">
                <span>{formatShortDate(fb.createdAt)}</span>
                <span>{fb.studentName}</span>
                <span className="tag">{COURSE_TYPE_LABEL[fb.courseType] || '正课'}</span>
              </div>
              <div className="history-text">{truncate(fb.feedback, 80)}</div>
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

function truncate(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '...' : text;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
