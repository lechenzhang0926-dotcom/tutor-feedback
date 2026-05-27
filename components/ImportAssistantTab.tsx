'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { parseImportedText, buildStructuredDataFromImport, type ParsedImport } from '@/lib/importParser';

interface Props {
  toast: (msg: string) => void;
  onFillFeedback: (structuredData: string, notes: string) => void;
  onFillHomework: (link1: string, link2: string, link3: string, studentName: string) => void;
  onNavigate: (tab: string) => void;
}

export function ImportAssistantTab({ toast, onFillFeedback, onFillHomework, onNavigate }: Props) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 全局粘贴监听
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (!file) return;
          if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
            toast('仅支持 PNG/JPG 图片');
            return;
          }
          const reader = new FileReader();
          reader.onload = () => setImagePreview(reader.result as string);
          reader.readAsDataURL(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [toast]);

  const handleFile = useCallback((file: File) => {
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast('仅支持 PNG/JPG 图片');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }, [toast]);

  const handleParse = useCallback(() => {
    if (!text.trim()) {
      toast('请先粘贴报告内容');
      return;
    }
    const result = parseImportedText(text.trim());
    setParsed(result);
    toast('解析完成');
  }, [text, toast]);

  const handleFillFeedback = useCallback(() => {
    if (!parsed) return;
    const structured = buildStructuredDataFromImport(parsed);
    onFillFeedback(structured, parsed.supplement);
    onNavigate('regular-feedback');
  }, [parsed, onFillFeedback, onNavigate]);

  const handleFillHomework = useCallback(() => {
    if (!parsed) return;
    onFillHomework(parsed.link1, parsed.link2, parsed.link3, parsed.studentName);
    onNavigate('regular-homework');
  }, [parsed, onFillHomework, onNavigate]);

  const handleFillAll = useCallback(() => {
    if (!parsed) return;
    const structured = buildStructuredDataFromImport(parsed);
    onFillFeedback(structured, parsed.supplement);
    onFillHomework(parsed.link1, parsed.link2, parsed.link3, parsed.studentName);
    toast('已填入课后反馈和正课作业');
  }, [parsed, onFillFeedback, onFillHomework, toast]);

  return (
    <div>
      <div className="card">
        <div className="card-title">系统导入助手</div>
        <div style={{ fontSize: '.84rem', color: 'var(--muted)', marginBottom: 16 }}>
          粘贴上课报告文字和作业链接，工具自动整理后填入课后反馈和正课作业。
        </div>

        {/* 上传/粘贴截图 */}
        <div className="field">
          <label>上传截图 <span className="hint">（选填，预览参考）</span></label>
          <div
            className="drop-zone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
          >
            {imagePreview ? (
              <div className="drop-zone-preview">
                <img src={imagePreview} alt="预览" />
                <button className="drop-zone-delete" onClick={(e) => { e.stopPropagation(); setImagePreview(''); }}>删除</button>
              </div>
            ) : (
              <>
                <div className="drop-zone-icon">📁</div>
                <div className="drop-zone-text">点击上传、拖拽图片，或直接粘贴截图</div>
                <div className="drop-zone-hint">仅作预览，不会自动识别文字</div>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} style={{ display: 'none' }} />
        </div>

        {/* 粘贴文字 */}
        <div className="field">
          <label>粘贴报告文字和链接</label>
          <textarea
            placeholder={`粘贴上课报告文字，例如：\n\n学生：睿泽\n日期：5月24日\n词库：小学短语体验词库\n今日共识记词汇：70个\n学新词汇：23个\n学新遗忘词汇：0个\n学新遗忘率：0%\n复习词汇：47个\n复习遗忘词汇：0个\n复习遗忘率：0%\n\nhttps://test.hzdmsyy.com/pc/prints?id=247343\nhttps://test.hzdmsyy.com/pc/prints/review-cycle-paper?id=247343`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ minHeight: 160 }}
          />
        </div>

        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleParse}>解析内容</button>
          <button className="btn btn-ghost" onClick={() => { setText(''); setParsed(null); setImagePreview(''); }}>清空</button>
        </div>
      </div>

      {/* 解析结果 */}
      {parsed && (
        <div className="card">
          <div className="card-title">解析结果</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', fontSize: '.84rem', marginBottom: 16 }}>
            {parsed.studentName && <div><span style={{ color: 'var(--muted)' }}>学生：</span>{parsed.studentName}</div>}
            {parsed.date && <div><span style={{ color: 'var(--muted)' }}>日期：</span>{parsed.date}</div>}
            {parsed.textbook && <div><span style={{ color: 'var(--muted)' }}>词库：</span>{parsed.textbook}</div>}
            {parsed.trainingTime && <div><span style={{ color: 'var(--muted)' }}>时间：</span>{parsed.trainingTime}</div>}
            {parsed.learningProgress && <div><span style={{ color: 'var(--muted)' }}>进度：</span>{parsed.learningProgress}</div>}
            {parsed.totalVocabulary && <div><span style={{ color: 'var(--muted)' }}>共识记词汇：</span>{parsed.totalVocabulary}</div>}
            {parsed.newWords && <div><span style={{ color: 'var(--muted)' }}>学新词汇：</span>{parsed.newWords}</div>}
            {parsed.newForgotten && <div><span style={{ color: 'var(--muted)' }}>学新遗忘：</span>{parsed.newForgotten}</div>}
            {parsed.newForgottenRate && <div><span style={{ color: 'var(--muted)' }}>学新遗忘率：</span>{parsed.newForgottenRate}</div>}
            {parsed.reviewWords && <div><span style={{ color: 'var(--muted)' }}>复习词汇：</span>{parsed.reviewWords}</div>}
            {parsed.reviewForgotten && <div><span style={{ color: 'var(--muted)' }}>复习遗忘：</span>{parsed.reviewForgotten}</div>}
            {parsed.reviewForgottenRate && <div><span style={{ color: 'var(--muted)' }}>复习遗忘率：</span>{parsed.reviewForgottenRate}</div>}
            {parsed.link1 && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--muted)' }}>链接1：</span>{parsed.link1}</div>}
            {parsed.link2 && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--muted)' }}>链接2：</span>{parsed.link2}</div>}
            {parsed.link3 && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--muted)' }}>链接3：</span>{parsed.link3}</div>}
          </div>

          <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 12 }}>
            信息缺失时会留空，可手动补充。
          </div>

          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleFillFeedback}>填入课后反馈</button>
            <button className="btn btn-primary" onClick={handleFillHomework}>填入正课作业</button>
            <button className="btn btn-ghost" onClick={handleFillAll}>全部填入</button>
          </div>
        </div>
      )}
    </div>
  );
}
