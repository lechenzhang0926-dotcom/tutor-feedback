'use client';

import { useState, useCallback, useEffect } from 'react';
import type { StudentProfile, FeedbackRecord } from '@/lib/types';
import {
  getStudents,
  saveStudent,
  deleteStudent,
} from '@/lib/storage';
import { COURSE_TYPE_LABEL } from '@/lib/types';

interface Props {
  toast: (msg: string) => void;
}

export function StudentProfilesTab({ toast }: Props) {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [viewingHistory, setViewingHistory] = useState<StudentProfile | null>(null);

  useEffect(() => {
    setStudents(getStudents());
  }, []);

  const refresh = useCallback(() => {
    setStudents(getStudents());
  }, []);

  // --------------- 新增 ---------------

  const handleAdd = useCallback(() => {
    if (!newName.trim()) {
      toast('请填写学生名字');
      return;
    }

    const now = new Date().toISOString();
    const student: StudentProfile = {
      id: Date.now().toString(),
      name: newName.trim(),
      recentFeedbacks: [],
      createdAt: now,
      updatedAt: now,
    };

    saveStudent(student);
    setNewName('');
    setAdding(false);
    refresh();
    toast('已添加');
  }, [newName, toast, refresh]);

  // --------------- 删除 ---------------

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm('确定删除吗？')) return;
      deleteStudent(id);
      refresh();
      toast('已删除');
    },
    [toast, refresh]
  );

  // --------------- Render ---------------

  return (
    <>
      {/* 说明 */}
      <div className="card">
        <div style={{ fontSize: '.84rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          只需先添加学生名字，系统会在每次生成反馈后自动积累该学生的常忘单词、学习特点和反馈历史。
        </div>
        {!adding && (
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              新增学生
            </button>
          </div>
        )}
      </div>

      {/* 新增表单 */}
      {adding && (
        <div className="card">
          <div className="card-title">新增学生</div>
          <div className="field">
            <label>学生名字</label>
            <input
              type="text"
              className="small"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="如：睿泽"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              autoFocus
            />
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleAdd}>保存</button>
            <button className="btn btn-ghost" onClick={() => { setAdding(false); setNewName(''); }}>取消</button>
          </div>
        </div>
      )}

      {/* 学生列表 */}
      {students.map((s) => (
        <div key={s.id} className="card">
          <div className="card-title">
            {s.name}
            <span style={{ fontWeight: 400, fontSize: '.72rem', color: 'var(--muted)', marginLeft: 8 }}>
              更新于 {formatShort(s.updatedAt)}
            </span>
          </div>

          {s.textbook && (
            <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 4 }}>
              词库：{s.textbook}
            </div>
          )}

          {s.commonWeakWords && s.commonWeakWords.length > 0 && (
            <div style={{ fontSize: '.78rem', marginBottom: 4 }}>
              <span className="student-tag weak">常忘</span>{' '}
              {s.commonWeakWords.join(', ')}
            </div>
          )}

          {s.commonIssues && s.commonIssues.length > 0 && (
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 4 }}>
              <span className="student-tag issue">问题</span>{' '}
              {s.commonIssues.join('；')}
            </div>
          )}

          {s.strengths && s.strengths.length > 0 && (
            <div style={{ fontSize: '.78rem', marginBottom: 4 }}>
              <span className="student-tag strength">优点</span>{' '}
              {s.strengths.join('；')}
            </div>
          )}

          <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 8 }}>
            最近反馈：{s.recentFeedbacks.length} 条
          </div>

          <div className="btn-row">
            <button
              className="btn btn-ghost"
              onClick={() => setViewingHistory(s)}
              style={{ fontSize: '.8rem', padding: '6px 14px' }}
            >
              反馈历史
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => handleDelete(s.id)}
              style={{ fontSize: '.8rem', padding: '6px 14px', color: 'var(--danger)' }}
            >
              删除
            </button>
          </div>
        </div>
      ))}

      {students.length === 0 && !adding && (
        <div className="card">
          <div className="empty-state">暂无学生档案，点击上方按钮新增</div>
        </div>
      )}

      {/* 反馈历史弹窗 */}
      {viewingHistory && (
        <div className="card">
          <div className="card-title">
            {viewingHistory.name} 的最近反馈
            <button
              className="btn btn-ghost"
              onClick={() => setViewingHistory(null)}
              style={{ fontSize: '.78rem', padding: '4px 14px', marginLeft: 8 }}
            >
              关闭
            </button>
          </div>
          {viewingHistory.recentFeedbacks.length === 0 ? (
            <div className="empty-state">暂无反馈记录</div>
          ) : (
            viewingHistory.recentFeedbacks.map((fb: FeedbackRecord) => (
              <div key={fb.id} className="history-item">
                <div className="history-meta">
                  <span>{formatDate(fb.createdAt)}</span>
                  <span className="tag">{COURSE_TYPE_LABEL[fb.courseType] || '正课'}</span>
                </div>
                <div className="history-text">{fb.feedback}</div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
