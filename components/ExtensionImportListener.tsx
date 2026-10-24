'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// 从 Chrome 插件接收的数据格式
// ============================================================
export interface ExtensionStudentData {
  studentName: string;
  courseName: string;
  classTime: string;
  actions: {
    homework: boolean;
    report: boolean;
    simpleSentence: boolean;
    reviewPaper: boolean;
  };
}

export interface ExtensionImportPayload {
  source: 'smart-english-extension';
  type: 'record-page';
  importedAt: string;
  page: {
    title: string;
    url: string;
  };
  students: ExtensionStudentData[];
}

interface Props {
  toast: (msg: string) => void;
  onImportToFeedback: (studentName: string) => void;
  onImportToHomework: (studentName: string) => void;
  onSwitchToTab: (tabId: 'regular-feedback' | 'homework') => void;
}

const STORAGE_KEY = 'tutor_extension_import_data';

function loadSavedData(): ExtensionImportPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.source === 'smart-english-extension' && Array.isArray(data.students)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function saveData(data: ExtensionImportPayload): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function clearData(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function ExtensionImportListener({ toast, onImportToFeedback, onImportToHomework, onSwitchToTab }: Props) {
  const [importData, setImportData] = useState<ExtensionImportPayload | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Load saved data on mount
  useEffect(() => {
    const saved = loadSavedData();
    if (saved) setImportData(saved);
  }, []);

  // Listen for postMessage from extension (via background script injection)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Validate source
      if (!event.data || event.data.source !== 'smart-english-extension') return;

      // Only accept messages from our own origin (Tutor site)
      if (event.origin !== window.location.origin) return;

      const payload = event.data as ExtensionImportPayload;

      // Validate structure
      if (!payload.type || !Array.isArray(payload.students)) {
        console.warn('[ExtensionImportListener] 插件数据格式无法识别', payload);
        toast('插件数据格式无法识别');
        return;
      }

      setImportData(payload);
      saveData(payload);
      setCollapsed(false);
      toast(`已接收插件数据：${payload.students.length} 个学生`);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [toast]);

  const handleClear = useCallback(() => {
    clearData();
    setImportData(null);
    toast('已清除导入数据');
  }, [toast]);

  const handleImportStudentToFeedback = useCallback((studentName: string) => {
    onImportToFeedback(studentName);
    onSwitchToTab('regular-feedback');
  }, [onImportToFeedback, onSwitchToTab]);

  const handleImportStudentToHomework = useCallback((studentName: string) => {
    onImportToHomework(studentName);
    onSwitchToTab('homework');
  }, [onImportToHomework, onSwitchToTab]);

  if (!importData) {
    // No data — render nothing visible, just keep the listener active
    return null;
  }

  if (collapsed) {
    return (
      <div style={{
        margin: '0 0 16px 0', padding: '8px 16px', background: '#faf8f5',
        border: '1px solid var(--border)', borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: '.82rem',
      }}>
        <span style={{ color: 'var(--muted)' }}>
          已导入：{importData.students.length} 个学生
          <span style={{ marginLeft: 8, fontSize: '.72rem' }}>
            ({new Date(importData.importedAt).toLocaleTimeString('zh-CN')})
          </span>
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setCollapsed(false)} style={{ fontSize: '.72rem', padding: '2px 10px' }}>展开</button>
          <button className="btn btn-ghost" onClick={handleClear} style={{ fontSize: '.72rem', padding: '2px 10px', color: 'var(--danger)' }}>清除</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      margin: '0 0 16px 0', padding: '16px 20px', background: '#faf8f5',
      border: '1px solid var(--accent)', borderRadius: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '.92rem', color: 'var(--text)' }}>
            已从智能英语系统接收数据
          </div>
          <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 2 }}>
            {importData.page.title} · {importData.students.length} 个学生 · {new Date(importData.importedAt).toLocaleString('zh-CN')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setCollapsed(true)} style={{ fontSize: '.72rem', padding: '2px 10px' }}>收起</button>
          <button className="btn btn-ghost" onClick={handleClear} style={{ fontSize: '.72rem', padding: '2px 10px', color: 'var(--danger)' }}>清除</button>
        </div>
      </div>

      {/* Source URL */}
      <div style={{ fontSize: '.7rem', color: 'var(--muted)', wordBreak: 'break-all', marginBottom: 12 }}>
        来源：{importData.page.url}
      </div>

      {/* Student list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {importData.students.map((student, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 14px', background: '#fff', borderRadius: 8,
            border: '1px solid var(--border)', fontSize: '.82rem',
          }}>
            {/* Student info */}
            <div style={{ flex: 1, minWidth: 100 }}>
              <strong style={{ color: 'var(--text)' }}>{student.studentName || '(未识别名字)'}</strong>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                {student.courseName && <span>{student.courseName}</span>}
                {student.classTime && <span style={{ marginLeft: student.courseName ? 8 : 0 }}>{student.classTime}</span>}
              </div>
            </div>

            {/* Available actions from extension */}
            <div style={{ display: 'flex', gap: 4 }}>
              {student.actions.homework && <span style={{ fontSize: '.66rem', padding: '2px 8px', borderRadius: 8, background: '#f0ebe0', color: '#8b7355' }}>课后</span>}
              {student.actions.report && <span style={{ fontSize: '.66rem', padding: '2px 8px', borderRadius: 8, background: '#f0ebe0', color: '#8b7355' }}>报告</span>}
              {student.actions.simpleSentence && <span style={{ fontSize: '.66rem', padding: '2px 8px', borderRadius: 8, background: '#f0ebe0', color: '#8b7355' }}>极简造句</span>}
              {student.actions.reviewPaper && <span style={{ fontSize: '.66rem', padding: '2px 8px', borderRadius: 8, background: '#f0ebe0', color: '#8b7355' }}>抗遗忘</span>}
            </div>

            {/* Import buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" onClick={() => handleImportStudentToFeedback(student.studentName)}
                disabled={!student.studentName}
                style={{ fontSize: '.72rem', padding: '4px 12px', whiteSpace: 'nowrap' }}>
                导入到课后反馈
              </button>
              <button className="btn btn-ghost" onClick={() => handleImportStudentToHomework(student.studentName)}
                disabled={!student.studentName}
                style={{ fontSize: '.72rem', padding: '4px 12px', whiteSpace: 'nowrap' }}>
                导入到正课作业
              </button>
            </div>
          </div>
        ))}
      </div>

      {importData.students.length === 0 && (
        <div style={{ fontSize: '.82rem', color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
          未识别到学生行，请确认已在销课记录页读取数据。
        </div>
      )}
    </div>
  );
}
