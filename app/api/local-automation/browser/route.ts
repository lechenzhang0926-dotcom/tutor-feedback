import { NextRequest, NextResponse } from 'next/server';
import { isBrowserOpen, openBrowser, closeBrowser, getCurrentPage, getContext } from '@/lib/playwrightBrowser';
import type { Page } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import * as os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

const TMP_DIR = path.join(os.tmpdir(), 'tutor-pdfs');
function ensureTmp() { if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true }); }

const ACTION_KEYWORDS = ['课后', '报告', 'AI阅读', '极简造句', '抗遗忘', '抗遗忘试卷', '打印', '下载', 'prints', 'print', 'download'];

// ============================================================
// Page type detection
// ============================================================
function detectPageType(text: string, url: string): string {
  if (/\/pc\/prints\?id=/.test(url)) return '课后作业1打印页';
  if (/教学详情/.test(text)) return '课后作业1打印页';
  if (/打印中英文/.test(text) && /打印英文/.test(text) && /打印中文/.test(text)) return '课后作业1打印页';
  if (/销课记录/.test(text) && /学员姓名|课程名称|销课时间|课后|报告/.test(text)) return '销课记录页';
  return '未知页面';
}

// ============================================================
// Enhanced element collection
// ============================================================
async function collectClickables(page: Page) {
  return page.evaluate((actionKeywords) => {
    const results: Array<{
      index: number;
      tag: string;
      text: string;
      className: string;
      id: string;
      href: string;
      hasOnClick: boolean;
      parentOnClick: boolean;
      parentTag: string;
    }> = [];

    const seen = new Set<Element>();

    // ---- Pass 1: Explicit interactive elements ----
    const explicit = document.querySelectorAll(
      'button, a[href], [role="button"], [onclick], input[type="button"], input[type="submit"], input[type="reset"]'
    );
    explicit.forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const text = (el.textContent || '').trim().slice(0, 80);
      if (!text) return;
      results.push({
        index: results.length,
        tag: el.tagName.toLowerCase(),
        text,
        className: (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : '',
        id: el.id || '',
        href: (el as HTMLAnchorElement).href || '',
        hasOnClick: !!(el as HTMLElement).onclick || el.hasAttribute('onclick'),
        parentOnClick: false,
        parentTag: '',
      });
    });

    // ---- Pass 2: cursor:pointer elements with action keywords ----
    const allElements = document.querySelectorAll('*');
    allElements.forEach((el) => {
      if (seen.has(el)) return;
      // Skip huge containers
      const ownText = ((el as HTMLElement).innerText || el.textContent || '').trim();
      if (ownText.length > 200) return;

      const style = getComputedStyle(el);
      if (style.cursor !== 'pointer' && !(el as HTMLElement).onclick) return;

      const text = ownText.slice(0, 80);
      if (!text) return;

      // Check if this element or its text matches an action keyword
      const hasKeyword = actionKeywords.some((kw: string) => text.includes(kw));
      if (!hasKeyword) return;

      seen.add(el);

      // Walk up to 5 parent levels to find onclick
      let parentOnClick = false;
      let parentTag = '';
      let p: Element | null = el.parentElement;
      for (let i = 0; i < 5 && p; i++) {
        if ((p as HTMLElement).onclick || p.hasAttribute('onclick')) {
          parentOnClick = true;
          parentTag = p.tagName.toLowerCase();
          break;
        }
        p = p.parentElement;
      }

      results.push({
        index: results.length,
        tag: el.tagName.toLowerCase(),
        text,
        className: (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : '',
        id: el.id || '',
        href: (el as HTMLAnchorElement).href || '',
        hasOnClick: !!(el as HTMLElement).onclick || el.hasAttribute('onclick'),
        parentOnClick,
        parentTag,
      });
    });

    return results;
  }, ACTION_KEYWORDS);
}

// ============================================================
// Student row parsing — single pass, sets data-tutor-row for precise clicking
// ============================================================
async function parseStudentRows(page: Page) {
  return page.evaluate((actionKeywords) => {
    const rows: Array<{
      rowIndex: number;
      studentName: string;
      courseName: string;
      time: string;
      operations: Array<{ text: string; tag: string }>;
    }> = [];

    // Clear old markers
    document.querySelectorAll('[data-tutor-row]').forEach((el) => el.removeAttribute('data-tutor-row'));

    // Step 1: Find all action elements
    const actionEls: Array<{ el: Element; text: string; tag: string }> = [];
    const seen = new Set<Element>();

    // Explicit interactive elements
    document.querySelectorAll('button, a[href], [role="button"], [onclick], input[type="button"], input[type="submit"]').forEach((el) => {
      const text = (el.textContent || '').trim().slice(0, 80);
      if (!text) return;
      const matchesAction = actionKeywords.some((kw: string) => text === kw || text.startsWith(kw));
      if (!matchesAction) return;
      seen.add(el);
      actionEls.push({ el, text: text.slice(0, 20), tag: el.tagName.toLowerCase() });
    });

    // cursor:pointer elements with action keywords
    document.querySelectorAll('*').forEach((el) => {
      if (seen.has(el)) return;
      const ownText = ((el as HTMLElement).innerText || el.textContent || '').trim();
      if (ownText.length > 200) return;
      const style = getComputedStyle(el);
      const hasOnClick = !!(el as HTMLElement).onclick || el.hasAttribute('onclick');
      if (style.cursor !== 'pointer' && !hasOnClick) return;
      const text = ownText.slice(0, 80);
      if (!text) return;
      const matchesAction = actionKeywords.some((kw: string) => text === kw || text.startsWith(kw));
      if (!matchesAction) return;
      seen.add(el);
      actionEls.push({ el, text: text.slice(0, 20), tag: el.tagName.toLowerCase() });
    });

    if (actionEls.length === 0) return rows;

    // Step 2: Group by row container
    const containerMap = new Map<Element, Array<{ text: string; tag: string }>>();

    for (const ae of actionEls) {
      let container: Element | null = ae.el;
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
        existing.push({ text: ae.text, tag: ae.tag });
      } else {
        containerMap.set(container, [{ text: ae.text, tag: ae.tag }]);
      }
    }

    // Step 3: Build result, sorted by vertical position
    const sorted = Array.from(containerMap.entries())
      .sort((a, b) => a[0].getBoundingClientRect().top - b[0].getBoundingClientRect().top);

    let rowIdx = 0;
    for (const [container, ops] of sorted) {
      // Mark container for precise click targeting
      container.setAttribute('data-tutor-row', String(rowIdx));

      const cText = (container.textContent || '').trim();

      // Student name
      let studentName = '';
      const nameM1 = cText.match(/(?:学员|学生|姓名)[：:\s]*([一-龥]{2,4}(?:[·一-龥]{1,4})?)/);
      const nameM2 = cText.match(/([一-龥]{2,4}(?:[·一-龥]{1,4})?)\s*(?:的|同学|学员)?(?:\s|$)/);
      studentName = nameM1?.[1] || nameM2?.[1] || '';

      // Course name
      const courseM = cText.match(/([^\s]{2,40}?(?:版|年级|英语|数学|语文|物理|化学|课程|教材)[^\s]{0,30})/);

      // Time: HH:MM - HH:MM
      const timeM = cText.match(/(\d{2,4}[-/]\d{2}[-/]\d{2})?\s*(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})/);
      const timeM2 = cText.match(/(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})/);
      const time = timeM?.[0] || (timeM2 ? timeM2[0] : '');

      // Deduplicate operations by text
      const seenOps = new Set<string>();
      const uniqueOps = ops.filter((op) => {
        const key = op.text;
        if (seenOps.has(key)) return false;
        seenOps.add(key);
        return true;
      });

      rows.push({
        rowIndex: rowIdx,
        studentName,
        courseName: courseM?.[1] || '',
        time,
        operations: uniqueOps,
      });

      rowIdx++;
    }

    return rows;
  }, ACTION_KEYWORDS);
}

// ============================================================
// Click an action inside a specific student row (by data-tutor-row)
// ============================================================
async function clickInStudentRow(page: Page, rowIndex: number, actionName: string): Promise<boolean> {
  return page.evaluate(({ rowIndex, actionName }) => {
    const container = document.querySelector(`[data-tutor-row="${rowIndex}"]`);
    if (!container) return false;

    // Find clickable element with matching text within this container
    // Check from smallest/innermost elements first
    const all = Array.from(container.querySelectorAll('button, a, [role="button"], [onclick], span, div, td, li'));
    let bestEl: Element | null = null;
    let bestScore = Infinity;

    for (const el of all) {
      const ownText = ((el as HTMLElement).innerText || el.textContent || '').trim();
      // Prefer exact match
      if (ownText === actionName) {
        (el as HTMLElement).click();
        return true;
      }
      // Also accept prefix match (e.g., "课后" matches "课后 (新页面)")
      if (ownText.startsWith(actionName)) {
        const len = ownText.length;
        if (len < bestScore) {
          bestScore = len;
          bestEl = el;
        }
      }
    }

    if (bestEl) {
      (bestEl as HTMLElement).click();
      return true;
    }

    // Fallback: broader search
    for (const el of all) {
      const text = (el.textContent || '').trim();
      if (text.includes(actionName) && text.length < 100) {
        (el as HTMLElement).click();
        return true;
      }
    }

    return false;
  }, { rowIndex, actionName });
}

// ============================================================
// Read page content
// ============================================================
async function readPageContent(page: Page) {
  const url = page.url();
  const title = await page.title();
  const bodyText = (await page.locator('body').textContent()) || '';
  const cleanText = bodyText.replace(/\s+/g, ' ').trim();

  const pageType = detectPageType(cleanText, url);

  // Links
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      href: (a as HTMLAnchorElement).href,
      text: (a.textContent || '').trim().slice(0, 80),
    }))
  );
  const pdfLinks = links.filter((l) => /\.pdf(\?.*)?$/i.test(l.href));
  const printLinks = links.filter((l) => /prints|review-cycle-paper|simple/i.test(l.href));

  // Clickables
  const clickables = await collectClickables(page);

  // Student rows
  let studentRows: any[] = [];
  let studentName = '';
  let printDate = '';

  if (pageType === '销课记录页') {
    studentRows = await parseStudentRows(page);
  }

  // Extract name/date from page text
  const nameMatch = cleanText.match(/学生[：:]\s*(\S+)/);
  if (nameMatch) studentName = nameMatch[1];

  const dateMatch = cleanText.match(/打印时间[：:]\s*(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const d = new Date(dateMatch[1]);
    printDate = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  // iframes
  const frames = page.frames();
  const iframeData: Array<{ url: string; text: string }> = [];
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    try {
      const t = (await frame.locator('body').textContent().catch(() => '')) || '';
      iframeData.push({ url: frame.url(), text: t.replace(/\s+/g, ' ').trim().slice(0, 300) });
    } catch {}
  }

  // Print buttons
  const printButtonNames = ['打印中英文', '打印英文', '打印中文', '打印音标'];
  const foundPrintBtns = clickables.filter((c) => printButtonNames.some((n) => c.text.includes(n)));

  return {
    url, title, pageType,
    textPreview: cleanText.slice(0, 1000),
    allLinksCount: links.length,
    pdfLinks: pdfLinks.slice(0, 20),
    pdfCount: pdfLinks.length,
    printLinks: printLinks.slice(0, 20),
    clickables: clickables.slice(0, 80),
    clickablesCount: clickables.length,
    studentRows,
    studentName,
    printDate,
    hasPrintButtons: foundPrintBtns.length >= 2,
    printButtonNames: foundPrintBtns.map((b) => b.text),
    iframes: iframeData,
    iframeCount: iframeData.length,
  };
}

// ============================================================
// Generate PDFs from print page (kept but not main focus now)
// ============================================================
async function generatePrintPdfs(page: Page, studentName: string, dateStr: string) {
  const sessionId = Date.now().toString();
  const sessionDir = path.join(TMP_DIR, sessionId);
  mkdirSync(sessionDir, { recursive: true });

  const buttons = [
    { label: '中英文', filename: `${studentName}-${dateStr}-中英文.pdf`, btnText: '打印中英文' },
    { label: '英文', filename: `${studentName}-${dateStr}-英文.pdf`, btnText: '打印英文' },
    { label: '中文', filename: `${studentName}-${dateStr}-中文.pdf`, btnText: '打印中文' },
    { label: '音标', filename: `${studentName}-${dateStr}-音标.pdf`, btnText: '打印音标' },
  ];

  const results: Array<{ label: string; success: boolean; filename: string; error?: string }> = [];

  for (const btn of buttons) {
    try {
      await page.locator('*').filter({ hasText: btn.btnText }).first().click({ timeout: 3000 }).catch(() => {
        page.locator(`text="${btn.btnText}"`).first().click({ timeout: 3000 }).catch(() => {});
      });
      await page.waitForTimeout(800);

      const filePath = path.join(sessionDir, btn.filename);
      await page.pdf({ path: filePath, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }, preferCSSPageSize: true });
      results.push({ label: btn.label, success: true, filename: btn.filename });
    } catch (err) {
      results.push({ label: btn.label, success: false, filename: btn.filename, error: err instanceof Error ? err.message : '生成失败' });
    }
  }

  let zipFilename = '';
  try {
    zipFilename = `${studentName}-${dateStr}-课后作业1.zip`;
    const zipPath = path.join(sessionDir, zipFilename);
    const zip = new AdmZip();
    for (const r of results) { if (r.success) zip.addLocalFile(path.join(sessionDir, r.filename)); }
    zip.writeZip(zipPath);
  } catch {}

  return { sessionId, results, zipFilename };
}

// ============================================================
// API handlers
// ============================================================

export async function GET() {
  try { return NextResponse.json({ open: await isBrowserOpen() }); }
  catch { return NextResponse.json({ open: false }); }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action, systemUrl, buttonIndex, studentName: manualName, date: manualDate } = body;

  // ------ open ------
  if (action === 'open') {
    if (!systemUrl) return NextResponse.json({ error: '请提供系统URL' }, { status: 400 });
    try { await openBrowser(systemUrl); return NextResponse.json({ success: true }); }
    catch (err: any) { return NextResponse.json({ error: err.message?.includes('Timeout') ? '页面加载超时' : `启动失败：${err.message}` }, { status: 500 }); }
  }

  // ------ close ------
  if (action === 'close') { await closeBrowser(); return NextResponse.json({ success: true }); }

  // ------ read ------
  if (action === 'read') {
    if (!(await isBrowserOpen())) return NextResponse.json({ error: '请先打开英语系统浏览器' }, { status: 400 });
    try {
      const page = await getCurrentPage();
      if (!page) return NextResponse.json({ error: '浏览器中没有打开的页面' }, { status: 400 });
      if (page.url() === 'about:blank') return NextResponse.json({ error: '页面为空，请先导航到目标页面' }, { status: 400 });
      return NextResponse.json(await readPageContent(page));
    } catch (err: any) {
      return NextResponse.json({ error: `读取失败：${err.message}` }, { status: 500 });
    }
  }

  // ------ click-auto (row-targeted: click → detect → PDF/report) ------
  if (action === 'click-auto') {
    const { rowIndex, actionName, studentName: manualName, expectedResultType } = body;
    if (rowIndex === undefined || !actionName) return NextResponse.json({ error: '请指定 rowIndex 和 actionName' }, { status: 400 });
    if (!(await isBrowserOpen())) return NextResponse.json({ error: '请先打开英语系统浏览器' }, { status: 400 });
    try {
      const page = await getCurrentPage();
      if (!page) return NextResponse.json({ error: '浏览器中没有打开的页面' }, { status: 400 });
      const ctx = await getContext();
      if (!ctx) return NextResponse.json({ error: '浏览器上下文已丢失' }, { status: 500 });

      const preUrl = page.url();

      // Use clickMemory hint to adjust timeout and listener strategy
      const expectPopup = expectedResultType === 'new-page-homework1' || expectedResultType === 'new-page-review-paper' || expectedResultType === 'new-page-simple';
      const expectSamePageReport = expectedResultType === 'same-page-report';
      const popupTimeout = expectPopup ? 15000 : 5000;

      // Listen for popup/download BEFORE clicking
      const popupPromise = expectSamePageReport ? Promise.resolve(null) : ctx.waitForEvent('page', { timeout: popupTimeout }).catch(() => null);
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      // For report actions, start network capture before clicking
      const preNetworkResponses: Array<{ url: string; status: number; contentType: string; bodyPreview: string }> = [];
      let onPreResp: ((res: any) => void) | null = null;
      if (expectSamePageReport) {
        onPreResp = async (res: any) => {
          const ct = (res.headers()?.['content-type'] || '').toLowerCase();
          if (/json|text|html/.test(ct)) {
            try { preNetworkResponses.push({ url: res.url(), status: res.status(), contentType: ct, bodyPreview: (await res.text()).slice(0, 1000) }); } catch {}
          }
        };
        page.on('response', onPreResp);
      }

      // Click inside the specific student row
      const clicked = await clickInStudentRow(page, rowIndex, actionName);
      if (!clicked) {
        if (onPreResp) page.off('response', onPreResp);
        // Fallback: try finding by text on the whole page
        try { await page.locator('*').filter({ hasText: actionName }).first().click({ timeout: 3000 }); }
        catch { return NextResponse.json({ error: `在行 ${rowIndex} 中未找到"${actionName}"按钮` }, { status: 400 }); }
      }

      const waitMs = expectSamePageReport ? 5000 : 3000;
      await page.waitForTimeout(waitMs);

      if (onPreResp) page.off('response', onPreResp);

      const postUrl = page.url();
      const popup = await popupPromise;
      const download = await downloadPromise;

      let activePage = page;
      if (popup) { await popup.waitForLoadState('domcontentloaded').catch(() => {}); activePage = popup; }

      const activeUrl = activePage.url();
      const urlChanged = activeUrl !== preUrl || !!popup;
      const activeText = ((await activePage.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

      // Handle download directly
      if (download) {
        ensureTmp();
        await download.saveAs(path.join(TMP_DIR, download.suggestedFilename())).catch(() => {});
        return NextResponse.json({ rowIndex, action: actionName, resultType: 'download', downloadFilename: download.suggestedFilename(), downloadUrl: download.url(), success: true });
      }

      // Classify new page (flexible URL matching)
      const isPrints = /\/pc\/prints/.test(activeUrl) && !/review-cycle-paper/i.test(activeUrl) && !/simple/i.test(activeUrl);
      const isReview = /review-cycle-paper/i.test(activeUrl) || /\/pc\/prints\/review/i.test(activeUrl) || /抗遗忘试卷|复习日期|遗忘词数/.test(activeText);
      const isSimple = /\/pc\/prints\/simple/i.test(activeUrl) || /极简造句|造句/.test(activeText);
      const isHwPrint = isPrints || (/打印中英文/.test(activeText) && /打印英文/.test(activeText) && /打印中文/.test(activeText));

      // Extract student name and date (Beijing time)
      let stuName = manualName || '';
      let stuDate = '';

      // Try extracting from page text first
      const nm = activeText.match(/学生[：:]\s*(\S+)/); if (nm && !stuName) stuName = nm[1];
      const dm = activeText.match(/打印时间[：:]\s*(\d{4}-\d{2}-\d{2})/);
      if (dm) { const d = new Date(dm[1]); stuDate = `${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; }

      // Fallback to user-provided date, or today (Beijing time)
      if (!stuDate) stuDate = body.date || '';
      if (!stuDate) {
        const now = new Date();
        const beijing = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
        stuDate = `${String(beijing.getMonth()+1).padStart(2,'0')}${String(beijing.getDate()).padStart(2,'0')}`;
      }

      // Only name is strictly required; date defaults to today
      const MISSING_NAME = !stuName;

      // Case 1: 课后作业1打印页
      if (isHwPrint && urlChanged) {
        if (MISSING_NAME) return NextResponse.json({ rowIndex, action: actionName, resultType: 'homework1-print', url: activeUrl, studentName: stuName, printDate: stuDate, needsInput: true });
        const gen = await generatePrintPdfs(activePage, stuName, stuDate);
        return NextResponse.json({ rowIndex, action: actionName, resultType: 'homework1-print', url: activeUrl, studentName: stuName, printDate: stuDate, success: true, pdfResults: gen.results, zipFilename: gen.zipFilename, downloadUrl: `/api/download-pdf?session=${gen.sessionId}&name=${encodeURIComponent(gen.zipFilename)}` });
      }

      // Case 2: 抗遗忘试卷
      if (isReview && urlChanged) {
        if (MISSING_NAME) return NextResponse.json({ rowIndex, action: actionName, resultType: 'review-paper', url: activeUrl, studentName: stuName, printDate: stuDate, needsInput: true });
        const sid = Date.now().toString(); const sdir = path.join(TMP_DIR, sid); mkdirSync(sdir, { recursive: true });
        const fn = `${stuName}-${stuDate}-抗遗忘试卷.pdf`;
        await activePage.pdf({ path: path.join(sdir, fn), format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }, preferCSSPageSize: true });
        return NextResponse.json({ rowIndex, action: actionName, resultType: 'review-paper', url: activeUrl, studentName: stuName, printDate: stuDate, success: true, pdfFilename: fn, downloadUrl: `/api/download-pdf?session=${sid}&name=${encodeURIComponent(fn)}` });
      }

      // Case 3: 极简造句
      if (isSimple && urlChanged) {
        if (MISSING_NAME) return NextResponse.json({ rowIndex, action: actionName, resultType: 'simple-sentence', url: activeUrl, studentName: stuName, printDate: stuDate, needsInput: true });
        const sid = Date.now().toString(); const sdir = path.join(TMP_DIR, sid); mkdirSync(sdir, { recursive: true });
        const fn = `${stuName}-${stuDate}-极简造句.pdf`;
        await activePage.pdf({ path: path.join(sdir, fn), format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }, preferCSSPageSize: true });
        return NextResponse.json({ rowIndex, action: actionName, resultType: 'simple-sentence', url: activeUrl, studentName: stuName, printDate: stuDate, success: true, pdfFilename: fn, downloadUrl: `/api/download-pdf?session=${sid}&name=${encodeURIComponent(fn)}` });
      }

      // Case 4: URL changed but unknown
      if (urlChanged) return NextResponse.json({ rowIndex, action: actionName, resultType: 'new-page-unknown', url: activeUrl, title: await activePage.title().catch(() => ''), textPreview: activeText.slice(0, 500) });

      // Case 5: No URL change → report mode
      // If we pre-captured responses, use those. Otherwise capture now.
      let responses = preNetworkResponses;
      if (responses.length === 0) {
        const onResp = async (res: any) => {
          const ct = (res.headers()?.['content-type'] || '').toLowerCase();
          if (/json|text|html/.test(ct)) { try { responses.push({ url: res.url(), status: res.status(), contentType: ct, bodyPreview: (await res.text()).slice(0, 1000) }); } catch {} }
        };
        page.on('response', onResp);
        await page.waitForTimeout(3000);
        page.off('response', onResp);
      }

      const finalText = ((await page.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const domChanged = activeText !== finalText || preNetworkResponses.length > 0;

      return NextResponse.json({ rowIndex, action: actionName, resultType: 'same-page-report', urlChanged: false, popupOpened: false, domChanged, textPreview: finalText.slice(0, 1500), networkResponses: responses.slice(0, 20), studentName: stuName });

    } catch (err: any) {
      return NextResponse.json({ error: `操作失败：${err.message}` }, { status: 500 });
    }
  }

  // ------ click-report (report verification, row-targeted) ------
  if (action === 'click-report') {
    const { rowIndex, actionName, studentName: manualName } = body;
    if (rowIndex === undefined || !actionName) return NextResponse.json({ error: '请指定 rowIndex 和 actionName' }, { status: 400 });
    if (!(await isBrowserOpen())) return NextResponse.json({ error: '请先打开英语系统浏览器' }, { status: 400 });
    try {
      const page = await getCurrentPage();
      if (!page) return NextResponse.json({ error: '浏览器中没有打开的页面' }, { status: 400 });
      const ctx = await getContext();
      if (!ctx) return NextResponse.json({ error: '浏览器上下文已丢失' }, { status: 500 });

      const preUrl = page.url();
      const preBody = ((await page.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

      // Capture network
      const capturedUrls: string[] = [];
      const capturedResponses: Array<{ url: string; status: number; contentType: string; bodyPreview: string }> = [];
      const onResp = async (res: any) => {
        const url = res.url();
        capturedUrls.push(url);
        const ct = (res.headers()?.['content-type'] || '').toLowerCase();
        if (/json|text|html/.test(ct)) {
          try { capturedResponses.push({ url, status: res.status(), contentType: ct, bodyPreview: (await res.text()).slice(0, 2000) }); } catch {}
        }
      };
      page.on('response', onResp);

      const popupPromise = ctx.waitForEvent('page', { timeout: 12000 }).catch(() => null);
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      // Click inside the specific student row
      const clicked = await clickInStudentRow(page, rowIndex, actionName);
      if (!clicked) {
        try { await page.locator('*').filter({ hasText: actionName }).first().click({ timeout: 3000 }); }
        catch { page.off('response', onResp); return NextResponse.json({ error: `在行 ${rowIndex} 中未找到"${actionName}"按钮` }, { status: 400 }); }
      }

      await page.waitForTimeout(2500);

      const popup = await popupPromise;
      const download = await downloadPromise;
      page.off('response', onResp);

      const postUrl = page.url();
      let activePage = page;
      if (popup) { await popup.waitForLoadState('domcontentloaded').catch(() => {}); activePage = popup; }

      const activeUrl = activePage.url();
      const urlChanged = activeUrl !== preUrl || !!popup;
      const activeText = ((await activePage.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const domChanged = activeText !== preBody;

      // Extract URL parameters
      const parseParams = (u: string): Record<string, string> => {
        const params: Record<string, string> = {};
        try { const sp = new URL(u).searchParams; sp.forEach((v, k) => params[k] = v); } catch {}
        return params;
      };

      // Priority-based report URL detection:
      // Level 1: h5/study.html (known report page)
      // Level 2: URL with id/userId/recordId/courseId params
      // Level 3: URL matching report/study/detail keywords
      const allCapturedUrls = [activeUrl, ...capturedUrls, ...capturedResponses.map((r) => r.url)];
      const reportUrls: string[] = [];
      const seenUrls = new Set<string>();

      // Priority 1
      for (const u of allCapturedUrls) {
        if (/\/h5\/study\.html/i.test(u) && !seenUrls.has(u)) {
          seenUrls.add(u);
          reportUrls.push(u);
        }
      }
      // Priority 2
      for (const u of allCapturedUrls) {
        if (!seenUrls.has(u)) {
          const p = parseParams(u);
          if (p.id || p.userId || p.recordId || p.courseId) {
            seenUrls.add(u);
            reportUrls.push(u);
          }
        }
      }
      // Priority 3
      for (const u of allCapturedUrls) {
        if (!seenUrls.has(u) && /report|study|detail|student/i.test(u)) {
          seenUrls.add(u);
          reportUrls.push(u);
        }
      }
      // If URL changed and new URL not yet captured
      if (urlChanged && !seenUrls.has(activeUrl)) {
        reportUrls.push(activeUrl);
      }

      // Extract parameters from all report URLs
      const allParams: Array<{ url: string; params: Record<string, string> }> = [];
      for (const ru of reportUrls) {
        const p = parseParams(ru);
        allParams.push({ url: ru, params: p });
      }

      // Determine primary report URL (best candidate for student-specific comparison)
      const primaryUrl = reportUrls.find((u) => /\/h5\/study\.html/i.test(u))
        || reportUrls.find((u) => { const p = parseParams(u); return p.id && p.userId; })
        || reportUrls[0];
      const primaryParams = primaryUrl ? parseParams(primaryUrl) : {};

      // Filter network responses to report-relevant only
      const reportResponses = capturedResponses.filter((r) =>
        /report|study|detail|learn-union/i.test(r.url) ||
        r.bodyPreview.includes('报告') || r.bodyPreview.includes('共识记') ||
        r.bodyPreview.includes('遗忘') || r.bodyPreview.includes('词汇')
      );
      if (urlChanged) {
        const pp = parseParams(activeUrl);
        if (Object.keys(pp).length > 0 && !allParams.find((a) => a.url === activeUrl)) {
          allParams.push({ url: activeUrl, params: pp });
        }
      }

      return NextResponse.json({
        studentName: manualName || '',
        actionName,
        rowIndex,
        success: true,
        urlChanged, popupOpened: !!popup, domChanged, downloadTriggered: !!download,
        preUrl, postUrl: activeUrl,
        pageTitle: await activePage.title().catch(() => ''),
        textPreview: activeText.slice(0, 1500),
        primaryUrl: primaryUrl || activeUrl,
        primaryParams,
        reportUrls,
        allParams,
        networkCount: capturedResponses.length,
        reportResponses: reportResponses.slice(0, 10),
        allResponses: capturedResponses.slice(0, 20),
        downloadFilename: download?.suggestedFilename() || null,
      });
    } catch (err: any) {
      return NextResponse.json({ error: `报告测试失败：${err.message}` }, { status: 500 });
    }
  }

  // ------ click-link (simplified URL capture) ------
  if (action === 'click-link') {
    if (buttonIndex === undefined) return NextResponse.json({ error: '请指定按钮序号' }, { status: 400 });
    if (!(await isBrowserOpen())) return NextResponse.json({ error: '请先打开英语系统浏览器' }, { status: 400 });
    try {
      const page = await getCurrentPage(); if (!page) return NextResponse.json({ error: '浏览器中没有打开的页面' }, { status: 400 });
      const ctx = await getContext(); if (!ctx) return NextResponse.json({ error: '浏览器上下文已丢失' }, { status: 500 });
      const els = await collectClickables(page); const target = els[buttonIndex];
      if (!target) return NextResponse.json({ error: `找不到序号 ${buttonIndex} 的元素` }, { status: 400 });
      const preUrl = page.url();
      const popupPromise = ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
      try { await page.locator('*').filter({ hasText: target.text }).first().click({ timeout: 3000 }); } catch { try { await page.locator('*').nth(buttonIndex).click({ timeout: 3000 }); } catch {} }
      await page.waitForTimeout(2500);
      const postUrl = page.url(); const popup = await popupPromise;
      let capturedUrl = ''; let capturedTitle = '';
      if (popup) { await popup.waitForLoadState('domcontentloaded').catch(() => {}); capturedUrl = popup.url(); capturedTitle = await popup.title().catch(() => ''); await popup.bringToFront().catch(() => {}); }
      else if (postUrl !== preUrl) capturedUrl = postUrl;
      let linkType = '';
      if (capturedUrl) {
        if (/\/pc\/prints\/review-cycle-paper/i.test(capturedUrl)) linkType = 'reviewPaper';
        else if (/\/pc\/prints\/simple/i.test(capturedUrl)) linkType = 'simpleSentence';
        else if (/\/pc\/prints/i.test(capturedUrl)) linkType = 'homework1';
        else if (/review-cycle-paper/i.test(capturedUrl)) linkType = 'reviewPaper';
        else if (/simple/i.test(capturedUrl)) linkType = 'simpleSentence';
        else if (/prints/i.test(capturedUrl)) linkType = 'homework1';
      }
      return NextResponse.json({ clicked: { index: buttonIndex, tag: target.tag, text: target.text }, capturedUrl, capturedTitle, linkType, urlChanged: postUrl !== preUrl, popupOpened: !!popup, success: !!capturedUrl });
    } catch (err: any) { return NextResponse.json({ error: `点击失败：${err.message}` }, { status: 500 }); }
  }

  // ------ click ------
  if (action === 'click') {
    if (buttonIndex === undefined) return NextResponse.json({ error: '请指定按钮序号' }, { status: 400 });
    if (!(await isBrowserOpen())) return NextResponse.json({ error: '请先打开英语系统浏览器' }, { status: 400 });

    try {
      const page = await getCurrentPage();
      if (!page) return NextResponse.json({ error: '浏览器中没有打开的页面' }, { status: 400 });
      const ctx = await getContext();
      if (!ctx) return NextResponse.json({ error: '浏览器上下文已丢失' }, { status: 500 });

      // Re-collect to find the target element by index
      const els = await collectClickables(page);
      const target = els[buttonIndex];
      if (!target) return NextResponse.json({ error: `找不到序号 ${buttonIndex} 的元素` }, { status: 400 });

      const preUrl = page.url();

      const result: any = {
        clicked: { index: buttonIndex, tag: target.tag, text: target.text },
        preUrl,
        urlChanged: false, newUrl: null,
        downloadUrl: null, downloadFilename: null,
        popupOpened: false, popupUrl: null, popupTitle: null,
        newPageType: null, newClickablesCount: 0,
        afterText: null, afterTitle: null,
        newLinks: [],
        error: null,
      };

      const downloadPromise = page.waitForEvent('download', { timeout: 6000 }).catch(() => null);
      const popupPromise = ctx.waitForEvent('page', { timeout: 6000 }).catch(() => null);

      // Click via nth matching the index-based approach
      let clicked = false;
      try {
        // Try to find the element by text among visible elements
        const el = page.locator('*').filter({ hasText: target.text }).first();
        await el.click({ timeout: 3000 });
        clicked = true;
      } catch {}

      if (!clicked) {
        try {
          // Fallback: use nth() with the element's index
          await page.locator('*').nth(buttonIndex).click({ timeout: 3000 });
          clicked = true;
        } catch {}
      }

      if (!clicked) {
        result.error = '无法点击目标元素，请在 Chromium 中手动点击';
      }

      await page.waitForTimeout(2000);

      // --- Check results ---

      // 1. URL change
      const postUrl = page.url();
      result.newUrl = postUrl;
      if (postUrl !== preUrl) result.urlChanged = true;

      // 2. Download
      const download = await downloadPromise;
      if (download) {
        result.downloadUrl = download.url();
        result.downloadFilename = download.suggestedFilename();
        try {
          ensureTmp();
          await download.saveAs(path.join(TMP_DIR, download.suggestedFilename()));
        } catch {}
      }

      // 3. Popup
      const popup = await popupPromise;
      if (popup) {
        result.popupOpened = true;
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        result.popupUrl = popup.url();
        result.popupTitle = await popup.title().catch(() => '');
        try {
          result.newLinks = await popup.evaluate(() =>
            Array.from(document.querySelectorAll('a[href]')).map((a) => ({
              href: (a as HTMLAnchorElement).href,
              text: (a.textContent || '').trim().slice(0, 60),
            }))
          );
        } catch {}
      }

      // 4. Re-read current page state (even if URL didn't change)
      try {
        result.afterTitle = await page.title();
        const afterBody = (await page.locator('body').textContent()) || '';
        result.afterText = afterBody.replace(/\s+/g, ' ').trim().slice(0, 1000);
        result.newPageType = detectPageType(result.afterText, postUrl);

        // Re-collect clickables after the action
        const afterClickables = await collectClickables(page);
        result.newClickablesCount = afterClickables.length;

        // New PDF links
        const afterLinks = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]')).map((a) => ({
            href: (a as HTMLAnchorElement).href,
            text: (a.textContent || '').trim().slice(0, 60),
          }))
        );
        result.newPdfLinks = afterLinks.filter((l: any) => /\.pdf(\?.*)?$/i.test(l.href)).slice(0, 10);
        result.newPrintLinks = afterLinks.filter((l: any) => /prints|review-cycle-paper|simple/i.test(l.href)).slice(0, 10);
      } catch {}

      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json({ error: `点击失败：${err.message}` }, { status: 500 });
    }
  }

  // ------ generate-pdfs ------
  if (action === 'generate-pdfs') {
    if (!(await isBrowserOpen())) return NextResponse.json({ error: '请先打开英语系统浏览器' }, { status: 400 });
    try {
      const page = await getCurrentPage();
      if (!page) return NextResponse.json({ error: '浏览器中没有打开的页面' }, { status: 400 });
      const pageData = await readPageContent(page);
      const sName = manualName || pageData.studentName || '';
      const sDate = manualDate || pageData.printDate || '';
      if (!sName) return NextResponse.json({ error: '未能识别学生名字，请手动输入' }, { status: 400 });
      if (!sDate) return NextResponse.json({ error: '未能识别日期，请手动输入（格式：MMDD）' }, { status: 400 });

      const genResult = await generatePrintPdfs(page, sName, sDate);
      return NextResponse.json({ ...genResult, downloadUrl: `/api/download-pdf?session=${genResult.sessionId}&name=${encodeURIComponent(genResult.zipFilename)}` });
    } catch (err: any) {
      return NextResponse.json({ error: `PDF生成失败：${err.message}` }, { status: 500 });
    }
  }

  // ------ monitor ------
  if (action === 'monitor') {
    if (!(await isBrowserOpen())) return NextResponse.json({ error: '请先打开英语系统浏览器' }, { status: 400 });
    try {
      const page = await getCurrentPage();
      if (!page) return NextResponse.json({ error: '浏览器中没有打开的页面' }, { status: 400 });
      const ctx = await getContext();
      if (!ctx) return NextResponse.json({ error: '浏览器上下文已丢失' }, { status: 500 });

      const preBody = (await page.locator('body').textContent().catch(() => '')) || '';
      const preUrl = page.url();

      const requests: Array<{ url: string; method: string; timestamp: number }> = [];
      const responses: Array<{ url: string; status: number; contentType: string; bodyPreview: string; timestamp: number }> = [];
      let popupData: any = null;
      let downloadData: any = null;

      const onRequest = (req: any) => {
        requests.push({ url: req.url(), method: req.method(), timestamp: Date.now() });
      };

      const onResponse = async (res: any) => {
        const entry: any = { url: res.url(), status: res.status(), contentType: '', bodyPreview: '', timestamp: Date.now() };
        try { entry.contentType = res.headers()['content-type'] || ''; } catch {}
        if (entry.contentType && /json|text|html|xml/i.test(entry.contentType)) {
          try { entry.bodyPreview = (await res.text()).slice(0, 1000); } catch {}
        }
        responses.push(entry);
      };

      const onPopup = async (p: any) => {
        await p.waitForLoadState('domcontentloaded').catch(() => {});
        popupData = { url: p.url(), title: await p.title().catch(() => '') };
      };

      const onDownload = async (d: any) => {
        downloadData = { url: d.url(), filename: d.suggestedFilename() };
      };

      page.on('request', onRequest);
      page.on('response', onResponse);
      ctx.on('page', onPopup);
      page.on('download', onDownload);

      // Wait 5 seconds for user to click in Chromium
      await page.waitForTimeout(5000);

      page.off('request', onRequest);
      page.off('response', onResponse);
      ctx.off('page', onPopup);
      page.off('download', onDownload);

      // Post-monitor DOM
      const postBody = (await page.locator('body').textContent().catch(() => '')) || '';
      const postUrl = page.url();
      const domChanged = preBody !== postBody;

      // Tag responses by keyword
      const KEYWORD_GROUPS: Array<{ tag: string; keywords: string[] }> = [
        { tag: '疑似报告接口', keywords: ['报告', '共识记', '学新词汇', '复习词汇', '遗忘', '正确率', '学习进度', '训练时间'] },
        { tag: '疑似课后作业接口', keywords: ['prints', '课后', '中英文', '英文', '中文', '音标', '打印'] },
        { tag: '疑似PDF接口', keywords: ['.pdf', 'application/pdf', 'download'] },
        { tag: '疑似抗遗忘接口', keywords: ['抗遗忘', 'review-cycle', '复习日期', '遗忘词数'] },
        { tag: '疑似极简造句接口', keywords: ['极简造句', 'simple', '造句'] },
      ];

      const taggedResponses = responses.map((r) => {
        const tags: string[] = [];
        const combined = (r.url + ' ' + r.bodyPreview + ' ' + r.contentType).toLowerCase();
        for (const g of KEYWORD_GROUPS) {
          if (g.keywords.some((kw) => combined.includes(kw.toLowerCase()))) tags.push(g.tag);
        }
        return { ...r, tags };
      });

      // Filter to interesting responses only
      const interesting = taggedResponses.filter((r) =>
        r.tags.length > 0 || r.status >= 300 || r.bodyPreview.length > 0
      );

      return NextResponse.json({
        monitored: true,
        duration: 5000,
        preUrl,
        postUrl,
        urlChanged: preUrl !== postUrl,
        domChanged,
        totalRequests: requests.length,
        totalResponses: responses.length,
        popupOpened: !!popupData,
        popupData,
        downloadTriggered: !!downloadData,
        downloadData,
        interestingResponses: interesting,
        allRequests: requests.slice(0, 100),
        allResponses: taggedResponses.slice(0, 100),
      });
    } catch (err: any) {
      return NextResponse.json({ error: `监听失败：${err.message}` }, { status: 500 });
    }
  }

  // ------ test-rule ------
  if (action === 'test-rule') {
    const testUrl = body.url;
    if (!testUrl) return NextResponse.json({ error: '请提供 URL' }, { status: 400 });
    if (!(await isBrowserOpen())) return NextResponse.json({ error: '请先打开英语系统浏览器' }, { status: 400 });
    try {
      const ctx = await getContext();
      if (!ctx) return NextResponse.json({ error: '浏览器上下文已丢失' }, { status: 500 });

      const testPage = await ctx.newPage();
      let result: any = {};

      try {
        const resp = await testPage.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        result.status = resp?.status() || 0;
        result.statusText = resp?.statusText() || '';
        const headers = resp?.headers() || {};
        result.contentType = headers['content-type'] || '';

        const bodyText = (await testPage.locator('body').textContent().catch(() => '')) || '';

        if (result.contentType?.includes('application/json')) {
          try { result.bodyJson = JSON.parse(bodyText); } catch { result.bodyText = bodyText.slice(0, 2000); }
        } else if (result.contentType?.includes('application/pdf')) {
          result.isPdf = true;
          result.bodyText = `[PDF 文件，${bodyText.length} bytes 文本]`;
        } else {
          result.bodyText = bodyText.replace(/\s+/g, ' ').trim().slice(0, 2000);
        }

        result.url = resp?.url() || testPage.url();

        // Extract links from response page
        const links = await testPage.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]')).map((a) => ({
            href: (a as HTMLAnchorElement).href,
            text: (a.textContent || '').trim().slice(0, 60),
          }))
        );
        result.pdfLinks = links.filter((l: any) => /\.pdf(\?.*)?$/i.test(l.href)).slice(0, 10);
        result.printLinks = links.filter((l: any) => /prints|review-cycle-paper|simple/i.test(l.href)).slice(0, 10);
      } finally {
        await testPage.close().catch(() => {});
      }

      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json({ error: `测试读取失败：${err.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ error: '无效操作' }, { status: 400 });
}
