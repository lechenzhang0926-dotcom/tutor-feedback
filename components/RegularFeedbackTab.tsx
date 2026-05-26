'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  isRateLimited,
  incrementDailyCount,
  getRemainingToday,
  getStudents,
  getStudentById,
  saveStudent,
} from '@/lib/storage';
import { updateProfileFromFeedback } from '@/lib/studentProfileUtils';
import type { StudentProfile, FeedbackRecord } from '@/lib/types';

interface Props {
  toast: (msg: string) => void;
}

export function RegularFeedbackTab({ toast }: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [image, setImage] = useState<File | null>(null);

  useEffect(() => { setMounted(true); }, []);
  const [imagePreview, setImagePreview] = useState('');
  const [compressedImage, setCompressedImage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'regular' | 'anti-forgetting'>('regular');
  const [feedbackLength, setFeedbackLength] = useState<'short' | 'standard' | 'detailed'>('standard');
  const [notes, setNotes] = useState('');
  const [claudeResult, setClaudeResult] = useState('');
  const [feedbackVersions, setFeedbackVersions] = useState<string[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const feedback = feedbackVersions[currentVersion] || '';
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 客户端初始化剩余次数
  useState(() => {
    setRemaining(getRemainingToday());
  });

  // --------------- 草稿自动保存 ---------------
  const DRAFT_KEY = 'tutor_draft_feedback';
  useEffect(() => {
    if (!mounted) return;
    const draft = { feedbackType, feedbackLength, notes, selectedStudentId };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [mounted, feedbackType, feedbackLength, notes, selectedStudentId]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.feedbackType) setFeedbackType(draft.feedbackType);
        if (draft.feedbackLength) setFeedbackLength(draft.feedbackLength);
        if (draft.notes) setNotes(draft.notes);
        if (draft.selectedStudentId) setSelectedStudentId(draft.selectedStudentId);
      }
    } catch {}
  }, [mounted]);

  // --------------- 图片上传 ---------------

  const processFile = useCallback((file: File) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast('仅支持 PNG、JPG、JPEG 格式');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast('图片大小不能超过 10MB');
      return;
    }

    setImage(file);
    setError('');

    compressImage(file, 1200).then((compressed) => {
      setCompressedImage(compressed);
    });
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }, [toast]);

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const clearImage = useCallback(() => {
    setImage(null);
    setImagePreview('');
    setCompressedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // --------------- OCR 识别 ---------------

  const handleOcr = useCallback(async () => {
    if (!compressedImage) {
      toast('请先上传截图');
      return;
    }

    setOcrLoading(true);
    setError('');

    try {
      const res = await fetch('/api/ocr-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: compressedImage }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast(data.error || '识别失败');
        return;
      }

      setClaudeResult(data.text);
      toast('Claude 已识别截图内容，请在下方填写补充说明后点击生成');
    } catch {
      toast('识别失败，请检查网络');
    } finally {
      setOcrLoading(false);
    }
  }, [compressedImage, toast]);

  // --------------- 生成 ---------------

  const handleGenerate = useCallback(async () => {
    if (!claudeResult && !notes.trim()) {
      setError('请先上传截图识别或填写补充说明');
      return;
    }

    if (isRateLimited()) {
      setError('今日生成次数已达上限，请明天再试。');
      return;
    }

    setLoading(true);
    setError('');

    // 获取学生档案（如果选中了学生）
    const student = selectedStudentId ? getStudentById(selectedStudentId) : undefined;

    try {
      const res = await fetch('/api/generate-regular-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackType,
          feedbackLength,
          structuredData: claudeResult || undefined,
          notes: notes.trim() || undefined,
          studentProfile: student ? buildStudentContext(student) : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '生成失败，请稍后重试。');
        return;
      }

      // 版本管理：新版本插入最前，最多 5 个
      setFeedbackVersions((prev) => {
        const next = [data.feedback, ...prev];
        return next.slice(0, 5);
      });
      setCurrentVersion(0);
      incrementDailyCount();
      setRemaining(getRemainingToday());

      // 保存到学生反馈历史 + 自动积累档案
      if (student) {
        const record: FeedbackRecord = {
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
          studentName: student.name,
          courseType: 'regular',
          tone: 'warm',
          originalNotes: notes.trim(),
          feedback: data.feedback,
        };

        const structured = claudeResult || notes.trim();
        const updated = updateProfileFromFeedback(
          student,
          structured,
          notes.trim(),
          data.feedback,
          record
        );
        saveStudent(updated);
      }
    } catch {
      setError('生成失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, [notes, feedbackType, claudeResult, selectedStudentId, toast]);

  const handleRegenerate = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

  // --------------- 复制 ---------------

  const handleCopy = useCallback(async () => {
    if (!feedback) return;
    try {
      await navigator.clipboard.writeText(feedback);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = feedback;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast('已复制，可以直接发给家长');
  }, [feedback, toast]);

  // --------------- Render ---------------

  const rateLimited = isRateLimited();

  return (
    <>
      {/* Input Card */}
      <div className="card">
        <div className="card-title">课后反馈</div>

        <div className="field">
          <label>反馈类型</label>
          <div className="radio-group">
            <input type="radio" name="feedbackType" id="ft_regular" checked={feedbackType === 'regular'} onChange={() => setFeedbackType('regular')} />
            <label htmlFor="ft_regular">正课反馈</label>
            <input type="radio" name="feedbackType" id="ft_anti" checked={feedbackType === 'anti-forgetting'} onChange={() => setFeedbackType('anti-forgetting')} />
            <label htmlFor="ft_anti">抗遗忘反馈</label>
          </div>
        </div>

        <div className="field">
          <label>选择学生 <span className="hint">（选填，选中后反馈会自动归档）</span></label>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', fontSize: '.88rem',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--card)', color: 'var(--text)',
              fontFamily: 'inherit',
            }}
          >
            <option value="">不选择学生</option>
            {mounted && getStudents().map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>反馈长度</label>
          <div className="radio-group">
            <input type="radio" name="feedbackLength" id="fl_short" checked={feedbackLength === 'short'} onChange={() => setFeedbackLength('short')} />
            <label htmlFor="fl_short">简短版</label>
            <input type="radio" name="feedbackLength" id="fl_standard" checked={feedbackLength === 'standard'} onChange={() => setFeedbackLength('standard')} />
            <label htmlFor="fl_standard">标准版</label>
            <input type="radio" name="feedbackLength" id="fl_detailed" checked={feedbackLength === 'detailed'} onChange={() => setFeedbackLength('detailed')} />
            <label htmlFor="fl_detailed">详细版</label>
          </div>
        </div>

        <div className="field">
          <label>上传上课报告截图 <span className="hint">（选填，拖拽文件至此区域或点击上传）</span></label>
          <DropZone
            onFileDrop={processFile}
            onFileSelect={handleImageChange}
            imagePreview={imagePreview}
            onClear={clearImage}
            onOcr={handleOcr}
            ocrLoading={ocrLoading}
            fileInputRef={fileInputRef}
          />
        </div>

        {claudeResult && (
          <div className="claude-preview">
            <div className="claude-preview-label">Claude 已识别截图：</div>
            {claudeResult}
          </div>
        )}

        <div className="field">
          <label>
            课后补充说明 <span className="hint">（选填，比如需要重点关注的单词等）</span>
          </label>
          <textarea
            placeholder="例：记一下 boring 经常记不住这个单词，可以和 interesting 放在一起记。"
            value={notes}
            onChange={(e) => { setNotes(e.target.value); if (error) setError(''); }}
            style={{ minHeight: 80 }}
          />
        </div>

        <div className="btn-row">
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={loading || rateLimited}
          >
            {loading ? '生成中' : '生成正课反馈'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => { setNotes(''); setClaudeResult(''); setFeedbackVersions([]); setCurrentVersion(0); setError(''); clearImage(); localStorage.removeItem(DRAFT_KEY); }}
          >
            清空
          </button>
        </div>

        {rateLimited && (
          <div className="rate-limit-banner" style={{ marginTop: 12 }}>
            今日生成次数已达上限，请明天再试。
          </div>
        )}
        {remaining > 0 && remaining <= 5 && !rateLimited && (
          <div style={{ fontSize: '.72rem', color: 'var(--danger)', marginTop: 8 }}>
            今日剩余 {remaining} 次
          </div>
        )}
      </div>

      {/* Output Card */}
      {(loading || error || feedbackVersions.length > 0) && (
        <div className="card">
          <div className="card-title">
            生成结果
            {feedbackVersions.length > 1 && (
              <span style={{ fontWeight: 400, fontSize: '.78rem', color: 'var(--muted)', marginLeft: 8 }}>
                — 版本切换
              </span>
            )}
          </div>

          {loading && (
            <div className="output-area">
              <span className="loading-dots">
                <span>.</span><span>.</span><span>.</span>
              </span>
            </div>
          )}

          {!loading && error && !feedback && (
            <div style={{ color: 'var(--danger)', fontSize: '.9rem' }}>{error}</div>
          )}

          {!loading && feedbackVersions.length > 0 && (
            <>
              {feedbackVersions.length > 1 && (
                <div className="radio-group" style={{ marginBottom: 10 }}>
                  {feedbackVersions.map((_, i) => (
                    <span key={i}>
                      <input
                        type="radio"
                        name="version"
                        id={`v${i}`}
                        checked={currentVersion === i}
                        onChange={() => setCurrentVersion(i)}
                      />
                      <label htmlFor={`v${i}`}>版本{i + 1}</label>
                    </span>
                  ))}
                </div>
              )}
              <div className="output-area">{feedback}</div>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={handleCopy}>复制</button>
                <button className="btn btn-ghost" onClick={handleRegenerate}>换种说法</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** 压缩图片：缩放到 maxWidth 以内，输出 JPEG base64 */
/** 构造学生档案上下文，传给 API */
function buildStudentContext(student: StudentProfile): string {
  const parts: string[] = [];
  parts.push(`学生名字：${student.name}`);
  if (student.commonWeakWords?.length) parts.push(`常忘单词：${student.commonWeakWords.join(', ')}`);
  if (student.commonIssues?.length) parts.push(`常见问题：${student.commonIssues.join('；')}`);
  if (student.strengths?.length) parts.push(`学习优点：${student.strengths.join('；')}`);
  if (student.textbook) parts.push(`当前词库：${student.textbook}`);
  return parts.join('\n');
}

function compressImage(file: File, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxWidth) {
        // 无需压缩，直接读原文件
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      const scale = maxWidth / width;
      width = maxWidth;
      height = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = URL.createObjectURL(file);
  });
}

// --------------- DropZone 拖拽上传组件 ---------------

function DropZone({
  onFileDrop,
  onFileSelect,
  imagePreview,
  onClear,
  onOcr,
  ocrLoading,
  fileInputRef,
}: {
  onFileDrop: (file: File) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  imagePreview: string;
  onClear: () => void;
  onOcr: () => void;
  ocrLoading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) return;
      onFileDrop(file);
    },
    [onFileDrop]
  );

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
      >
        {imagePreview ? (
          <div className="drop-zone-preview">
            <img src={imagePreview} alt="预览" />
            <button className="drop-zone-delete" onClick={(e) => { e.stopPropagation(); onClear(); }}>
              删除
            </button>
            <div className="drop-zone-actions">
              <button onClick={(e) => { e.stopPropagation(); onOcr(); }} disabled={ocrLoading}>
                {ocrLoading ? 'Claude 识别中...' : 'Claude 识别图片'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="drop-zone-icon">{dragOver ? '📂' : '📁'}</div>
            <div className="drop-zone-text">拖拽截图至此区域，或点击上传</div>
            <div className="drop-zone-hint">支持 PNG / JPG</div>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        onChange={onFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
}
