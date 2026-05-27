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

export function DashboardTab({ onNavigate, onSelectStudent, onCopy }: Props) {
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

  return (
    <div>
      {/* Header */}
      <div className="dash-header">
        <div className="dash-header-left">
          <div className="dash-welcome">今日工作台</div>
          <div className="dash-subtitle">先生成课后反馈，再处理正课作业和会议提醒。</div>
        </div>
        <div className="dash-flow">
          <span className="dash-flow-item">① 课后反馈</span>
          <span className="dash-flow-arrow">→</span>
          <span className="dash-flow-item">② 正课作业</span>
          <span className="dash-flow-arrow">→</span>
          <span className="dash-flow-item">③ 会议提醒</span>
        </div>
      </div>

      {/* Stats */}
      <div className="dash-stats">
        <div className="dash-stat-card">
          <span className="dash-stat-icon">📝</span>
          <span className="dash-stat-num">{activity.feedbackCount}</span>
          <span className="dash-stat-label">今日反馈</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-icon">📄</span>
          <span className="dash-stat-num">{activity.homeworkMsgCount}</span>
          <span className="dash-stat-label">作业消息</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-icon">⏰</span>
          <span className="dash-stat-num">{activity.meetingCount}</span>
          <span className="dash-stat-label">会议提醒</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-icon">👩‍🎓</span>
          <span className="dash-stat-num">{students.length}</span>
          <span className="dash-stat-label">学生档案</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="dash-actions">
        <button className="dash-action-card" onClick={() => onNavigate('regular-feedback')}>
          <div className="dash-action-body">
            <span className="dash-action-icon">📝</span>
            <div>
              <div className="dash-action-label">生成课后反馈</div>
              <div className="dash-action-desc">把课堂记录整理成家长可读反馈</div>
            </div>
          </div>
          <span className="dash-action-btn">开始生成 →</span>
        </button>
        <button className="dash-action-card" onClick={() => onNavigate('regular-homework')}>
          <div className="dash-action-body">
            <span className="dash-action-icon">📄</span>
            <div>
              <div className="dash-action-label">制作正课作业</div>
              <div className="dash-action-desc">生成作业群消息和打印 PDF</div>
            </div>
          </div>
          <span className="dash-action-btn">开始制作 →</span>
        </button>
        <button className="dash-action-card" onClick={() => onNavigate('meeting')}>
          <div className="dash-action-body">
            <span className="dash-action-icon">⏰</span>
            <div>
              <div className="dash-action-label">生成会议提醒</div>
              <div className="dash-action-desc">一键生成上课会议通知</div>
            </div>
          </div>
          <span className="dash-action-btn">生成提醒 →</span>
        </button>
      </div>

      {/* Recent Students */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="card-title" style={{ marginBottom: 10 }}>最近学生</div>
        {recentStudents.length > 0 ? (
          <div className="dash-student-row">
            {recentStudents.map((s) => (
              <button
                key={s.id}
                className="dash-student-pill"
                onClick={() => { onSelectStudent(s.id); onNavigate('regular-feedback'); }}
              >
                {s.name}
                <span className="dash-student-meta">
                  反馈 {s.recentFeedbacks.length} · 常忘词 {s.commonWeakWords?.length || 0}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
            还没有学生档案，先<a onClick={() => onNavigate('students')} style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>去新增学生</a>后可以自动积累学习特点。
          </div>
        )}
      </div>

      {/* Recent Feedbacks */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="card-title" style={{ marginBottom: 10 }}>最近反馈</div>
        {recentFeedbacks.length === 0 ? (
          <div style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            还没有生成反馈。生成第一条课后反馈后，会在这里显示。
            {' '}
            <a onClick={() => onNavigate('regular-feedback')} style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>去生成反馈</a>
          </div>
        ) : (
          recentFeedbacks.map((fb: FeedbackRecord) => (
            <div key={fb.id} className="dash-feedback-item">
              <div className="dash-feedback-meta">
                <span>{formatDate(fb.createdAt)}</span>
                <span>{fb.studentName}</span>
                <span className="tag">{COURSE_TYPE_LABEL[fb.courseType] || '正课'}</span>
                <button className="dash-feedback-copy" onClick={() => onCopy(fb.feedback)}>复制</button>
              </div>
              <div className="dash-feedback-text">{truncate(fb.feedback, 80)}</div>
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
