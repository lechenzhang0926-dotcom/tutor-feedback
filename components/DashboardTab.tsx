'use client';

import { useState } from 'react';
import { getRecentStudentIds, getTotalStats, recordStudentUsage } from '@/lib/dashboardUtils';
import { getStudents, getStudentById } from '@/lib/storage';
import type { StudentProfile } from '@/lib/types';

interface Props {
  onNavigate: (tab: string) => void;
  onSelectStudent: (studentId: string) => void;
}

export function DashboardTab({ onNavigate, onSelectStudent }: Props) {
  const [addedStudents, setAddedStudents] = useState<string[]>([]);
  const [activeStudentId, setActiveStudentId] = useState('');
  const [selectValue, setSelectValue] = useState('');
  const students = getStudents();
  const totalStats = getTotalStats();
  const recentIds = getRecentStudentIds();

  const recentStudents: StudentProfile[] = [];
  for (const id of recentIds) {
    const s = getStudentById(id);
    if (s) recentStudents.push(s);
    if (recentStudents.length >= 5) break;
  }

  const handleSelect = (id: string) => {
    if (!id) return;
    recordStudentUsage(id);
    setAddedStudents((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveStudentId(id);
    setSelectValue('');
  };

  const handleTagClick = (id: string) => {
    setActiveStudentId(id);
    onSelectStudent(id);
  };

  const handleRemoveTag = (id: string) => {
    setAddedStudents((prev) => prev.filter((t) => t !== id));
    setActiveStudentId((prev) => (prev === id ? '' : prev));
  };

  const handleAction = (tab: string) => {
    if (activeStudentId) onSelectStudent(activeStudentId);
    onNavigate(tab);
  };

  return (
    <div>
      {/* 今日工作台 */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 2 }}>今日工作台</div>
          <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
            选择学生后，可以快速生成课后反馈、正课作业和会议提醒。
          </div>
        </div>

        {/* 选择学生 */}
        <div className="field" style={{ marginBottom: 12 }}>
          <select
            value={selectValue}
            onChange={(e) => handleSelect(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', fontSize: '.9rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit' }}
          >
            <option value="">请选择学生</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* 已添加学生标签 */}
        {addedStudents.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {addedStudents.map((id) => {
              const s = getStudentById(id);
              if (!s) return null;
              const active = id === activeStudentId;
              return (
                <span
                  key={id}
                  onClick={() => handleTagClick(id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 8px 5px 14px', borderRadius: 16,
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-light)' : 'var(--card)',
                    color: active ? 'var(--accent)' : 'var(--muted)',
                    fontSize: '.84rem', fontWeight: active ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                  }}
                >
                  {s.name}
                  <span
                    onClick={(e) => { e.stopPropagation(); handleRemoveTag(id); }}
                    style={{ cursor: 'pointer', opacity: .35, fontSize: '.9rem', lineHeight: 1, padding: '0 4px' }}
                  >×</span>
                </span>
              );
            })}
          </div>
        )}

        {/* 三个操作按钮 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => handleAction('regular-feedback')} style={{ flex: 1, minWidth: 140, justifyContent: 'center' }}>
            生成课后反馈
          </button>
          <button className="btn btn-primary" onClick={() => handleAction('regular-homework')} style={{ flex: 1, minWidth: 140, justifyContent: 'center' }}>
            制作正课作业
          </button>
          <button className="btn btn-primary" onClick={() => handleAction('meeting')} style={{ flex: 1, minWidth: 140, justifyContent: 'center' }}>
            生成会议提醒
          </button>
        </div>
      </div>

      {/* 今日流程 + 最近学生 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* 今日流程 */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="card-title" style={{ marginBottom: 10 }}>今日流程</div>
          {['1. 生成课后反馈', '2. 生成正课作业消息 / PDF', '3. 生成会议提醒', '4. 复制发送给家长'].map((step) => (
            <div key={step} style={{ fontSize: '.82rem', color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              {step}
            </div>
          ))}
        </div>

        {/* 最近学生 */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="card-title" style={{ marginBottom: 10 }}>最近学生</div>
          {recentStudents.length > 0 ? (
            recentStudents.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.84rem' }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ fontSize: '.7rem', color: 'var(--muted)', marginLeft: 8 }}>
                    反馈 {s.recentFeedbacks.length} · 常忘词 {s.commonWeakWords?.length || 0}
                  </span>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '.74rem', padding: '3px 10px' }}
                  onClick={() => { handleSelect(s.id); onNavigate('regular-feedback'); }}
                >
                  开始反馈
                </button>
              </div>
            ))
          ) : (
            <div style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              还没有学生档案，先<a onClick={() => onNavigate('students')} style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>去新增学生</a>吧。
            </div>
          )}
        </div>
      </div>

      {/* 已完成统计 */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="card-title" style={{ marginBottom: 10 }}>已完成统计</div>
        <div className="dash-stats">
          <div className="dash-stat-card">
            <span className="dash-stat-icon">📝</span>
            <span className="dash-stat-num">{totalStats.feedbackCount}</span>
            <span className="dash-stat-label">课后反馈</span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-icon">📄</span>
            <span className="dash-stat-num">{totalStats.homeworkCount}</span>
            <span className="dash-stat-label">正课作业</span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-icon">⏰</span>
            <span className="dash-stat-num">{totalStats.meetingCount}</span>
            <span className="dash-stat-label">会议提醒</span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-icon">👩‍🎓</span>
            <span className="dash-stat-num">{students.length}</span>
            <span className="dash-stat-label">已保存学生</span>
          </div>
        </div>
      </div>
    </div>
  );
}
