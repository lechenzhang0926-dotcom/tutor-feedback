'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { routeHomeworkLink } from '@/lib/homeworkUtils';
import { buildHomeworkMessage } from '@/lib/homeworkMessage';
import { getBeijingISODate } from '@/lib/beijingTime';
import { getStudents } from '@/lib/storage';
import { incrementHomeworkMsgCount, incrementTotalHomeworkCount, recordStudentUsage } from '@/lib/dashboardUtils';

interface Props {
  toast: (msg: string) => void;
  onCopy: (text: string) => void;
}

interface LinkGroup {
  link1: string;
  link2: string;
  link3: string;
  link4: string;
}

interface StudentEntry {
  id: string;
  name: string;
  links: LinkGroup;
}

interface GeneratedFile {
  name: string;
  size: number;
  error?: string;
}

interface StudentResult {
  studentName: string;
  sessionId: string;
  files: GeneratedFile[];
  message: string;
  error?: string;
}

const SLOT_LABELS: { key: keyof LinkGroup; label: string }[] = [
  { key: 'link1', label: '作业1（打印页/PDF）' },
  { key: 'link2', label: '作业2（抗遗忘）' },
  { key: 'link3', label: '作业3（极简造句）' },
  { key: 'link4', label: '作业4（句式）' },
];

function extractUrls(text: string): string[] {
  return (text.match(/https?:\/\/[^\s,，\n]+/gi) || []).map((u) => u.trim());
}

function formatMMDD(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[2]}${m[3]}`;
}

export function BatchHomeworkTab({ toast, onCopy }: Props) {
  const [pasted, setPasted] = useState('');
  const [date, setDate] = useState('');
  const [groups, setGroups] = useState<StudentEntry[]>([]);
  const [parseError, setParseError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [copiedName, setCopiedName] = useState('');
  const [autoListen, setAutoListen] = useState(false);

  // 镜像最新 pasted，供剪贴板监听/导入时做去重判断（避免闭包拿到旧值）
  const pastedRef = useRef('');
  const lastClipRef = useRef('');

  useEffect(() => {
    setDate(getBeijingISODate());
  }, []);

  useEffect(() => {
    pastedRef.current = pasted;
  }, [pasted]);

  // --------------- 解析并分组 ---------------
  const handleParse = useCallback(async (textOverride?: string) => {
    const urls = extractUrls(textOverride ?? pasted);
    if (urls.length === 0) {
      setParseError('没有检测到任何链接，请粘贴包含 http(s) 链接的内容');
      setGroups([]);
      return;
    }
    setParseError('');
    setResults([]);

    let names: string[] = [];
    try {
      const res = await fetch('/api/extract-student-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (res.ok) {
        const data = await res.json();
        names = data.names || [];
      }
    } catch {
      // 提取失败则全部按未识别处理
    }

    const order: StudentEntry[] = [];
    const map = new Map<string, StudentEntry>();
    let current = '';
    let unnamed = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].trim();
      const name = (names[i] || '').trim();
      if (name) current = name;

      const key = current || `__unnamed_${unnamed++}`;
      let entry = map.get(key);
      if (!entry) {
        entry = { id: key, name: current || '(未识别学生)', links: { link1: '', link2: '', link3: '', link4: '' } };
        map.set(key, entry);
        order.push(entry);
      }
      const slot = routeHomeworkLink(url);
      entry.links[slot] = entry.links[slot] ? `${entry.links[slot]}\n${url}` : url;
    }

    setGroups(order);
    if (order.some((g) => g.name === '(未识别学生)')) {
      toast('部分链接未识别到学生名，请在下方手动填写');
    } else {
      toast(`已按 ${order.length} 名学生分组`);
    }
  }, [pasted, toast]);

  // 把一批链接追加进文本框（按 URL 去重），返回新增条数
  const appendUrls = useCallback((urls: string[]): number => {
    const prev = pastedRef.current;
    const existing = new Set(extractUrls(prev));
    const newOnes = urls.filter((u) => !existing.has(u));
    if (newOnes.length === 0) return 0;
    const merged = prev.trim() ? `${prev.trim()}\n${newOnes.join('\n')}` : newOnes.join('\n');
    pastedRef.current = merged;
    setPasted(merged);
    return newOnes.length;
  }, []);

  // 从剪贴板读取并导入；autoparse=true 时导入后立即解析分组
  const importFromClipboard = useCallback(async (autoparse = false) => {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt.trim()) {
        toast('剪贴板为空');
        return;
      }
      const urls = extractUrls(txt);
      if (urls.length === 0) {
        toast('剪贴板里没有链接');
        return;
      }
      const added = appendUrls(urls);
      if (added === 0) {
        toast('剪贴板链接均已存在，无新增');
        return;
      }
      toast(`已导入 ${added} 条链接`);
      if (autoparse) handleParse(pastedRef.current);
    } catch {
      toast('无法读取剪贴板，请在浏览器授权“读取剪贴板”权限');
    }
  }, [appendUrls, toast, handleParse]);

  // 自动监听剪贴板：开启后，每次复制含链接的内容都会自动追加（无新增则不动作）
  useEffect(() => {
    if (!autoListen) return;
    const timer = setInterval(async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (!txt || txt === lastClipRef.current) return;
        lastClipRef.current = txt;
        const urls = extractUrls(txt);
        if (urls.length > 0) {
          const added = appendUrls(urls);
          if (added > 0) toast(`自动导入 ${added} 条链接`);
        }
      } catch {
        // 权限未授予或页面未聚焦时静默
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [autoListen, appendUrls, toast]);

  const updateGroupName = useCallback((id: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
  }, []);

  // --------------- 逐个学生生成 PDF + 群消息 ---------------
  const handleGenerate = useCallback(async () => {
    if (groups.length === 0) return;
    const formatted = formatMMDD(date);
    if (!formatted) {
      toast('日期格式无效');
      return;
    }

    setGenerating(true);
    setResults([]);

    const out: StudentResult[] = [];
    for (const g of groups) {
      const name = g.name.trim();
      if (!name || name === '(未识别学生)') {
        out.push({ studentName: name || '(未识别学生)', sessionId: '', files: [], message: '', error: '缺少学生名，跳过' });
        continue;
      }
      const link1 = g.links.link1.trim();
      const link2 = g.links.link2.trim();
      const link3 = g.links.link3.trim();
      const link4 = g.links.link4.trim();
      if (!link1 && !link2 && !link3 && !link4) {
        out.push({ studentName: name, sessionId: '', files: [], message: '', error: '没有任何作业链接，跳过' });
        continue;
      }

      try {
        const res = await fetch('/api/generate-homework-pdfs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentName: name,
            date: formatted,
            link1: link1 || undefined,
            link2: link2 || undefined,
            link3: link3 || undefined,
            link4: link4 || undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          out.push({ studentName: name, sessionId: '', files: [], message: '', error: err.error || `生成失败 (${res.status})` });
          continue;
        }

        const data = await res.json();
        const message = buildHomeworkMessage({ studentName: name, date, link1 });
        out.push({ studentName: name, sessionId: data.sessionId, files: data.files, message });

        // 记录使用量（最佳努力，匹配不到档案也不影响生成）
        incrementHomeworkMsgCount();
        incrementTotalHomeworkCount();
        const st = getStudents().find((s) => s.name === name);
        if (st) recordStudentUsage(st.id);
      } catch {
        out.push({ studentName: name, sessionId: '', files: [], message: '', error: '生成请求异常，请重试' });
      }
    }

    setResults(out);
    setGenerating(false);
    const failed = out.filter((r) => r.error).length;
    toast(failed ? `生成完成，${failed} 名学生失败` : `已为 ${out.length} 名学生生成作业`);
  }, [groups, date, toast]);

  // --------------- 下载 ---------------
  const downloadSingle = useCallback((sessionId: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = `/api/download-pdf?session=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(fileName)}`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const downloadAll = useCallback(() => {
    let i = 0;
    results.forEach((r) => {
      r.files.filter((f) => !f.error).forEach((f) => {
        const session = r.sessionId;
        const name = f.name;
        setTimeout(() => downloadSingle(session, name), i * 80);
        i++;
      });
    });
  }, [results, downloadSingle]);

  const handleCopyMessage = useCallback((text: string, name: string) => {
    onCopy(text);
    setCopiedName(name);
    setTimeout(() => setCopiedName(''), 1500);
  }, [onCopy]);

  const totalFiles = results.reduce((sum, r) => sum + r.files.filter((f) => !f.error).length, 0);

  return (
    <>
      <div className="card">
        <div className="card-title">批量作业（多学生）</div>
        <div className="hint" style={{ marginBottom: 12 }}>
          把助手发来的所有学生作业链接一次性粘贴进来（每行一个，可混合多个学生）。系统会自动按学生分组、识别姓名、归位到对应作业，并按下方的顺序逐个生成群消息与 PDF。
        </div>

        <div className="field">
          <label>粘贴所有作业链接</label>
          <textarea
            placeholder={'https://test.hzdmsyy.com/pc/prints?id=...\nhttps://test.hzdmsyy.com/pc/prints/review-cycle-paper?id=...\n（把不同学生的链接都粘进来即可）'}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            style={{ minHeight: 140 }}
          />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => importFromClipboard(false)}>
              从剪贴板导入
            </button>
            <button className="btn btn-ghost" onClick={() => importFromClipboard(true)}>
              导入并解析
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoListen} onChange={(e) => setAutoListen(e.target.checked)} />
              自动监听剪贴板
            </label>
          </div>
        </div>

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

        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => handleParse()} disabled={!pasted.trim()}>
            解析并分组
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={groups.length === 0 || generating}
          >
            {generating ? '正在生成...' : `为 ${groups.length} 名学生生成`}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setPasted('');
              setGroups([]);
              setResults([]);
              setParseError('');
            }}
          >
            清空
          </button>
        </div>

        {parseError && <div style={{ color: 'var(--danger)', fontSize: '.85rem', marginTop: 10 }}>{parseError}</div>}
      </div>

      {/* 分组预览（可修正学生名） */}
      {groups.length > 0 && (
        <div className="card">
          <div className="card-title">
            已分组（共 {groups.length} 名学生，按粘贴顺序）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {groups.map((g, idx) => (
              <div key={g.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--muted)' }}>{idx + 1}.</span>
                  <input
                    type="text"
                    value={g.name}
                    onChange={(e) => updateGroupName(g.id, e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '.88rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit' }}
                  />
                </div>
                {SLOT_LABELS.map(({ key, label }) => (
                  <div key={key} style={{ fontSize: '.78rem', color: 'var(--muted)', margin: '2px 0' }}>
                    <span style={{ display: 'inline-block', width: 130, color: 'var(--text)' }}>{label}：</span>
                    <span style={{ wordBreak: 'break-all' }}>{g.links[key] ? g.links[key].split('\n').length + ' 条' : '—'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 生成结果（按学生顺序） */}
      {results.length > 0 && (
        <>
          <div className="card">
            <div className="card-title">
              生成结果（{results.length} 名学生，{totalFiles} 个 PDF）
              {totalFiles > 0 && (
                <button className="btn btn-ghost" onClick={downloadAll} style={{ fontSize: '.78rem', padding: '4px 14px', marginLeft: 8 }}>
                  下载全部 PDF
                </button>
              )}
            </div>
          </div>

          {results.map((r, idx) => (
            <div className="card" key={`${r.studentName}-${idx}`}>
              <div className="card-title">
                {idx + 1}. {r.studentName}
                {r.error && <span style={{ color: 'var(--danger)', fontSize: '.8rem', marginLeft: 8 }}>⚠ {r.error}</span>}
              </div>

              {!r.error && r.message && (
                <>
                  <div className="output-area">{r.message}</div>
                  <div className="btn-row">
                    <button className="btn btn-primary" onClick={() => handleCopyMessage(r.message, r.studentName)}>
                      {copiedName === r.studentName ? '已复制' : '复制作业消息'}
                    </button>
                  </div>
                </>
              )}

              {r.files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {r.files.map((f) => (
                    <div
                      key={f.name}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}
                    >
                      <span style={{ color: f.error ? 'var(--danger)' : 'var(--text)' }}>
                        {f.error ? '⚠ ' : '✅ '}
                        {f.name}
                        {!f.error && <span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--muted)' }}>{formatFileSize(f.size)}</span>}
                        {f.error && <span style={{ marginLeft: 8, fontSize: '.72rem' }}>{f.error}</span>}
                      </span>
                      {!f.error && r.sessionId && (
                        <button className="btn btn-ghost" style={{ fontSize: '.74rem', padding: '3px 12px' }} onClick={() => downloadSingle(r.sessionId, f.name)}>
                          下载
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
