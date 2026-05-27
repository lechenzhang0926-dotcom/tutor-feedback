'use client';

import { useState, useCallback, useEffect } from 'react';
import { buildHomeworkMessage } from '@/lib/homeworkMessage';
import { getStudents, getStudentById, saveStudent } from '@/lib/storage';
import { incrementHomeworkMsgCount, incrementTotalHomeworkCount, recordStudentUsage } from '@/lib/dashboardUtils';
import type { StudentProfile } from '@/lib/types';

interface Props {
  toast: (msg: string) => void;
  onCopy: (text: string) => void;
  preSelectStudentId?: string;
}

export function RegularHomeworkTab({ toast, onCopy, preSelectStudentId }: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [showTempName, setShowTempName] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    setDate(beijingDateString());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (preSelectStudentId) {
      setSelectedStudentId(preSelectStudentId);
      const s = getStudentById(preSelectStudentId);
      if (s) setStudentName(s.name);
    }
  }, [preSelectStudentId]);

  const handleAddStudent = () => {
    if (!newStudentName.trim()) return;
    const now = new Date().toISOString();
    const s: StudentProfile = { id: Date.now().toString(), name: newStudentName.trim(), recentFeedbacks: [], createdAt: now, updatedAt: now };
    saveStudent(s); setSelectedStudentId(s.id); setStudentName(s.name); setShowTempName(false); setAddingStudent(false); setNewStudentName(''); toast('已添加并选中');
  };

  const [link1, setLink1] = useState('');
  const [link2, setLink2] = useState('');
  const [link3, setLink3] = useState('');
  const [msgGenerated, setMsgGenerated] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfSession, setPdfSession] = useState('');
  const [pdfFiles, setPdfFiles] = useState<{ name: string; size: number; error?: string }[]>([]);

  // --------------- 草稿自动保存 ---------------
  const HOMEWORK_DRAFT_KEY = 'tutor_draft_homework';
  useEffect(() => {
    if (!mounted) return;
    const draft = { studentName, date, link1, link2, link3 };
    localStorage.setItem(HOMEWORK_DRAFT_KEY, JSON.stringify(draft));
  }, [mounted, studentName, date, link1, link2, link3]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(HOMEWORK_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.studentName) setStudentName(draft.studentName);
        if (draft.date) setDate(draft.date);
        if (draft.link1) setLink1(draft.link1);
        if (draft.link2) setLink2(draft.link2);
        if (draft.link3) setLink3(draft.link3);
      }
    } catch {}
  }, [mounted]);

  // --------------- 格式化日期 ---------------

  const getFormattedDate = useCallback(() => {
    // 从 date 字符串解析月日，固定北京时间
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    return `${match[2]}${match[3]}`;
  }, [date]);

  // --------------- 生成群消息 ---------------

  const handleGenerateMessage = useCallback(() => {
    if (!studentName.trim()) {
      toast('请填写学生名字');
      return;
    }
    if (!link1.trim()) {
      toast('请填写课后作业 1 链接');
      return;
    }

    buildHomeworkMessage({
      studentName: studentName.trim(),
      date: date,
      link1: link1.trim(),
    });
    setMsgGenerated(true);
    incrementHomeworkMsgCount();
    incrementTotalHomeworkCount();
    if (selectedStudentId) recordStudentUsage(selectedStudentId);
    toast('消息已生成，点击下方复制按钮');
  }, [studentName, date, link1, selectedStudentId, toast]);

  // --------------- 下载 PDF ---------------

  const handleGeneratePdfs = useCallback(async () => {
    if (!studentName.trim()) {
      toast('请填写学生名字');
      return;
    }
    if (!link1.trim() && !link2.trim() && !link3.trim()) {
      toast('请至少填写一个作业链接');
      return;
    }

    setPdfLoading(true);
    setPdfError('');
    setPdfFiles([]);
    setPdfSession('');

    try {
      const formattedDate = getFormattedDate();
      if (!formattedDate) {
        setPdfError('日期格式无效');
        setPdfLoading(false);
        return;
      }

      const res = await fetch('/api/generate-homework-pdfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: studentName.trim(),
          date: formattedDate,
          link1: link1.trim() || undefined,
          link2: link2.trim() || undefined,
          link3: link3.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPdfError(err.error || `生成失败 (${res.status})`);
        setPdfLoading(false);
        return;
      }

      const data = await res.json();
      setPdfSession(data.sessionId);
      setPdfFiles(data.files);

      const successCount = data.files.filter((f: { error?: string }) => !f.error).length;
      toast(`${successCount} 个 PDF 已生成，点击下方按钮逐个下载`);
    } catch {
      setPdfError('PDF 生成失败，请稍后重试。');
    } finally {
      setPdfLoading(false);
    }
  }, [studentName, date, link1, link2, link3, toast, getFormattedDate]);

  const downloadSinglePdf = useCallback((fileName: string) => {
    const a = document.createElement('a');
    a.href = `/api/download-pdf?session=${encodeURIComponent(pdfSession)}&name=${encodeURIComponent(fileName)}`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [pdfSession]);

  const downloadAllPdfs = useCallback(() => {
    const validFiles = pdfFiles.filter((f) => !f.error);
    validFiles.forEach((f, i) => {
      setTimeout(() => {
        downloadSinglePdf(f.name);
      }, i * 300);
    });
  }, [pdfFiles, downloadSinglePdf]);

  // --------------- 获取群消息 ---------------

  const homeworkMsg = msgGenerated
    ? buildHomeworkMessage({
        studentName: studentName.trim(),
        date,
        link1: link1.trim(),
      })
    : '';

  // --------------- Render ---------------

  return (
    <>
      {/* 表单 Card */}
      <div className="card">
        <div className="card-title">正课作业</div>

        <div className="field">
          <label>选择学生</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedStudentId(v);
                if (v === '__temp__') { setShowTempName(true); setStudentName(''); }
                else { setShowTempName(false); const s = getStudentById(v); if (s) setStudentName(s.name); }
              }}
              style={{ flex: 1, padding: '8px 12px', fontSize: '.88rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit' }}
            >
              <option value="">不选择学生</option>
              {mounted && getStudents().map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="__temp__">手动输入名字</option>
            </select>
            <button className="btn btn-ghost" onClick={() => setAddingStudent(true)} style={{ whiteSpace: 'nowrap' }}>新增学生</button>
          </div>
          </div>

        {/* 新增学生内联表单 */}
        {addingStudent && (
          <div className="field" style={{ padding: '10px 14px', background: 'var(--tag-bg)', borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="输入学生名字"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddStudent(); }}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={handleAddStudent}>保存</button>
              <button className="btn btn-ghost" onClick={() => { setAddingStudent(false); setNewStudentName(''); }}>取消</button>
            </div>
          </div>
        )}

        {/* 手动输入名字 */}
        {showTempName && (
          <div className="field">
            <label>学生名字</label>
            <input type="text" className="small" placeholder="如：谦谦" maxLength={20} value={studentName} onChange={(e) => setStudentName(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label>日期</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', fontSize: '.88rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit' }}
            />
            <button className="btn btn-ghost" onClick={() => setDate(beijingDateString())} style={{ whiteSpace: 'nowrap' }}>
              今天
            </button>
          </div>
        </div>

        <div className="field">
          <label>课后作业 1 链接 <span className="hint">（中英文/英文/中文/音标 PDF 打印）</span></label>
          <input
            type="text"
            placeholder="https://test.hzdmsyy.com/pc/prints?id=247343"
            value={link1}
            onChange={(e) => setLink1(e.target.value)}
          />
        </div>

        <div className="field">
          <label>课后作业 2 链接 <span className="hint">（抗遗忘试卷 PDF）</span></label>
          <input
            type="text"
            placeholder="https://test.hzdmsyy.com/pc/prints/review-cycle-paper?id=247343"
            value={link2}
            onChange={(e) => setLink2(e.target.value)}
          />
        </div>

        <div className="field">
          <label>课后作业 3 链接 <span className="hint">（极简造句 PDF）</span></label>
          <input
            type="text"
            placeholder="https://test.hzdmsyy.com/pc/prints/simple?id=246260"
            value={link3}
            onChange={(e) => setLink3(e.target.value)}
          />
        </div>

        {/* 按钮区 */}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleGenerateMessage}>
            生成作业群消息
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGeneratePdfs}
            disabled={pdfLoading}
          >
            {pdfLoading ? '正在生成 PDF...' : '生成 PDF'}
          </button>
          <button className="btn btn-ghost" onClick={() => {
            setSelectedStudentId('');
            setStudentName('');
            setDate(beijingDateString());
            setLink1('');
            setLink2('');
            setLink3('');
            setMsgGenerated(false);
            setPdfError('');
            setPdfFiles([]);
            setPdfSession('');
            localStorage.removeItem(HOMEWORK_DRAFT_KEY);
          }}>
            清空
          </button>
        </div>

        {pdfError && (
          <div style={{ color: 'var(--danger)', fontSize: '.85rem', marginTop: 10 }}>{pdfError}</div>
        )}
      </div>

      {/* 群消息 Card */}
      {msgGenerated && homeworkMsg && (
        <div className="card">
          <div className="card-title">作业群消息</div>
          <div className="output-area">{homeworkMsg}</div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => { onCopy(homeworkMsg); toast('已复制作业消息'); }}>
              复制作业消息
            </button>
          </div>
        </div>
      )}

      {/* PDF 文件列表 */}
      {pdfFiles.length > 0 && (
        <div className="card">
          <div className="card-title">
            PDF 文件列表
            {pdfFiles.filter((f) => !f.error).length > 1 && (
              <button
                className="btn btn-ghost"
                onClick={downloadAllPdfs}
                style={{ fontSize: '.78rem', padding: '4px 14px', marginLeft: 8 }}
              >
                一键下载全部
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pdfFiles.map((file) => (
              <div
                key={file.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '.85rem',
                }}
              >
                <span style={{ color: file.error ? 'var(--danger)' : 'var(--text)' }}>
                  {file.name}
                  {file.error && (
                    <span style={{ marginLeft: 8, fontSize: '.75rem' }}>生成失败: {file.error}</span>
                  )}
                  {!file.error && (
                    <span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--muted)' }}>
                      {formatFileSize(file.size)}
                    </span>
                  )}
                </span>
                {!file.error && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => downloadSinglePdf(file.name)}
                    style={{ fontSize: '.78rem', padding: '4px 14px' }}
                  >
                    下载
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 获取当前北京时间（UTC+8）的 YYYY-MM-DD 字符串 */
function beijingDateString(): string {
  const now = new Date();
  // 转为北京时间：UTC + 偏移量 + 8小时
  const beijingTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  const y = beijingTime.getFullYear();
  const m = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const d = String(beijingTime.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
