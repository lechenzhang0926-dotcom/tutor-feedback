'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { buildHomeworkMessage } from '@/lib/homeworkMessage';
import { getStudents, getStudentById, saveStudent } from '@/lib/storage';
import { getBeijingISODate } from '@/lib/beijingTime';
import { incrementHomeworkMsgCount, incrementTotalHomeworkCount, recordStudentUsage } from '@/lib/dashboardUtils';
import type { StudentProfile } from '@/lib/types';

interface Props {
  toast: (msg: string) => void;
  onCopy: (text: string) => void;
  preSelectStudentId?: string;
  preFillLinks?: { link1?: string; link2?: string; link3?: string; link4?: string };
}

export function RegularHomeworkTab({ toast, onCopy, preSelectStudentId, preFillLinks }: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [showTempName, setShowTempName] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [date, setDate] = useState('');
  const [detectedName, setDetectedName] = useState('');
  const [showDetectedPrompt, setShowDetectedPrompt] = useState(false);
  const [editingDetectedName, setEditingDetectedName] = useState('');
  const [fuzzyMatchStudent, setFuzzyMatchStudent] = useState<StudentProfile | null>(null);
  const [showFuzzyPrompt, setShowFuzzyPrompt] = useState(false);

  useEffect(() => {
    setDate(getBeijingISODate());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (preSelectStudentId) {
      setSelectedStudentId(preSelectStudentId);
      const s = getStudentById(preSelectStudentId);
      if (s) setStudentName(s.name);
    }
  }, [preSelectStudentId]);

  const preFillLinksKeyRef = useRef('');
  useEffect(() => {
    if (!preFillLinks) return;
    const key = [preFillLinks.link1, preFillLinks.link2, preFillLinks.link3, preFillLinks.link4].join('|');
    if (key === preFillLinksKeyRef.current || !key) return;
    preFillLinksKeyRef.current = key;
    if (preFillLinks.link1) setLink1(preFillLinks.link1);
    if (preFillLinks.link2) setLink2(preFillLinks.link2);
    if (preFillLinks.link3) setLink3(preFillLinks.link3);
    if (preFillLinks.link4) setLink4(preFillLinks.link4);
  }, [preFillLinks]);


  const handleAddStudent = () => {
    if (!newStudentName.trim()) return;
    const now = new Date().toISOString();
    const s: StudentProfile = { id: Date.now().toString(), name: newStudentName.trim(), recentFeedbacks: [], createdAt: now, updatedAt: now };
    saveStudent(s); setSelectedStudentId(s.id); setStudentName(s.name); setShowTempName(false); setAddingStudent(false); setNewStudentName(''); toast('已添加并选中');
  };

  const [link1, setLink1] = useState('');
  const [link2, setLink2] = useState('');
  const [link3, setLink3] = useState('');
  const [link4, setLink4] = useState('');
  const [msgGenerated, setMsgGenerated] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfSession, setPdfSession] = useState('');
  const [pdfFiles, setPdfFiles] = useState<{ name: string; size: number; error?: string }[]>([]);

  /** 在档案中查找匹配的学生：先精确匹配，再模糊匹配 */
  const matchStudentByName = useCallback((name: string): { exact: StudentProfile | null; fuzzy: StudentProfile | null } => {
    if (!name) return { exact: null, fuzzy: null };
    const students = getStudents();
    const exact = students.find((s) => s.name.toLowerCase() === name.toLowerCase()) || null;
    if (exact) return { exact, fuzzy: null };
    const fuzzy = students.find((s) =>
      s.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(s.name.toLowerCase())
    ) || null;
    return { exact: null, fuzzy };
  }, []);

  /** 统一的名字检测响应：自动选中 / 模糊询问 / 新增提示 */
  const handleDetectedName = useCallback((name: string) => {
    setDetectedName(name);
    const { exact, fuzzy } = matchStudentByName(name);
    if (exact) {
      setSelectedStudentId(exact.id);
      setStudentName(exact.name);
      setShowDetectedPrompt(false);
      setShowFuzzyPrompt(false);
    } else if (fuzzy) {
      setFuzzyMatchStudent(fuzzy);
      setShowFuzzyPrompt(true);
      setShowDetectedPrompt(false);
    } else {
      setEditingDetectedName(name);
      setShowDetectedPrompt(true);
      setShowFuzzyPrompt(false);
    }
  }, [matchStudentByName]);

  // --------------- 自动检测链接中的学生名字（调用 API 获取页面内容） ---------------
  const apiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDetectedUrlsRef = useRef('');
  useEffect(() => {
    if (selectedStudentId || studentName.trim()) return;

    const urls = [link1, link2, link3, link4].filter(u => u.trim() && u.startsWith('http'));
    if (urls.length === 0) return;
    const urlKey = urls.join('|');
    if (urlKey === lastDetectedUrlsRef.current) return; // 相同链接不重复请求

    // 防抖：500ms 内链接无变化才请求
    if (apiTimerRef.current) clearTimeout(apiTimerRef.current);
    apiTimerRef.current = setTimeout(async () => {
      apiTimerRef.current = null;
      lastDetectedUrlsRef.current = urlKey;

      try {
        const res = await fetch('/api/extract-student-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const name = data.name;
        if (!name) return;
        handleDetectedName(name);
      } catch {
        // API 调用失败，静默忽略
      }
    }, 500);

    return () => {
      if (apiTimerRef.current) clearTimeout(apiTimerRef.current);
    };
  }, [link1, link2, link3, selectedStudentId, studentName]);

  /** 将检测到的名字加入学生档案 */
  const handleAddDetectedStudent = useCallback(() => {
    const name = editingDetectedName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const s: StudentProfile = { id: Date.now().toString(), name, recentFeedbacks: [], createdAt: now, updatedAt: now };
    saveStudent(s);
    setSelectedStudentId(s.id);
    setStudentName(s.name);
    setShowDetectedPrompt(false);
    setDetectedName('');
    toast(`已添加"${name}"到学生档案`);
  }, [editingDetectedName, toast]);

  /** 忽略检测到的名字，仅填入临时名字 */
  const handleUseDetectedTemp = useCallback(() => {
    setStudentName(detectedName);
    setShowDetectedPrompt(false);
    setShowTempName(true);
    toast(`已使用"${detectedName}"作为临时名字`);
  }, [detectedName, toast]);

  /** 接受模糊匹配到的学生 */
  const handleAcceptFuzzyMatch = useCallback(() => {
    if (!fuzzyMatchStudent) return;
    setSelectedStudentId(fuzzyMatchStudent.id);
    setStudentName(fuzzyMatchStudent.name);
    setShowFuzzyPrompt(false);
    toast(`已选择"${fuzzyMatchStudent.name}"`);
  }, [fuzzyMatchStudent, toast]);

  /** 拒绝模糊匹配，让用户手动输入 */
  const handleRejectFuzzyMatch = useCallback(() => {
    setStudentName(detectedName);
    setShowFuzzyPrompt(false);
    setShowTempName(true);
  }, [detectedName]);

  // --------------- 草稿自动保存 ---------------
  const HOMEWORK_DRAFT_KEY = 'tutor_draft_homework';
  useEffect(() => {
    if (!mounted) return;
    const draft = { studentName, date, link1, link2, link3, link4 };
    localStorage.setItem(HOMEWORK_DRAFT_KEY, JSON.stringify(draft));
  }, [mounted, studentName, date, link1, link2, link3, link4]);

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
        if (draft.link4) setLink4(draft.link4);
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

  /** 从链接 API 异步提取名字 */
  const fetchNameFromLinks = useCallback(async (): Promise<string> => {
    const urls = [link1, link2, link3, link4].filter(u => u.trim() && u.startsWith('http'));
    if (urls.length === 0) return '';
    try {
      const res = await fetch('/api/extract-student-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.name || '';
    } catch {
      return '';
    }
  }, [link1, link2, link3]);

  const handleGenerateMessage = useCallback(async () => {
    let name = studentName.trim();
    if (!name) {
      name = await fetchNameFromLinks();
      if (name) {
        setStudentName(name);
        handleDetectedName(name);
      }
    }
    if (!name) {
      toast('请填写学生名字');
      return;
    }
    if (!link1.trim()) {
      toast('请填写课后作业 1 链接');
      return;
    }

    buildHomeworkMessage({
      studentName: name,
      date: date,
      link1: link1.trim(),
    });
    setMsgGenerated(true);
    incrementHomeworkMsgCount();
    incrementTotalHomeworkCount();
    if (selectedStudentId) recordStudentUsage(selectedStudentId);
    toast('消息已生成，点击下方复制按钮');
  }, [studentName, date, link1, selectedStudentId, toast, handleDetectedName, fetchNameFromLinks]);

  // --------------- 下载 PDF（生成 + 自动下载全部） ---------------

  const handleDownloadPdfs = useCallback(async () => {
    let name = studentName.trim();
    if (!name) {
      name = await fetchNameFromLinks();
      if (name) {
        setStudentName(name);
        handleDetectedName(name);
      }
    }
    if (!name) {
      toast('请填写学生名字');
      return;
    }
    if (!link1.trim() && !link2.trim() && !link3.trim() && !link4.trim()) {
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
          studentName: name,
          date: formattedDate,
          link1: link1.trim() || undefined,
          link2: link2.trim() || undefined,
          link3: link3.trim() || undefined,
          link4: link4.trim() || undefined,
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

      // 立即下载全部有效的 PDF
      const validFiles = data.files.filter((f: { error?: string }) => !f.error);
      if (validFiles.length > 0) {
        const session = data.sessionId;
        validFiles.forEach((f: { name: string }, i: number) => {
          setTimeout(() => {
            const a = document.createElement('a');
            a.href = `/api/download-pdf?session=${encodeURIComponent(session)}&name=${encodeURIComponent(f.name)}`;
            a.download = f.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }, i * 50);
        });
        toast(`${validFiles.length} 个 PDF 已开始下载`);
      } else {
        toast('没有可下载的 PDF');
      }
    } catch {
      setPdfError('PDF 下载失败，请稍后重试。');
    } finally {
      setPdfLoading(false);
    }
  }, [studentName, date, link1, link2, link3, toast, getFormattedDate, fetchNameFromLinks, handleDetectedName]);

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
                setShowDetectedPrompt(false); setShowFuzzyPrompt(false);
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

        {/* 自动检测到链接中的名字但不在学生档案中 */}
        {showDetectedPrompt && detectedName && !showFuzzyPrompt && (
          <div style={{ marginBottom: 14, padding: '12px 16px', background: '#fff8e1', borderRadius: 8, border: '1px solid #f0c040' }}>
            <div style={{ fontSize: '.84rem', fontWeight: 500, color: '#6b5e53', marginBottom: 6 }}>
              从链接中自动识别到名字：<strong>{detectedName}</strong>
            </div>
            <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginBottom: 10 }}>
              该名字不在学生档案中，是否需要加入档案？
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={editingDetectedName}
                onChange={(e) => setEditingDetectedName(e.target.value)}
                placeholder="编辑学生名字"
                style={{ flex: 1, minWidth: 120, padding: '6px 10px', fontSize: '.84rem', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}
              />
              <button className="btn btn-primary" onClick={handleAddDetectedStudent} style={{ fontSize: '.78rem', padding: '6px 14px', whiteSpace: 'nowrap' }}>
                加入档案
              </button>
              <button className="btn btn-ghost" onClick={handleUseDetectedTemp} style={{ fontSize: '.78rem', padding: '6px 14px', whiteSpace: 'nowrap' }}>
                仅此次使用
              </button>
              <button className="btn btn-ghost" onClick={() => setShowDetectedPrompt(false)} style={{ fontSize: '.72rem', padding: '4px 10px', color: 'var(--muted)' }}>
                忽略
              </button>
            </div>
          </div>
        )}

        {/* 模糊匹配到档案中的相似名字 */}
        {showFuzzyPrompt && fuzzyMatchStudent && detectedName && (
          <div style={{ marginBottom: 14, padding: '12px 16px', background: '#e8f0fe', borderRadius: 8, border: '1px solid #90b8f8' }}>
            <div style={{ fontSize: '.84rem', fontWeight: 500, color: '#3c5a7d', marginBottom: 6 }}>
              识别到名字：<strong>{detectedName}</strong>
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 10 }}>
              学生档案中有相似名字：<strong>{fuzzyMatchStudent.name}</strong>，是否选择？
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleAcceptFuzzyMatch} style={{ fontSize: '.78rem', padding: '6px 16px', whiteSpace: 'nowrap' }}>
                是，选择{fuzzyMatchStudent.name}
              </button>
              <button className="btn btn-ghost" onClick={handleRejectFuzzyMatch} style={{ fontSize: '.78rem', padding: '6px 14px', whiteSpace: 'nowrap' }}>
                否，手动输入
              </button>
              <button className="btn btn-ghost" onClick={() => setShowFuzzyPrompt(false)} style={{ fontSize: '.72rem', padding: '4px 10px', color: 'var(--muted)' }}>
                忽略
              </button>
            </div>
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
            <button className="btn btn-ghost" onClick={() => setDate(getBeijingISODate())} style={{ whiteSpace: 'nowrap' }}>
              今天
            </button>
          </div>
        </div>

        <div className="field">
          <label>课后作业 1 链接 <span className="hint">（可输入一个打印页面链接，或粘贴多个 PDF 直链，换行分隔）</span></label>
          <textarea
            placeholder="https://test.hzdmsyy.com/pc/prints?id=247343&#10;&#10;或粘贴多个 PDF 直链：&#10;https://fqyy.zzfq888.com/uploads/pdf/xxx.pdf&#10;https://fqyy.zzfq888.com/uploads/pdf/yyy.pdf&#10;https://fqyy.zzfq888.com/uploads/pdf/zzz.pdf"
            value={link1}
            onChange={(e) => setLink1(e.target.value)}
            style={{ minHeight: 80 }}
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

        <div className="field">
          <label>课后作业 4 链接 <span className="hint">（句式打印 — 生成例句/题目/解析 3份PDF）</span></label>
          <input
            type="text"
            placeholder="https://test.hzdmsyy.com/pc/prints/syntax?userId=42543&teacherId=11165&id[0]=35"
            value={link4}
            onChange={(e) => setLink4(e.target.value)}
          />
        </div>

        {/* 按钮区 */}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleGenerateMessage}>
            生成作业群消息
          </button>
          <button
            className="btn btn-primary"
            onClick={handleDownloadPdfs}
            disabled={pdfLoading}
          >
            {pdfLoading ? '正在下载 PDF...' : '下载 PDF'}
          </button>
          <button className="btn btn-ghost" onClick={() => {
            setSelectedStudentId('');
            setStudentName('');
            setDate(getBeijingISODate());
            setLink1('');
            setLink2('');
            setLink3('');
            setLink4('');
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

      {/* PDF 文件列表（下载已自动触发，此处供重新下载） */}
      {pdfFiles.length > 0 && (
        <div className="card">
          <div className="card-title">
            PDF 已自动下载
            <button
              className="btn btn-ghost"
              onClick={downloadAllPdfs}
              style={{ fontSize: '.78rem', padding: '4px 14px', marginLeft: 8 }}
            >
              重新下载全部
            </button>
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
                  ✅ {file.name}
                  {file.error && (
                    <span style={{ marginLeft: 8, fontSize: '.75rem' }}>生成失败: {file.error}</span>
                  )}
                  {!file.error && (
                    <span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--muted)' }}>
                      {formatFileSize(file.size)}
                    </span>
                  )}
                </span>
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
