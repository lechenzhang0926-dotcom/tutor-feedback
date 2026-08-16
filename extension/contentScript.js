// ============================================================
// Tutor 课后反馈助手 — Content Script
// 在智能英语系统页面中运行，读取销课记录页数据
// ============================================================

const ACTION_KEYWORDS = ['课后', '报告', 'AI阅读', '极简造句', '抗遗忘试卷', '抗遗忘'];

/**
 * 检测当前页面是否为销课记录页
 */
function detectRecordPage() {
  const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ');
  const keywords = ['销课记录', '学员姓名', '课程名称', '销课时间', '课后', '报告'];
  const found = keywords.filter((kw) => bodyText.includes(kw));
  return { isRecord: found.length >= 3, foundKeywords: found, textPreview: bodyText.slice(0, 300) };
}

/**
 * 按学生行解析页面内容
 */
function parseStudentRows() {
  const rows = [];
  const seen = new Set();

  // Step 1: 找到所有操作关键词元素
  const actionEls = [];

  // 显式交互元素
  document.querySelectorAll('button, a[href], [role="button"], [onclick], input[type="button"], input[type="submit"]').forEach((el) => {
    const text = (el.textContent || '').trim().slice(0, 80);
    if (!text) return;
    const matches = ACTION_KEYWORDS.some((kw) => text === kw || text.startsWith(kw));
    if (!matches) return;
    seen.add(el);
    actionEls.push({ el, text: text.slice(0, 20), tag: el.tagName.toLowerCase() });
  });

  // cursor:pointer 元素中匹配操作关键词
  document.querySelectorAll('*').forEach((el) => {
    if (seen.has(el)) return;
    const ownText = (el.innerText || el.textContent || '').trim();
    if (ownText.length > 200) return;
    const style = getComputedStyle(el);
    const hasClick = !!el.onclick || el.hasAttribute('onclick');
    if (style.cursor !== 'pointer' && !hasClick) return;
    const text = ownText.slice(0, 80);
    if (!text) return;
    const matches = ACTION_KEYWORDS.some((kw) => text === kw || text.startsWith(kw));
    if (!matches) return;
    seen.add(el);
    actionEls.push({ el, text: text.slice(0, 20), tag: el.tagName.toLowerCase() });
  });

  if (actionEls.length === 0) return { rows, actionCount: 0 };

  // Step 2: 按行容器分组
  const containerMap = new Map();

  for (const ae of actionEls) {
    let container = ae.el;
    for (let i = 0; i < 10 && container; i++) {
      const tag = container.tagName.toLowerCase();
      const cls = (container.className && typeof container.className === 'string') ? container.className : '';
      const rect = container.getBoundingClientRect();
      const isRow = tag === 'tr' || tag === 'li' ||
        cls.includes('row') || cls.includes('item') || cls.includes('record') || cls.includes('list') ||
        (container.children.length >= 3 && rect.height > 40 && rect.height < 300);

      if (isRow && container.children.length >= 2) break;
      container = container.parentElement;
    }

    if (!container) continue;

    const existing = containerMap.get(container);
    if (existing) {
      existing.ops.push({ text: ae.text, tag: ae.tag });
    } else {
      containerMap.set(container, [{ text: ae.text, tag: ae.tag }]);
    }
  }

  // Step 3: 按垂直位置排序，提取学生信息
  const sorted = Array.from(containerMap.entries())
    .sort((a, b) => a[0].getBoundingClientRect().top - b[0].getBoundingClientRect().top);

  for (const [container, ops] of sorted) {
    const cText = (container.textContent || '').trim();

    // 提取学生名字
    let studentName = '';
    const nameM1 = cText.match(/(?:学员|学生|姓名)[：:\s]*([一-鿿]{2,4}(?:[·一-鿿]{1,4})?)/);
    const nameM2 = cText.match(/([一-鿿]{2,4}(?:[·一-鿿]{1,4})?)\s*(?:的|同学|学员)?(?:\s|$)/);
    studentName = nameM1?.[1] || nameM2?.[1] || '';

    // 提取课程名称
    const courseM = cText.match(/([^\s]{2,40}?(?:版|年级|英语|数学|语文|物理|化学|课程|教材)[^\s]{0,30})/);

    // 提取时间
    const timeM = cText.match(/(\d{2,4}[-/]\d{2}[-/]\d{2})?\s*(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})/);
    const timeM2 = cText.match(/(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})/);
    const time = timeM?.[0] || (timeM2 ? timeM2[0] : '');

    // 去重操作
    const seenOps = new Set();
    const uniqueOps = ops.filter((op) => {
      const key = op.text;
      if (seenOps.has(key)) return false;
      seenOps.add(key);
      return true;
    });

    // 检查各种操作是否存在
    const opTexts = uniqueOps.map((op) => op.text);
    const actions = {
      homework: opTexts.some((t) => t === '课后' || t.startsWith('课后')),
      report: opTexts.some((t) => t === '报告' || t.startsWith('报告')),
      simpleSentence: opTexts.some((t) => t === '极简造句' || t.startsWith('极简造句')),
      reviewPaper: opTexts.some((t) => t === '抗遗忘试卷' || t.startsWith('抗遗忘')),
    };

    rows.push({
      studentName,
      courseName: courseM?.[1] || '',
      classTime: time,
      actions,
      rawOps: uniqueOps.map((op) => op.text),
    });
  }

  return { rows, actionCount: actionEls.length };
}

// 导出供 popup 通过 executeScript 调用
if (typeof window !== 'undefined') {
  window.__tutorExtension = {
    detectRecordPage,
    parseStudentRows,
  };
}
