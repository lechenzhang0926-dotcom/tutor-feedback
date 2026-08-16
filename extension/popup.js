// ============================================================
// Tutor 课后反馈助手 — Popup Script
// ============================================================

const btnRead = document.getElementById('btnRead');
const btnSend = document.getElementById('btnSend');
const resultArea = document.getElementById('resultArea');
const warningArea = document.getElementById('warningArea');
const pageTitle = document.getElementById('pageTitle');
const pageUrl = document.getElementById('pageUrl');

let lastPageData = null;

// ---- Init: show current tab info ----
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    pageTitle.textContent = tab.title || '—';
    pageUrl.textContent = tab.url || '—';

    if (!tab.url || !tab.url.startsWith('https://test.hzdmsyy.com/')) {
      warningArea.innerHTML = '<div class="status status-info">请先打开智能英语系统页面<br><span style="font-size:11px;color:#666">https://test.hzdmsyy.com/teacher/</span></div>';
      btnRead.disabled = true;
    }
  } catch (e) {
    pageTitle.textContent = '获取失败';
  }
})();

// ---- Read page ----
btnRead.addEventListener('click', async () => {
  btnRead.textContent = '读取中...';
  btnRead.disabled = true;
  btnSend.disabled = true;
  resultArea.innerHTML = '';
  lastPageData = null;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('无法获取当前标签页');

    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['contentScript.js'],
    });

    // Run detection and parsing
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const fn = window.__tutorExtension;
        if (!fn) return { error: '内容脚本未加载' };
        const detection = fn.detectRecordPage();
        let students = { rows: [], actionCount: 0 };
        if (detection.isRecord) {
          students = fn.parseStudentRows();
        }
        return {
          title: document.title,
          url: window.location.href,
          detection,
          students,
        };
      },
    });

    const data = results[0]?.result;
    if (!data) throw new Error('读取失败');

    lastPageData = data;

    // Render results
    renderResults(data);

    if (data.detection.isRecord && data.students.rows.length > 0) {
      btnSend.disabled = false;
    }
  } catch (e) {
    resultArea.innerHTML = `<div class="error">读取失败：${e.message}</div>`;
  } finally {
    btnRead.textContent = '读取当前页面';
    btnRead.disabled = false;
  }
});

function renderResults(data) {
  const { detection, students } = data;

  let html = '';

  // Detection result
  if (detection.isRecord) {
    html += `<div class="status status-ok">
      <span class="badge badge-success">销课记录页</span>
      匹配关键词：${detection.foundKeywords.join('、')}
    </div>`;
  } else {
    html += `<div class="status status-info">
      <span class="badge badge-warn">未识别为销课记录页</span>
      ${detection.foundKeywords.length > 0 ? `仅匹配：${detection.foundKeywords.join('、')}` : '未匹配任何关键词'}
    </div>`;
    html += `<details style="margin-top:6px"><summary style="font-size:11px;color:#999;cursor:pointer">页面文本预览（前300字）</summary>
      <div style="margin-top:4px;padding:8px;background:#fff;border-radius:4px;font-size:11px;max-height:100px;overflow:auto;white-space:pre-wrap;color:#666;word-break:break-all">${escapeHtml(detection.textPreview)}</div>
    </details>`;
  }

  // Student count
  html += `<div class="summary" style="margin-top:10px">
    可点击操作元素：${students.actionCount} 个 · 识别学生行：${students.rows.length} 个
  </div>`;

  // Student list
  if (students.rows.length > 0) {
    for (const row of students.rows) {
      html += `<div class="student-card">
        <div class="name">${escapeHtml(row.studentName || '(未识别名字)')}</div>
        <div class="meta">
          ${row.courseName ? '课程：' + escapeHtml(row.courseName) : ''}
          ${row.classTime ? (row.courseName ? ' · ' : '') + row.classTime : ''}
        </div>
        <div class="actions">
          ${row.actions.homework ? '<span class="action-tag">课后</span>' : ''}
          ${row.actions.report ? '<span class="action-tag">报告</span>' : ''}
          ${row.actions.simpleSentence ? '<span class="action-tag">极简造句</span>' : ''}
          ${row.actions.reviewPaper ? '<span class="action-tag">抗遗忘试卷</span>' : ''}
          ${row.rawOps?.length ? '<span style="font-size:10px;color:#bbb;margin-left:4px">' + row.rawOps.join(' · ') + '</span>' : ''}
        </div>
      </div>`;
    }
  } else if (detection.isRecord) {
    html += '<div class="status status-info">未识别到学生行，请确认已进入销课记录页。</div>';
  }

  resultArea.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Send to Tutor ----
btnSend.addEventListener('click', async () => {
  if (!lastPageData) return;

  btnSend.textContent = '发送中...';
  btnSend.disabled = true;

  try {
    const payload = {
      source: 'smart-english-extension',
      type: 'record-page',
      importedAt: new Date().toISOString(),
      page: {
        title: lastPageData.title,
        url: lastPageData.url,
      },
      students: lastPageData.students.rows.map((row) => ({
        studentName: row.studentName,
        courseName: row.courseName,
        classTime: row.classTime,
        actions: {
          homework: !!row.actions.homework,
          report: !!row.actions.report,
          simpleSentence: !!row.actions.simpleSentence,
          reviewPaper: !!row.actions.reviewPaper,
        },
      })),
    };

    // Send to background for relay
    await chrome.runtime.sendMessage({
      action: 'sendToTutor',
      payload,
    });

    // Show success
    resultArea.insertAdjacentHTML('afterbegin',
      '<div class="status status-ok" style="margin-bottom:8px">已发送到 Tutor 网站！请切换到 http://localhost:3000 查看。</div>'
    );
  } catch (e) {
    resultArea.insertAdjacentHTML('afterbegin',
      `<div class="error">发送失败：${e.message}</div>`
    );
  } finally {
    btnSend.textContent = '发送到 Tutor';
    btnSend.disabled = false;
  }
});
