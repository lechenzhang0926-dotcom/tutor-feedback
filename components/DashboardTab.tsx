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

const STATS = [
  { key: 'feedback', icon: '📝', label: '今日反馈', hint: '已生成反馈' },
  { key: 'homework', icon: '📄', label: '作业消息', hint: '已发作业消息' },
  { key: 'meeting', icon: '⏰', label: '会议提醒', hint: '已发会议提醒' },
  { key: 'students', icon: '👩‍🎓', label: '学生档案', hint: '已建档学生' },
] as const;

const ACTIONS = [
  { icon: '📝', label: '生成课后反馈', desc: '把课堂记录整理成家长可读反馈', btn: '开始生成', tab: 'regular-feedback' },
  { icon: '📄', label: '制作正课作业', desc: '生成作业群消息和打印 PDF', btn: '开始制作', tab: 'regular-homework' },
  { icon: '⏰', label: '生成会议提醒', desc: '一键生成上课会议通知', btn: '生成提醒', tab: 'meeting' },
];

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

  const statValues: Record<string, number> = {
    feedback: activity.feedbackCount,
    homework: activity.homeworkMsgCount,
    meeting: activity.meetingCount,
    students: students.length,
  };

  return (
    <div>
      {/* Welcome Header */}
      <div className="dash-header">
        <div className="dash-header-left">
          <div className="dash-welcome">欢迎回来</div>
          <div className="dash-subtitle">
            今天可以先生成课后反馈，再处理作业和会议提醒。
          </div>
        </div>
        <div className="dash-header-right">
          <div className="dash-flow-card">
            <div className="dash-flow-title">今日流程</div>
            <div className="dash-flow-step"><span className="dash-flow-num">1</span>课后反馈</div>
            <div className="dash-flow-step"><span className="dash-flow-num">2</span>正课作业</div>
            <div className="dash-flow-step"><span className="dash-flow-num">3</span>会议提醒</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="dash-stats">
        {STATS.map((s) => (
          <div key={s.key} className="dash-stat-card">
            <div className="dash-stat-icon">{s.icon}</div>
            <div className="dash-stat-num">{statValues[s.key]}</div>
            <div className="dash-stat-label">{s.label}</div>
            <div className="dash-stat-hint">{s.hint}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="dash-actions">
        {ACTIONS.map((a) => (
          <button key={a.tab} className="dash-action-card" onClick={() => onNavigate(a.tab)}>
            <div className="dash-action-top">
              <span className="dash-action-icon">{a.icon}</span>
              <span className="dash-action-label">{a.label}</span>
            </div>
            <div className="dash-action-desc">{a.desc}</div>
            <span className="dash-action-btn">{a.btn} →</span>
          </button>
        ))}
      </div>

      {/* Recent Students */}
      <div className="card">
        <div className="card-title">最近学生</div>
        {recentStudents.length > 0 ? (
          <div className="dash-student-grid">
            {recentStudents.map((s) => (
              <button
                key={s.id}
                className="dash-student-pill"
                onClick={() => { onSelectStudent(s.id); onNavigate('regular-feedback'); }}
              >
                <span className="dash-student-name">{s.name}</span>
                <span className="dash-student-meta">
                  {s.recentFeedbacks.length > 0 ? `反馈 ${s.recentFeedbacks.length}` : '反馈 0'}
                  {' · '}
                  {s.commonWeakWords?.length || 0} 常忘词
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="empty-state">
              还没有学生档案，先新增学生后可以自动积累学习特点。
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => onNavigate('students')}>去新增学生</button>
            </div>
          </div>
        )}
      </div>

      {/* Recent Feedbacks */}
      <div className="card">
        <div className="card-title">最近反馈</div>
        {recentFeedbacks.length === 0 ? (
          <div>
            <div style={{ fontSize: '.88rem', color: 'var(--text)', marginBottom: 6 }}>还没有生成反馈</div>
            <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 14 }}>
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
