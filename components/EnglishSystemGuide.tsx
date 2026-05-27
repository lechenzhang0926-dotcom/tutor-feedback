'use client';

import { useState, useCallback, useEffect } from 'react';
import { getConfig, saveConfig, clearConfig, type EnglishSystemConfig, type PageRecord } from '@/lib/englishSystemConfig';

interface Props {
  toast: (msg: string) => void;
}

type PageRole = 'report' | 'homework1' | 'reviewPaper' | 'simpleSentence';

export function EnglishSystemGuide({ toast }: Props) {
  const [config, setConfig] = useState<EnglishSystemConfig>(getConfig());
  const [showPanel, setShowPanel] = useState(false);
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [recordUrl, setRecordUrl] = useState('');
  const [recording, setRecording] = useState(false);

  // 同步 config 到 localStorage
  const updateConfig = useCallback((partial: Partial<EnglishSystemConfig>) => {
    const next = { ...config, ...partial };
    setConfig(next);
    saveConfig(next);
  }, [config]);

  // 记录当前页面
  const handleRecordPage = useCallback(async (role: PageRole) => {
    if (!recordUrl.trim()) {
      toast('请先输入当前页面 URL');
      return;
    }
    setRecording(true);
    try {
      const res = await fetch(`/api/local-automation/get-page-info?url=${encodeURIComponent(recordUrl.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const pageRecord: PageRecord = { url: data.url, title: data.title, previewText: data.previewText };
      const recordedPages = { ...config.recordedPages, [role]: pageRecord };
      updateConfig({ recordedPages });
      toast(`已记录为${role === 'report' ? '上课报告' : role === 'homework1' ? '课后作业1' : role === 'reviewPaper' ? '抗遗忘试卷' : '极简造句'}页面`);
    } catch (err) {
      toast('记录失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setRecording(false);
    }
  }, [recordUrl, config, updateConfig, toast]);

  // 测试读取
  const handleTestRead = useCallback(async () => {
    if (!testUrl.trim()) {
      toast('请先输入页面 URL');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/local-automation/get-page-info?url=${encodeURIComponent(testUrl.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestResult(data);
    } catch (err) {
      toast('读取失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setTesting(false);
    }
  }, [testUrl, toast]);

  const handleClear = useCallback(() => {
    clearConfig();
    setConfig(getConfig());
    toast('已清空配置');
  }, [toast]);

  return (
    <div>
      <div className="card">
        <div className="card-title">本地自动化模式</div>
        <div style={{ fontSize: '.84rem', color: 'var(--muted)', marginBottom: 4 }}>
          设置英语系统各页面位置，用于本地自动化导航。
        </div>
        <div style={{ fontSize: '.76rem', color: 'var(--danger)', marginBottom: 12 }}>
          本地自动化模式仅本机可用。部署到线上时此功能不可用。
        </div>
        <button className="btn btn-ghost" onClick={() => setShowPanel(!showPanel)}>
          {showPanel ? '收起配置' : '设置英语系统页面位置'}
        </button>
      </div>

      {showPanel && (
        <>
          {/* 手动配置 */}
          <div className="card">
            <div className="card-title">页面位置说明</div>

            <div className="field">
              <label>系统首页地址</label>
              <input type="text" value={config.systemUrl} onChange={(e) => updateConfig({ systemUrl: e.target.value })} placeholder="https://xxx.com" />
            </div>
            <div className="field">
              <label>学生搜索/学生列表页面</label>
              <input type="text" value={config.studentSearch} onChange={(e) => updateConfig({ studentSearch: e.target.value })} placeholder="左侧菜单-学生管理-输入学生姓名" />
            </div>
            <div className="field">
              <label>上课报告页面</label>
              <input type="text" value={config.reportPage} onChange={(e) => updateConfig({ reportPage: e.target.value })} placeholder="学生详情-上课记录-选择今日课程-查看报告" />
            </div>
            <div className="field">
              <label>课后作业1页面</label>
              <input type="text" value={config.homework1Page} onChange={(e) => updateConfig({ homework1Page: e.target.value })} placeholder="课程报告页底部-打印作业按钮" />
            </div>
            <div className="field">
              <label>抗遗忘试卷页面</label>
              <input type="text" value={config.reviewPaperPage} onChange={(e) => updateConfig({ reviewPaperPage: e.target.value })} placeholder="学生详情-抗遗忘-打印试卷" />
            </div>
            <div className="field">
              <label>极简造句页面</label>
              <input type="text" value={config.simpleSentencePage} onChange={(e) => updateConfig({ simpleSentencePage: e.target.value })} placeholder="课程详情-极简造句-打印" />
            </div>
            <div className="field">
              <label>备注</label>
              <textarea value={config.notes} onChange={(e) => updateConfig({ notes: e.target.value })} placeholder="额外提醒，例如：有时候需要先选择日期" style={{ minHeight: 60 }} />
            </div>

            <div className="btn-row">
              <button className="btn btn-ghost" onClick={handleClear}>清空配置</button>
            </div>
          </div>

          {/* 记录当前页面 */}
          <div className="card">
            <div className="card-title">记录当前位置</div>
            <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 12 }}>
              在浏览器中手动打开英语系统对应页面，复制 URL 粘贴到下方，然后点击记录按钮。
            </div>
            <div className="field">
              <label>当前页面 URL</label>
              <input type="text" value={recordUrl} onChange={(e) => setRecordUrl(e.target.value)} placeholder="https://xxx.com/course/report?id=123" />
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => handleRecordPage('report')} disabled={recording}>
                {recording ? '读取中...' : '记录为上课报告页面'}
              </button>
              <button className="btn btn-ghost" onClick={() => handleRecordPage('homework1')} disabled={recording}>
                记录为课后作业1页面
              </button>
              <button className="btn btn-ghost" onClick={() => handleRecordPage('reviewPaper')} disabled={recording}>
                记录为抗遗忘试卷页面
              </button>
              <button className="btn btn-ghost" onClick={() => handleRecordPage('simpleSentence')} disabled={recording}>
                记录为极简造句页面
              </button>
            </div>

            {/* 已记录页面 */}
            {Object.keys(config.recordedPages).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 500, marginBottom: 8 }}>已记录页面：</div>
                {(['report', 'homework1', 'reviewPaper', 'simpleSentence'] as PageRole[]).map((role) => {
                  const page = config.recordedPages[role];
                  if (!page) return null;
                  const label = role === 'report' ? '上课报告' : role === 'homework1' ? '课后作业1' : role === 'reviewPaper' ? '抗遗忘试卷' : '极简造句';
                  return (
                    <div key={role} style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 4 }}>
                      <strong>{label}：</strong>{page.title} — {page.url}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 测试读取 */}
          <div className="card">
            <div className="card-title">测试读取当前页面</div>
            <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 12 }}>
              输入英语系统页面 URL，读取页面信息、链接和数据。
            </div>
            <div className="field">
              <label>页面 URL</label>
              <input type="text" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} placeholder="https://xxx.com/course/report?id=123" />
            </div>
            <button className="btn btn-primary" onClick={handleTestRead} disabled={testing}>
              {testing ? '读取中...' : '测试读取当前页面'}
            </button>

            {testResult && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: 8 }}>读取结果：</div>
                <div style={{ fontSize: '.82rem', lineHeight: 1.8 }}>
                  <div><span style={{ color: 'var(--muted)' }}>标题：</span>{testResult.title}</div>
                  <div><span style={{ color: 'var(--muted)' }}>URL：</span>{testResult.url}</div>
                  {testResult.studentName && <div><span style={{ color: 'var(--muted)' }}>学生：</span>{testResult.studentName}</div>}
                  {testResult.dataLines?.length > 0 && (
                    <div>
                      <span style={{ color: 'var(--muted)' }}>课堂数据：</span>
                      {testResult.dataLines.map((l: string, i: number) => <div key={i} style={{ marginLeft: 20 }}>{l}</div>)}
                    </div>
                  )}
                  <div><span style={{ color: 'var(--muted)' }}>PDF链接数：</span>{testResult.pdfCount}</div>
                  <div><span style={{ color: 'var(--muted)' }}>页面总链接数：</span>{testResult.allLinksCount}</div>
                </div>

                {testResult.pdfLinks?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '.8rem', fontWeight: 500, marginBottom: 6 }}>PDF 直链（{testResult.pdfLinks.length}）：</div>
                    {testResult.pdfLinks.map((l: any, i: number) => (
                      <div key={i} style={{ fontSize: '.76rem', color: 'var(--muted)', wordBreak: 'break-all', marginBottom: 2 }}>
                        {l.href}
                        {l.text && <span style={{ marginLeft: 8 }}>"{l.text}"</span>}
                      </div>
                    ))}
                  </div>
                )}

                {testResult.printLinks?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '.8rem', fontWeight: 500, marginBottom: 6 }}>打印相关链接（{testResult.printLinks.length}）：</div>
                    {testResult.printLinks.map((l: any, i: number) => (
                      <div key={i} style={{ fontSize: '.76rem', color: 'var(--muted)', wordBreak: 'break-all', marginBottom: 2 }}>
                        {l.href}
                        {l.text && <span style={{ marginLeft: 8 }}>"{l.text}"</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
