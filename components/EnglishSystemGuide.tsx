'use client';

import { useState, useCallback, useEffect } from 'react';
import { getConfig, saveConfig, clearConfig, type EnglishSystemConfig } from '@/lib/englishSystemConfig';
import { getRules, saveRule, deleteRule, createRuleFromResponse, getRuleTypeLabel, getAllRuleTypes, type ApiRule, type ApiRuleType } from '@/lib/apiRules';
import { getEffectiveClickMemory, saveClickMemory, deleteClickMemory, getClickMemories, hasSavedMemory, type ClickMemory } from '@/lib/clickMemory';

export interface ImportFeedbackData {
  structuredData: string;
  notes: string;
  studentName?: string;
}

export interface ImportHomeworkData {
  link1?: string;
  link2?: string;
  link3?: string;
  studentName?: string;
}

interface Props {
  toast: (msg: string) => void;
  onImportToFeedback: (data: ImportFeedbackData) => void;
  onImportToHomework: (data: ImportHomeworkData) => void;
  onImportBoth: (feedbackData: ImportFeedbackData, homeworkData: ImportHomeworkData) => void;
}

export function EnglishSystemGuide({ toast, onImportToFeedback, onImportToHomework, onImportBoth }: Props) {
  const [config, setConfig] = useState<EnglishSystemConfig>(getConfig());
  const [browserOpen, setBrowserOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [reading, setReading] = useState(false);
  const [pageResult, setPageResult] = useState<any>(null);
  const [readError, setReadError] = useState('');

  const [clicking, setClicking] = useState(false);
  const [clickResult, setClickResult] = useState<any>(null);

  const [monitoring, setMonitoring] = useState(false);
  const [monitorResult, setMonitorResult] = useState<any>(null);

  const [savedRules, setSavedRules] = useState<ApiRule[]>([]);
  const [saveRuleIdx, setSaveRuleIdx] = useState<number | null>(null); // which response index to save
  const [ruleTypeSelect, setRuleTypeSelect] = useState<ApiRuleType>('report');
  const [ruleName, setRuleName] = useState('');
  const [testingRule, setTestingRule] = useState<string | null>(null);
  const [testRuleResult, setTestRuleResult] = useState<any>(null);

  const [generating, setGenerating] = useState(false);
  const [genResults, setGenResults] = useState<any>(null);
  const [manualName, setManualName] = useState('');
  const [manualDate, setManualDate] = useState('');

  const [reportTests, setReportTests] = useState<Array<{ studentName: string; result: any; timestamp: number }>>([]);
  const [testingReport, setTestingReport] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clickMemories, setClickMemories] = useState<ClickMemory[]>([]);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);

  const reloadMemories = useCallback(() => setClickMemories(getClickMemories()), []);

  useEffect(() => {
    fetch('/api/local-automation/browser').then((r) => r.json()).then((d) => { if (d.open) setBrowserOpen(true); }).catch(() => {});
  }, []);

  const updateConfig = useCallback((p: Partial<EnglishSystemConfig>) => { const n = { ...config, ...p }; setConfig(n); saveConfig(n); }, [config]);

  // ---- open ----
  const handleOpen = useCallback(async () => {
    const url = config.systemUrl.trim();
    if (!url) { toast('请先输入英语系统首页地址'); return; }
    setOpening(true);
    try {
      const r = await fetch('/api/local-automation/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open', systemUrl: url }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setBrowserOpen(true); toast('浏览器已打开，请手动登录');
    } catch (e: any) { toast(e.message); }
    finally { setOpening(false); }
  }, [config.systemUrl, toast]);

  const handleClose = useCallback(async () => {
    await fetch('/api/local-automation/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close' }) }).catch(() => {});
    setBrowserOpen(false); setPageResult(null); setReadError(''); setClickResult(null); setGenResults(null); toast('浏览器已关闭');
  }, [toast]);

  // ---- read ----
  const handleRead = useCallback(async () => {
    setReading(true); setReadError(''); setPageResult(null); setClickResult(null); setGenResults(null);
    try {
      const r = await fetch('/api/local-automation/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read' }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPageResult(d);
      const extra = d.studentRows?.length ? `，${d.studentRows.length} 个学生行` : '';
      toast(`识别为${d.pageType}${extra}`);
    } catch (e: any) { setReadError(e.message); toast(e.message); }
    finally { setReading(false); }
  }, [toast]);

  // ---- click ----
  const handleClick = useCallback(async (index: number, label: string) => {
    setClicking(true); setClickResult(null);
    try {
      const r = await fetch('/api/local-automation/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'click', buttonIndex: index }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setClickResult(d);
      if (d.error) toast(d.error);
      else if (d.popupOpened) toast(`已打开新页面：${d.popupTitle || d.popupUrl}`);
      else if (d.downloadUrl) toast(`已捕获下载`);
      else if (d.urlChanged) toast(`URL 已变化`);
      else toast(`已点击"${label}"，查看下方调试结果`);
    } catch (e: any) { toast(e.message); }
    finally { setClicking(false); }
  }, [toast]);

  // ---- click-report (report verification, row-targeted) ----
  const handleClickReport = useCallback(async (rowIndex: number, actionName: string, studentName: string) => {
    setTestingReport(studentName); setClickResult(null);
    try {
      const r = await fetch('/api/local-automation/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'click-report', rowIndex, actionName, studentName }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setClickResult(d);
      setReportTests((prev) => [...prev, { studentName, result: d, timestamp: Date.now() }]);
      if (d.success) toast(`${studentName} 报告测试完成`);
      else toast(`${studentName}: ${d.error || '测试失败'}`);
    } catch (e: any) { toast(e.message); }
    finally { setTestingReport(null); }
  }, [toast]);

  // ---- click-auto (row-targeted: click → detect → generate) ----
  const handleClickAuto = useCallback(async (rowIndex: number, actionName: string, studentName?: string) => {
    setClicking(true); setClickResult(null);
    if (studentName) setManualName(studentName);

    const memory = getEffectiveClickMemory(actionName);
    const expectedResultType = memory?.resultType;

    try {
      const r = await fetch('/api/local-automation/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'click-auto', rowIndex, actionName, studentName: studentName || undefined, expectedResultType }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setClickResult(d);

      // Save click memory based on result
      if (d.resultType === 'homework1-print') {
        saveClickMemory({ actionName, resultType: 'new-page-homework1', triggerText: actionName, urlPattern: '/pc/prints?id=', pageType: '课后作业1打印页', evidence: { urlChanged: true, popup: true, domChanged: true, keywords: ['打印中英文', '打印英文', '打印中文', '打印音标'] }, updatedAt: '' });
      } else if (d.resultType === 'review-paper') {
        saveClickMemory({ actionName, resultType: 'new-page-review-paper', triggerText: actionName, urlPattern: 'review-cycle-paper', pageType: '抗遗忘试卷页', evidence: { urlChanged: true, popup: true, domChanged: true, keywords: ['抗遗忘', '复习日期', '遗忘词数'] }, updatedAt: '' });
      } else if (d.resultType === 'simple-sentence') {
        saveClickMemory({ actionName, resultType: 'new-page-simple', triggerText: actionName, urlPattern: 'simple', pageType: '极简造句页', evidence: { urlChanged: true, popup: true, domChanged: true, keywords: ['极简造句', '造句'] }, updatedAt: '' });
      } else if (d.resultType === 'same-page-report') {
        saveClickMemory({ actionName, resultType: 'same-page-report', triggerText: actionName, urlPattern: '', pageType: '报告结果', evidence: { urlChanged: false, popup: false, domChanged: d.domChanged, keywords: ['报告', '共识记', '学新词汇', '复习词汇'] }, updatedAt: '' });
      }

      // Update memory display
      reloadMemories();

      if (d.needsInput) toast(`${d.action}页面已打开，请填写名字和日期后重试`);
      else if (d.success && d.resultType === 'homework1-print') toast(`课后 PDF：${d.pdfResults?.filter((x: any) => x.success).length}/${d.pdfResults?.length || 4} 成功`);
      else if (d.success && (d.resultType === 'review-paper' || d.resultType === 'simple-sentence')) toast(`${d.action} PDF 已生成`);
      else if (d.resultType === 'same-page-report') toast(d.domChanged ? '报告内容已变化' : '报告页面无明显变化');
      else if (d.resultType === 'download') toast(`已下载：${d.downloadFilename}`);
      else if (d.resultType === 'new-page-unknown') toast('已打开新页面，类型未识别');
    } catch (e: any) { toast(e.message); }
    finally { setClicking(false); }
  }, [toast, reloadMemories]);

  // ---- monitor ----
  const handleMonitor = useCallback(async () => {
    setMonitoring(true); setMonitorResult(null);
    toast('正在监听 5 秒，请在 Chromium 中手动点击...');
    try {
      const r = await fetch('/api/local-automation/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'monitor' }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMonitorResult(d);
      const tags = d.interestingResponses?.length ? `${d.interestingResponses.length} 个可疑响应` : '';
      const popup = d.popupOpened ? ' 检测到 popup' : '';
      const dl = d.downloadTriggered ? ' 检测到下载' : '';
      toast(`监听完成：${d.totalRequests} 请求 ${d.totalResponses} 响应${tags ? '，' + tags : ''}${popup}${dl}`);
    } catch (e: any) { toast(e.message); }
    finally { setMonitoring(false); }
  }, [toast]);

  const loadRules = useCallback(() => setSavedRules(getRules()), []);

  const handleSaveRule = useCallback((respIdx: number) => {
    const resp = monitorResult?.interestingResponses?.[respIdx];
    if (!resp) return;
    setSaveRuleIdx(respIdx);
    setRuleTypeSelect(resp.tags?.[0]?.includes('报告') ? 'report' : resp.tags?.[0]?.includes('课后') ? 'homework' : resp.tags?.[0]?.includes('PDF') ? 'pdf' : resp.tags?.[0]?.includes('抗遗忘') ? 'review' : resp.tags?.[0]?.includes('极简造句') ? 'simple' : 'other');
    setRuleName('');
  }, [monitorResult]);

  const handleConfirmSave = useCallback(() => {
    if (saveRuleIdx === null || !monitorResult) return;
    const resp = monitorResult.interestingResponses?.[saveRuleIdx];
    if (!resp) return;
    const rule = createRuleFromResponse(resp, ruleTypeSelect, ruleName.trim() || undefined);
    saveRule(rule);
    loadRules();
    setSaveRuleIdx(null);
    toast('规则已保存');
  }, [saveRuleIdx, monitorResult, ruleTypeSelect, ruleName, loadRules, toast]);

  const handleTestRule = useCallback(async (rule: ApiRule) => {
    setTestingRule(rule.id); setTestRuleResult(null);
    try {
      const r = await fetch('/api/local-automation/browser', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-rule', url: rule.url }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setTestRuleResult({ ruleId: rule.id, ...d });
      toast(d.status ? `状态 ${d.status}` : '读取完成');
    } catch (e: any) { toast(e.message); }
    finally { setTestingRule(null); }
  }, [toast]);

  const handleDeleteRule = useCallback((id: string) => {
    deleteRule(id);
    loadRules();
    toast('规则已删除');
  }, [loadRules, toast]);

  // ---- import ----
  const formatFeedback = useCallback((r: any): ImportFeedbackData => {
    const lines: string[] = [];
    if (r.studentName) lines.push(`学生：${r.studentName}`);
    const text = r.textPreview || '';
    for (const p of [/今日共识记词汇[：:]\s*\S+/, /学新词汇[：:]\s*\S+/, /学新遗忘[：:]\s*\S+/, /复习词汇[：:]\s*\S+/, /复习遗忘[：:]\s*\S+/, /正确率[：:]\s*\S+/, /需复习[：:]\s*\S+/, /已复习[：:]\s*\S+/]) { const m = text.match(p); if (m) lines.push(m[0]); }
    return { structuredData: lines.join('\n'), notes: '', studentName: r.studentName || undefined };
  }, []);

  const formatHomework = useCallback((r: any): ImportHomeworkData => {
    const all = [...(r.printLinks || []), ...(r.pdfLinks || [])];
    return { link1: all[0]?.href || '', link2: all[1]?.href || '', link3: all[2]?.href || '', studentName: r.studentName || undefined };
  }, []);

  const hasResult = pageResult && !readError;
  const isRecordPage = hasResult && pageResult.pageType === '销课记录页';
  const isPrintPage = hasResult && pageResult.pageType === '课后作业1打印页';

  return (
    <div>
      {/* ====== Controls ====== */}
      <div className="card">
        <div className="card-title">本地自动化</div>
        <div className="field">
          <label>系统首页地址</label>
          <input type="text" value={config.systemUrl} onChange={(e) => updateConfig({ systemUrl: e.target.value })} placeholder="https://test.hzdmsyy.com/teacher/" />
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleOpen} disabled={browserOpen || opening}>
            {opening ? '正在打开...' : browserOpen ? '已打开' : '打开系统并登录'}
          </button>
          <button className="btn btn-primary" onClick={handleRead} disabled={!browserOpen || reading}>
            {reading ? '读取中...' : '读取当前浏览器页面'}
          </button>
          <button className="btn btn-ghost" onClick={handleMonitor} disabled={!browserOpen || monitoring} style={{ background: monitoring ? 'var(--accent-light)' : undefined, borderColor: monitoring ? 'var(--accent)' : undefined }}>
            {monitoring ? '监听中 (5秒)...' : '开始监听下一次点击'}
          </button>
          {browserOpen && <button className="btn btn-ghost" onClick={handleClose}>关闭浏览器</button>}
        </div>
        {browserOpen && (
          <div style={{ marginTop: 8, fontSize: '.78rem', color: 'var(--success)' }}>
            浏览器已打开。请手动登录并导航到目标页面，然后点击"读取当前浏览器页面"。
          </div>
        )}
        {readError && <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: '.84rem' }}>{readError}</div>}
      </div>

      {/* ====== Zone 1: 当前页面信息 ====== */}
      {hasResult && (
        <div className="card">
          <div className="card-title">当前页面信息</div>
          <div style={{ fontSize: '.84rem', lineHeight: 1.9 }}>
            <div><span style={{ color: 'var(--muted)' }}>页面类型：</span><strong style={{ color: 'var(--accent)' }}>{pageResult.pageType}</strong></div>
            <div><span style={{ color: 'var(--muted)' }}>URL：</span><span style={{ wordBreak: 'break-all', fontSize: '.76rem' }}>{pageResult.url}</span></div>
            <div><span style={{ color: 'var(--muted)' }}>标题：</span>{pageResult.title}</div>
            <div>
              <span style={{ color: 'var(--muted)' }}>全部链接：</span>{pageResult.allLinksCount} 个
              <span style={{ marginLeft: 12 }}>PDF：{pageResult.pdfCount} 个</span>
              <span style={{ marginLeft: 12 }}>可点击元素：{pageResult.clickablesCount} 个</span>
            </div>

            <details style={{ marginTop: 4 }}>
              <summary style={{ fontSize: '.78rem', color: 'var(--accent)', cursor: 'pointer' }}>页面文本预览（前 1000 字）</summary>
              <div style={{ marginTop: 4, padding: 10, background: '#fff', borderRadius: 6, fontSize: '.74rem', maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                {pageResult.textPreview}
              </div>
            </details>

            {pageResult.pdfLinks?.length > 0 && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ fontSize: '.78rem', color: 'var(--accent)', cursor: 'pointer' }}>PDF 链接（{pageResult.pdfLinks.length}）</summary>
                {pageResult.pdfLinks.map((l: any, i: number) => <div key={i} style={{ fontSize: '.74rem', color: 'var(--muted)', wordBreak: 'break-all', marginTop: 2 }}>{l.href}</div>)}
              </details>
            )}
          </div>
        </div>
      )}

      {/* ====== Zone 2: 销课记录操作列表 ====== */}
      {isRecordPage && (
        <div className="card">
          <div className="card-title">销课记录操作列表 {pageResult.studentRows?.length > 0 && <span style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 400 }}>（{pageResult.studentRows.length} 个学生行）</span>}</div>

          {pageResult.studentRows?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pageResult.studentRows.map((row: any, ri: number) => (
                <div key={ri} style={{ padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: '.88rem', color: 'var(--text)' }}>{row.studentName}</div>
                  <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 2 }}>
                    {row.courseName && <span>课程：{row.courseName}</span>}
                    {row.time && <span style={{ marginLeft: row.courseName ? 12 : 0 }}>时间：{row.time}</span>}
                  </div>
                  {row.operations?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginBottom: 4 }}>操作：</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {row.operations.map((op: any, oi: number) => {
                          const label = op.text;
                          const isLinkOp = /课后|极简造句|抗遗忘/.test(label) && !/报告|AI阅读/.test(label);
                          const displayLabel = isLinkOp ? `获取${label} PDF` : `获取${label}`;
                          const mem = getEffectiveClickMemory(label);
                          const memHint = mem?.resultType === 'new-page-homework1' ? '→打印页' :
                            mem?.resultType === 'new-page-review-paper' ? '→抗遗忘页' :
                            mem?.resultType === 'new-page-simple' ? '→造句页' :
                            mem?.resultType === 'same-page-report' ? '→报告内容' : '';
                          return (
                            <button key={oi} className="btn btn-ghost" onClick={() => handleClickAuto(row.rowIndex, label, row.studentName)}
                              disabled={clicking} style={{ fontSize: '.76rem', padding: '4px 14px' }} title={memHint ? `预期：${memHint.slice(1)}` : ''}>
                              {displayLabel}{memHint && <span style={{ fontSize: '.62rem', color: 'var(--muted)', marginLeft: 3 }}>{memHint}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!row.operations?.length && (
                    <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>未识别到操作按钮</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
              已识别为销课记录页，但未能解析学生行。请确认已导航到正确的页面后重新读取。
            </div>
          )}
        </div>
      )}

      {/* ====== 报告规则验证 ====== */}
      {isRecordPage && pageResult.studentRows?.length > 0 && (
        <div className="card">
          <div className="card-title">报告规则验证</div>
          <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 12 }}>
            点击"测试报告"验证每个学生的报告链接是否唯一。
          </div>

          {/* Per-student rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {pageResult.studentRows.map((row: any, ri: number) => {
              const reportOp = row.operations?.find((op: any) => /报告/.test(op.text) && !/课后|极简|抗遗忘/.test(op.text));
              const isTested = reportTests.find((t) => t.studentName === row.studentName);
              return (
                <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid var(--border)', fontSize: '.82rem' }}>
                  <strong style={{ minWidth: 60 }}>{row.studentName}</strong>
                  <span style={{ fontSize: '.72rem', color: 'var(--muted)', flex: 1 }}>
                    {row.courseName || ''}{row.time ? ` · ${row.time}` : ''}
                  </span>
                  <span style={{ fontSize: '.72rem', color: reportOp ? 'var(--success)' : 'var(--danger)' }}>
                    {reportOp ? '已识别报告操作' : '未识别报告操作'}
                  </span>
                  {reportOp && (
                    <button className="btn btn-ghost" onClick={() => handleClickReport(row.rowIndex, reportOp.text, row.studentName)}
                      disabled={testingReport === row.studentName}
                      style={{ fontSize: '.72rem', padding: '3px 12px', whiteSpace: 'nowrap' }}>
                      {testingReport === row.studentName ? '测试中...' : isTested ? '重新测试' : '测试报告'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Test results */}
          {reportTests.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: '.82rem', marginBottom: 8 }}>测试结果：</div>
              {reportTests.map((test, ti) => {
                const r = test.result;
                return (
                  <div key={ti} style={{ marginBottom: 10, padding: '10px 14px', background: r.success ? '#edf7f0' : '#fef5f5', borderRadius: 6, border: '1px solid var(--border)', fontSize: '.8rem', lineHeight: 1.7 }}>
                    <div><strong>学生：{test.studentName}</strong></div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>点击结果：</span>
                      <span style={{ color: r.success ? 'var(--success)' : 'var(--danger)' }}>{r.success ? '成功' : '失败'}</span>
                      {r.error && <span style={{ color: 'var(--danger)' }}> ({r.error})</span>}
                    </div>
                    {r.postUrl && r.urlChanged && (
                      <div><span style={{ color: 'var(--muted)' }}>报告 URL：</span><span style={{ wordBreak: 'break-all', fontSize: '.74rem' }}>{r.postUrl}</span></div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', marginTop: 4 }}>
                      <div><span style={{ color: 'var(--muted)' }}>URL 变化：</span>{r.urlChanged ? '是' : '否'}</div>
                      <div><span style={{ color: 'var(--muted)' }}>新页面：</span>{r.popupOpened ? '是' : '否'}</div>
                      <div><span style={{ color: 'var(--muted)' }}>DOM 变化：</span>{r.domChanged ? '是' : '否'}</div>
                      <div><span style={{ color: 'var(--muted)' }}>网络捕获：</span>{r.networkCount || 0} 个响应</div>
                    </div>
                    {r.pageTitle && <div style={{ marginTop: 4 }}><span style={{ color: 'var(--muted)' }}>页面标题：</span>{r.pageTitle}</div>}
                    {r.allParams?.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: '.76rem', fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>参数：</div>
                        {r.allParams.map((ap: any, ai: number) => (
                          <div key={ai} style={{ fontSize: '.74rem', color: 'var(--muted)', marginBottom: 2, wordBreak: 'break-all' }}>
                            <div>URL: {ap.url.slice(0, 100)}</div>
                            <div style={{ marginLeft: 12 }}>
                              {Object.entries(ap.params).map(([k, v]) => (
                                <span key={k} style={{ marginRight: 12 }}>{k}: <strong style={{ color: 'var(--text)' }}>{v as string}</strong></span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.textPreview && !r.allParams?.length && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ fontSize: '.74rem', color: 'var(--accent)', cursor: 'pointer' }}>报告内容预览</summary>
                        <div style={{ marginTop: 4, padding: 8, background: '#fff', borderRadius: 4, fontSize: '.72rem', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>
                          {r.textPreview}
                        </div>
                      </details>
                    )}
                    {r.reportUrls?.length > 0 && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ fontSize: '.74rem', color: 'var(--accent)', cursor: 'pointer' }}>捕获的疑似报告链接（{r.reportUrls.length}）</summary>
                        {r.reportUrls.map((u: string, ui: number) => (
                          <div key={ui} style={{ fontSize: '.72rem', wordBreak: 'break-all', color: 'var(--muted)', marginTop: 2 }}>{u}</div>
                        ))}
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Comparison table */}
          {reportTests.length >= 2 && (
            <div>
              <div style={{ fontWeight: 600, fontSize: '.82rem', marginBottom: 8 }}>对比表：</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--tag-bg)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>学生</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>报告 URL</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>id</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>userId</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>terminal</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>唯一</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportTests.map((test, ti) => {
                      const r = test.result;
                      const pp = r.primaryParams || r.allParams?.[0]?.params || {};
                      return (
                        <tr key={ti}>
                          <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}><strong>{test.studentName}</strong></td>
                          <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: '.7rem', wordBreak: 'break-all', maxWidth: 200 }}>
                            {(r.primaryUrl || r.postUrl || '—').slice(0, 70)}
                          </td>
                          <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{pp.id || pp.ID || '—'}</td>
                          <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{pp.userId || pp.userid || '—'}</td>
                          <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{pp.terminal || '—'}</td>
                          <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                            {(() => {
                              const ids = reportTests.map((t) => {
                                const p = t.result.primaryParams || t.result.allParams?.[0]?.params || {};
                                return p.id || p.ID || t.result.primaryUrl || t.result.postUrl;
                              }).filter(Boolean);
                              const unique = new Set(ids).size === ids.length && ids.length >= 2;
                              return unique ? <span style={{ color: 'var(--success)' }}>是</span> : <span style={{ color: 'var(--danger)' }}>否</span>;
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Judgment */}
              <div style={{ marginTop: 10, padding: '8px 14px', borderRadius: 6, fontSize: '.84rem', fontWeight: 500 }}>
                {(() => {
                  const ids = reportTests.map((t) => {
                    const p = t.result.primaryParams || t.result.allParams?.[0]?.params || {};
                    return `${p.id || ''}|${p.userId || ''}|${t.result.primaryUrl || t.result.postUrl || ''}`;
                  }).filter(Boolean);
                  const unique = new Set(ids).size === ids.length && ids.length >= 2;
                  return unique
                    ? <span style={{ color: 'var(--success)' }}>已确认：报告规则可以区分不同学生。每个学生的报告 URL 或参数不同。</span>
                    : <span style={{ color: 'var(--danger)' }}>警告：当前规则可能没有正确区分学生。不同学生的报告 URL 或参数相同。</span>;
                })()}
              </div>
            </div>
          )}

          <button className="btn btn-ghost" onClick={() => { setReportTests([]); toast('已清除'); }} style={{ marginTop: 8, fontSize: '.76rem' }}>
            清除测试记录
          </button>
        </div>
      )}

      {/* ====== 打印页识别 ====== */}
      {isPrintPage && (
        <div className="card">
          <div className="card-title">课后作业1打印页</div>
          <div style={{ fontSize: '.84rem', color: 'var(--success)', marginBottom: 8 }}>
            已识别为课后作业1打印页。检测到打印按钮：{pageResult.printButtonNames?.join('、') || '中英文/英文/中文/音标'}
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 10 }}>
            可生成中英文/英文/中文/音标四个 PDF 并打包下载。
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: '.74rem', color: 'var(--muted)' }}>学生名字</label>
              <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder={pageResult.studentName || '手动输入'}
                style={{ width: '100%', padding: '6px 10px', fontSize: '.82rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: '.74rem', color: 'var(--muted)' }}>日期 MMDD</label>
              <input type="text" value={manualDate} onChange={(e) => setManualDate(e.target.value)} placeholder={pageResult.printDate || '如 0527'} maxLength={4}
                style={{ width: '100%', padding: '6px 10px', fontSize: '.82rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' }} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={async () => {
            setGenerating(true); setGenResults(null);
            try {
              const r = await fetch('/api/local-automation/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate-pdfs', studentName: manualName || undefined, date: manualDate || undefined }) });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error);
              setGenResults(d);
              toast(`${d.results?.filter((x: any) => x.success).length || 0}/${d.results?.length || 0} PDF 生成成功`);
            } catch (e: any) { toast(e.message); }
            finally { setGenerating(false); }
          }} disabled={generating}>
            {generating ? '生成中...' : '一键生成课后作业1 PDF'}
          </button>
          {genResults && (
            <div style={{ marginTop: 12 }}>
              {genResults.results?.map((r: any, i: number) => (
                <div key={i} style={{ fontSize: '.82rem', marginBottom: 4 }}><span style={{ color: r.success ? 'var(--success)' : 'var(--danger)' }}>{r.success ? 'OK' : 'FAIL'}</span> {r.label}：{r.filename}{r.error ? ` (${r.error})` : ''}</div>
              ))}
              {genResults.downloadUrl && <a href={genResults.downloadUrl} className="btn btn-primary" style={{ marginTop: 8, textDecoration: 'none', display: 'inline-flex' }} download>下载 {genResults.zipFilename}</a>}
            </div>
          )}
        </div>
      )}

      {/* ====== 操作结果 ====== */}
      {clickResult && (
        <div className="card">
          <div className="card-title">
            {clickResult.resultType === 'homework1-print' ? '课后 PDF 生成结果' :
             clickResult.resultType === 'review-paper' ? '抗遗忘试卷 PDF 生成结果' :
             clickResult.resultType === 'simple-sentence' ? '极简造句 PDF 生成结果' :
             clickResult.resultType === 'same-page-report' ? '报告读取结果' :
             clickResult.resultType === 'download' ? '文件下载结果' :
             clickResult.resultType === 'new-page-unknown' ? '新页面' :
             '点击结果'}
            {clickResult.action && (() => {
              const mem = getEffectiveClickMemory(clickResult.action);
              if (!mem) return null;
              const used = hasSavedMemory(clickResult.action) ? '已学习记忆' : '默认记忆';
              return <span style={{ marginLeft: 10, fontSize: '.68rem', padding: '2px 8px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 400 }}>使用：{used}</span>;
            })()}
          </div>
          <div style={{ fontSize: '.82rem', lineHeight: 1.8 }}>

            {/* --- Homework1 print --- */}
            {clickResult.resultType === 'homework1-print' && (
              <>
                {clickResult.needsInput ? (
                  <div>
                    <div style={{ color: 'var(--muted)', marginBottom: 10 }}>
                      已打开课后作业1打印页，但未能识别学生名字。
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="学生名字"
                        style={{ padding: '6px 10px', fontSize: '.82rem', border: '1px solid var(--border)', borderRadius: 6, width: 140 }} />
                      <input type="text" value={manualDate} onChange={(e) => setManualDate(e.target.value)} placeholder="MMDD（默认今天）" maxLength={4}
                        style={{ padding: '6px 10px', fontSize: '.82rem', border: '1px solid var(--border)', borderRadius: 6, width: 140 }} />
                      <button className="btn btn-primary" onClick={() => {
                        if (clickResult.action && clickResult.rowIndex !== undefined) {
                          handleClickAuto(clickResult.rowIndex, clickResult.action, manualName);
                        }
                      }} style={{ fontSize: '.78rem', padding: '6px 16px' }}>
                        重新生成
                      </button>
                    </div>
                  </div>
                ) : clickResult.success ? (
                  <div>
                    <div style={{ marginBottom: 6 }}>
                      {clickResult.pdfResults?.map((r: any, i: number) => (
                        <div key={i}><span style={{ color: r.success ? 'var(--success)' : 'var(--danger)' }}>{r.success ? 'OK' : 'FAIL'}</span> {r.label}：{r.filename}{r.error ? ` (${r.error})` : ''}</div>
                      ))}
                    </div>
                    {clickResult.downloadUrl && (
                      <a href={clickResult.downloadUrl} className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', fontSize: '.82rem' }} download>
                        下载 {clickResult.zipFilename}
                      </a>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--danger)' }}>{clickResult.error || '生成失败'}</div>
                )}
              </>
            )}

            {/* --- Review paper / Simple sentence PDF --- */}
            {(clickResult.resultType === 'review-paper' || clickResult.resultType === 'simple-sentence') && (
              <>
                {clickResult.needsInput ? (
                  <div>
                    <div style={{ color: 'var(--muted)', marginBottom: 10 }}>
                      已打开{clickResult.action}页面，但未能识别学生名字。
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="学生名字"
                        style={{ padding: '6px 10px', fontSize: '.82rem', border: '1px solid var(--border)', borderRadius: 6, width: 140 }} />
                      <button className="btn btn-primary" onClick={() => {
                        if (clickResult.action && clickResult.rowIndex !== undefined) {
                          handleClickAuto(clickResult.rowIndex, clickResult.action, manualName);
                        }
                      }} style={{ fontSize: '.78rem', padding: '6px 16px' }}>
                        重新生成
                      </button>
                    </div>
                  </div>
                ) : clickResult.success ? (
                  <div>
                    <div style={{ color: 'var(--success)' }}>PDF 生成成功：{clickResult.pdfFilename}</div>
                    {clickResult.downloadUrl && (
                      <a href={clickResult.downloadUrl} className="btn btn-primary" style={{ marginTop: 8, textDecoration: 'none', display: 'inline-flex', fontSize: '.82rem' }} download>
                        下载 PDF
                      </a>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--danger)' }}>{clickResult.error || '生成失败'}</div>
                )}
              </>
            )}

            {/* --- Report --- */}
            {clickResult.resultType === 'same-page-report' && (
              <>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>状态：</span>
                  URL 无变化 · {clickResult.domChanged ? <span style={{ color: 'var(--success)' }}>DOM 有变化</span> : 'DOM 无明显变化'}
                  {clickResult.networkResponses?.length > 0 && <span style={{ marginLeft: 12 }}>捕获 {clickResult.networkResponses.length} 个响应</span>}
                </div>
                {clickResult.textPreview && (
                  <details>
                    <summary style={{ fontSize: '.78rem', color: 'var(--accent)', cursor: 'pointer' }}>报告文本预览（前 1500 字）</summary>
                    <div style={{ marginTop: 4, padding: 10, background: '#fff', borderRadius: 6, fontSize: '.74rem', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                      {clickResult.textPreview}
                    </div>
                  </details>
                )}
                <button className="btn btn-ghost" onClick={() => {
                  if (clickResult.textPreview) {
                    onImportToFeedback({ structuredData: clickResult.textPreview, notes: '', studentName: clickResult.studentName });
                    toast('报告内容已导入课后反馈');
                  }
                }} style={{ marginTop: 8, fontSize: '.76rem' }}>
                  导入报告内容到课后反馈
                </button>
              </>
            )}

            {/* --- Download --- */}
            {clickResult.resultType === 'download' && (
              <div>
                <div style={{ color: 'var(--success)' }}>已捕获下载</div>
                <div style={{ fontSize: '.76rem' }}>{clickResult.downloadFilename}</div>
              </div>
            )}

            {/* --- Unknown new page --- */}
            {clickResult.resultType === 'new-page-unknown' && (
              <div>
                <div style={{ color: 'var(--muted)' }}>已打开新页面，但未识别类型。</div>
                <div><span style={{ color: 'var(--muted)' }}>URL：</span><span style={{ wordBreak: 'break-all', fontSize: '.76rem' }}>{clickResult.url}</span></div>
                <div><span style={{ color: 'var(--muted)' }}>标题：</span>{clickResult.title}</div>
                {clickResult.textPreview && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: '.76rem', color: 'var(--accent)', cursor: 'pointer' }}>页面文本预览</summary>
                    <div style={{ marginTop: 4, padding: 10, background: '#fff', borderRadius: 6, fontSize: '.74rem', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', border: '1px solid var(--border)' }}>
                      {clickResult.textPreview}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* --- Fallback: old-style click result (from click/monitor) --- */}
            {!clickResult.resultType && (
              <>
                <div style={{ marginBottom: 6 }}>
                  点击了：<strong>[{clickResult.clicked?.tag}] {clickResult.clicked?.text}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                  <div><span style={{ color: 'var(--muted)' }}>URL 变化：</span>{clickResult.urlChanged ? <span style={{ color: 'var(--success)' }}>是</span> : '否'}</div>
                  <div><span style={{ color: 'var(--muted)' }}>popup：</span>{clickResult.popupOpened ? <span style={{ color: 'var(--success)' }}>是</span> : '否'}</div>
                  <div><span style={{ color: 'var(--muted)' }}>download：</span>{clickResult.downloadUrl ? <span style={{ color: 'var(--success)' }}>是</span> : '否'}</div>
                </div>
                {clickResult.afterText && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: '.76rem', color: 'var(--accent)', cursor: 'pointer' }}>页面文本</summary>
                    <div style={{ marginTop: 4, padding: 10, background: '#fff', borderRadius: 6, fontSize: '.74rem', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', border: '1px solid var(--border)' }}>
                      {clickResult.afterText}
                    </div>
                  </details>
                )}
              </>
            )}

            <button className="btn btn-ghost" onClick={handleRead} disabled={reading} style={{ marginTop: 10, fontSize: '.76rem' }}>
              重新读取当前页面
            </button>
          </div>
        </div>
      )}

      {/* ====== 网络监听结果 ====== */}
      {monitorResult && (
        <div className="card">
          <div className="card-title">本次点击捕获结果</div>
          <div style={{ fontSize: '.82rem', lineHeight: 1.8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', marginBottom: 8 }}>
              <div><span style={{ color: 'var(--muted)' }}>URL 变化：</span>{monitorResult.urlChanged ? <span style={{ color: 'var(--success)' }}>是 → {monitorResult.postUrl?.slice(0, 60)}</span> : '否'}</div>
              <div><span style={{ color: 'var(--muted)' }}>DOM 变化：</span>{monitorResult.domChanged ? <span style={{ color: 'var(--success)' }}>是</span> : '否'}</div>
              <div><span style={{ color: 'var(--muted)' }}>请求数：</span>{monitorResult.totalRequests}</div>
              <div><span style={{ color: 'var(--muted)' }}>响应数：</span>{monitorResult.totalResponses}</div>
              <div><span style={{ color: 'var(--muted)' }}>popup：</span>{monitorResult.popupOpened ? <span style={{ color: 'var(--success)' }}>是</span> : '否'}</div>
              <div><span style={{ color: 'var(--muted)' }}>download：</span>{monitorResult.downloadTriggered ? <span style={{ color: 'var(--success)' }}>是</span> : '否'}</div>
            </div>

            {monitorResult.popupData && (
              <div style={{ marginBottom: 8, padding: '6px 10px', background: '#edf7f0', borderRadius: 6 }}>
                <strong>popup 新页面：</strong>
                <div style={{ fontSize: '.76rem' }}>{monitorResult.popupData.title}</div>
                <div style={{ fontSize: '.74rem', wordBreak: 'break-all', color: 'var(--muted)' }}>{monitorResult.popupData.url}</div>
              </div>
            )}

            {monitorResult.downloadData && (
              <div style={{ marginBottom: 8, padding: '6px 10px', background: '#edf7f0', borderRadius: 6 }}>
                <strong>下载文件：</strong>{monitorResult.downloadData.filename}
                <div style={{ fontSize: '.74rem', wordBreak: 'break-all', color: 'var(--muted)' }}>{monitorResult.downloadData.url}</div>
              </div>
            )}

            {/* Interesting responses */}
            {monitorResult.interestingResponses?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>可疑接口（{monitorResult.interestingResponses.length} 个）：</div>
                {monitorResult.interestingResponses.map((r: any, i: number) => (
                  <div key={i} style={{ marginBottom: 8, padding: '8px 10px', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: '.74rem', fontWeight: 500 }}>[{r.status}]</span>
                      <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{r.contentType?.slice(0, 40) || 'unknown'}</span>
                      {r.tags?.map((t: string, ti: number) => (
                        <span key={ti} style={{ fontSize: '.7rem', padding: '1px 8px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)' }}>{t}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: '.74rem', wordBreak: 'break-all', color: 'var(--muted)', marginBottom: 2 }}>{r.url.slice(0, 150)}</div>
                    {r.bodyPreview && (
                      <details>
                        <summary style={{ fontSize: '.72rem', color: 'var(--accent)', cursor: 'pointer' }}>响应预览（{r.bodyPreview.length} 字）</summary>
                        <div style={{ marginTop: 4, padding: 8, background: '#faf8f5', borderRadius: 4, fontSize: '.72rem', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>
                          {r.bodyPreview}
                        </div>
                      </details>
                    )}
                    <div style={{ marginTop: 4 }}>
                      {saveRuleIdx === i ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select value={ruleTypeSelect} onChange={(e) => setRuleTypeSelect(e.target.value as ApiRuleType)}
                            style={{ fontSize: '.72rem', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>
                            {getAllRuleTypes().map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <input type="text" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="规则名称（可选）"
                            style={{ flex: 1, minWidth: 100, fontSize: '.72rem', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4 }} />
                          <button className="btn btn-ghost" onClick={handleConfirmSave} style={{ fontSize: '.7rem', padding: '2px 10px' }}>确认保存</button>
                          <button className="btn btn-ghost" onClick={() => setSaveRuleIdx(null)} style={{ fontSize: '.7rem', padding: '2px 8px' }}>取消</button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost" onClick={() => handleSaveRule(i)} style={{ fontSize: '.7rem', padding: '2px 10px' }}>保存为规则</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!monitorResult.interestingResponses?.length && !monitorResult.popupOpened && !monitorResult.downloadTriggered && (
              <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>未捕获到可疑网络请求、popup 或下载。请在 Chromium 中手动点击后再试。</div>
            )}
          </div>
        </div>
      )}

      {/* ====== 点击行为记忆（Click Memory） ====== */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>点击行为记忆</div>
          <button className="btn btn-ghost" onClick={() => { reloadMemories(); setShowMemoryPanel(!showMemoryPanel); }} style={{ fontSize: '.72rem', padding: '2px 10px' }}>
            {showMemoryPanel ? '收起' : `展开 (${clickMemories.length > 0 ? clickMemories.length + '条已学习' : '4条默认'})`}
          </button>
        </div>
        {showMemoryPanel && (
          <div style={{ fontSize: '.78rem', marginTop: 8 }}>
            <div style={{ color: 'var(--muted)', marginBottom: 8 }}>
              记录每个操作的点击结果，系统用来自动判断该等待 popup 还是监听网络。
            </div>
            {(() => {
              const allActions = ['课后', '极简造句', '抗遗忘试卷', '报告', 'AI阅读'];
              const memMap = new Map<string, ClickMemory>();
              getClickMemories().forEach((m) => memMap.set(m.actionName, m));
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allActions.map((name) => {
                    const mem = getEffectiveClickMemory(name);
                    const saved = hasSavedMemory(name);
                    const resultLabel =
                      mem?.resultType === 'new-page-homework1' ? '新页面 → 打印页 → 生成PDF' :
                      mem?.resultType === 'new-page-review-paper' ? '新页面 → 抗遗忘页 → 单PDF' :
                      mem?.resultType === 'new-page-simple' ? '新页面 → 造句页 → 单PDF' :
                      mem?.resultType === 'same-page-report' ? '同页报告 → 提取文本' :
                      mem?.resultType === 'unknown' ? '未学习' : '—';
                    return (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}>
                        <strong style={{ minWidth: 72, fontSize: '.8rem' }}>{name}</strong>
                        <span style={{ fontSize: '.74rem', color: 'var(--muted)', flex: 1 }}>{resultLabel}</span>
                        {saved ? (
                          <span style={{ fontSize: '.68rem', padding: '1px 8px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)' }}>已学习</span>
                        ) : (
                          <span style={{ fontSize: '.68rem', padding: '1px 8px', borderRadius: 8, background: '#f0f0f0', color: 'var(--muted)' }}>默认规则</span>
                        )}
                        {saved && (
                          <button className="btn btn-ghost" onClick={() => { deleteClickMemory(name); reloadMemories(); toast(`已重置"${name}"的记忆`); }}
                            style={{ fontSize: '.66rem', padding: '1px 8px', color: 'var(--danger)' }}>重置</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ====== 已保存接口规则 ====== */}
      <div className="card">
        <div className="card-title">已保存接口规则 {savedRules.length > 0 && <span style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 400 }}>（{savedRules.length} 条）</span>}</div>
        <button className="btn btn-ghost" onClick={loadRules} style={{ fontSize: '.78rem', marginBottom: 8 }}>刷新列表</button>

        {savedRules.length === 0 ? (
          <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>暂无保存的规则。从上方监听结果中点击"保存为规则"来添加。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedRules.map((rule) => (
              <div key={rule.id} style={{ padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.82rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <strong style={{ fontSize: '.84rem' }}>{rule.name}</strong>
                  <span style={{ fontSize: '.72rem', padding: '2px 8px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    {getRuleTypeLabel(rule.type)}
                  </span>
                  {rule.method !== 'GET' && <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{rule.method}</span>}
                </div>
                <div style={{ fontSize: '.74rem', color: 'var(--muted)', wordBreak: 'break-all', marginBottom: 2 }}>{rule.url.slice(0, 120)}</div>
                <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginBottom: 6 }}>
                  {rule.contentType?.slice(0, 50)} · 更新于 {new Date(rule.updatedAt).toLocaleString('zh-CN')}
                </div>

                {/* Test result */}
                {testRuleResult?.ruleId === rule.id && (
                  <div style={{ marginBottom: 6, padding: '8px 10px', background: testRuleResult.status && testRuleResult.status < 400 ? '#edf7f0' : '#fef5f5', borderRadius: 6, fontSize: '.78rem', lineHeight: 1.6 }}>
                    <div><span style={{ color: 'var(--muted)' }}>状态：</span><strong>{testRuleResult.status} {testRuleResult.statusText}</strong></div>
                    <div><span style={{ color: 'var(--muted)' }}>Content-Type：</span>{testRuleResult.contentType?.slice(0, 60) || '—'}</div>
                    {testRuleResult.isPdf && <div style={{ color: 'var(--success)' }}>PDF 响应</div>}
                    {testRuleResult.bodyJson ? (
                      <details>
                        <summary style={{ color: 'var(--accent)', cursor: 'pointer', fontSize: '.74rem' }}>JSON 响应</summary>
                        <pre style={{ marginTop: 4, padding: 8, background: '#faf8f5', borderRadius: 4, fontSize: '.7rem', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(testRuleResult.bodyJson, null, 2)}
                        </pre>
                      </details>
                    ) : testRuleResult.bodyText ? (
                      <details>
                        <summary style={{ color: 'var(--accent)', cursor: 'pointer', fontSize: '.74rem' }}>响应文本</summary>
                        <div style={{ marginTop: 4, padding: 8, background: '#faf8f5', borderRadius: 4, fontSize: '.72rem', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                          {testRuleResult.bodyText}
                        </div>
                      </details>
                    ) : null}
                    {testRuleResult.pdfLinks?.length > 0 && (
                      <div style={{ marginTop: 4 }}><span style={{ color: 'var(--success)' }}>PDF 链接：{testRuleResult.pdfLinks.length} 个</span></div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost" onClick={() => handleTestRule(rule)} disabled={testingRule === rule.id}
                    style={{ fontSize: '.72rem', padding: '3px 12px' }}>
                    {testingRule === rule.id ? '测试中...' : '测试读取'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => handleDeleteRule(rule.id)}
                    style={{ fontSize: '.72rem', padding: '3px 10px', color: 'var(--danger)' }}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ====== 导入 ====== */}
      {hasResult && (
        <div className="card">
          <div className="card-title">导入数据</div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => { onImportToFeedback(formatFeedback(pageResult)); toast('已导入到课后反馈'); }}>导入到课后反馈</button>
            <button className="btn btn-primary" onClick={() => { onImportToHomework(formatHomework(pageResult)); toast('已导入到正课作业'); }}>导入到正课作业</button>
            <button className="btn btn-ghost" onClick={() => onImportBoth(formatFeedback(pageResult), formatHomework(pageResult))}>同时导入</button>
          </div>
        </div>
      )}

      {/* ====== 高级设置 ====== */}
      <div className="card">
        <button className="btn btn-ghost" onClick={() => setShowAdvanced(!showAdvanced)} style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>高级设置</span>
          <span style={{ transform: showAdvanced ? 'rotate(180deg)' : '', transition: 'transform .2s' }}>▼</span>
        </button>
        {showAdvanced && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 16, padding: 14, background: 'var(--tag-bg)', borderRadius: 8 }}>
              <div style={{ fontSize: '.82rem', fontWeight: 500, marginBottom: 8 }}>备用：粘贴 URL 读取</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" id="fbUrl" placeholder="https://..." style={{ flex: 1, padding: '6px 10px', fontSize: '.82rem', border: '1px solid var(--border)', borderRadius: 6 }} />
                <button className="btn btn-ghost" onClick={async () => {
                  const u = (document.getElementById('fbUrl') as HTMLInputElement)?.value; if (!u) { toast('请先粘贴 URL'); return; }
                  try {
                    const r = await fetch(`/api/local-automation/get-page-info?url=${encodeURIComponent(u)}`); const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    setPageResult({ ...d, pageType: '手动读取', clickables: [], clickablesCount: 0, studentRows: [], printButtonNames: [], hasPrintButtons: false, textPreview: d.previewText });
                    setReadError(''); setClickResult(null);
                  } catch (e: any) { toast(e.message); }
                }}>读取</button>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '.82rem', fontWeight: 500, marginBottom: 8 }}>页面位置说明</div>
              <div className="field"><label>学生搜索/列表</label><input type="text" value={config.studentSearch} onChange={(e) => updateConfig({ studentSearch: e.target.value })} /></div>
              <div className="field"><label>上课报告</label><input type="text" value={config.reportPage} onChange={(e) => updateConfig({ reportPage: e.target.value })} /></div>
              <div className="field"><label>课后作业1</label><input type="text" value={config.homework1Page} onChange={(e) => updateConfig({ homework1Page: e.target.value })} /></div>
              <div className="field"><label>抗遗忘试卷</label><input type="text" value={config.reviewPaperPage} onChange={(e) => updateConfig({ reviewPaperPage: e.target.value })} /></div>
              <div className="field"><label>极简造句</label><input type="text" value={config.simpleSentencePage} onChange={(e) => updateConfig({ simpleSentencePage: e.target.value })} /></div>
            </div>
            <button className="btn btn-ghost" onClick={() => { clearConfig(); setConfig(getConfig()); toast('已清空'); }}>清空配置</button>
          </div>
        )}
      </div>
    </div>
  );
}
