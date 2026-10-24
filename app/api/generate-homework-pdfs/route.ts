// ============================================================
// POST /api/generate-homework-pdfs
// 使用 Playwright 打开链接生成 PDF，暂存到临时目录，
// 返回文件列表供前端逐个下载
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { Browser } from 'playwright';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import {
  parseLink1Input,
  classifyAndNamePdfDirect,
  assignName,
  classifyFromTextAndUrl,
  type HomeworkType,
} from '@/lib/homeworkUtils';

interface PdfTask {
  name: string;
  url: string;
  /** PDF direct 模式已下载的内容，存在则直接写入，避免重复下载 */
  buffer?: Buffer;
}

interface FileInfo {
  name: string;
  size: number;
  error?: string;
}

// 临时文件目录
const TMP_DIR = path.join(os.tmpdir(), 'tutor-pdfs');

// ============================================================
// 浏览器单例（关键优化）
//
// 之前每收到一次生成请求都 chromium.launch 一个新浏览器、用完即 close。
// 批量作业时是「每个学生一次请求」，于是每个学生都会新开 + 关闭一个 Chromium，
// 在 Windows 上反复启停会闪出控制台/窗口，而且很慢。
//
// 改为：整个服务只按需启动一个浏览器实例，之后所有生成（含所有学生）共用，
// 不再每个学生新开。每个请求仍用独立的 browser.newContext()（隔离 cookie/缓存），
// 所以学生之间不会互相串数据。浏览器若意外断开会自动失效、下次请求重建。
// ============================================================
let cachedBrowser: Browser | null = null;
let browserLaunching: Promise<Browser> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.isConnected()) return cachedBrowser;
  // 并发请求同时进来时，只让第一个去启动，其余复用同一个 Promise，避免开多个浏览器
  if (browserLaunching) return browserLaunching;
  browserLaunching = (async () => {
    const { chromium } = await import('playwright');
    const b = await chromium.launch({
      headless: true,
      // --no-sandbox / --disable-setuid-sandbox：兼容 Linux/容器部署；Windows 上无副作用
      // --disable-gpu / --disable-dev-shm-usage：无头环境下更稳定，避免偶发崩溃
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
    cachedBrowser = b;
    b.on('disconnected', () => {
      cachedBrowser = null;
    });
    return b;
  })();
  try {
    return await browserLaunching;
  } finally {
    browserLaunching = null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentName, date, link1, link2, link3, link4 } = body;

    // --------------- 校验 ---------------

    if (!studentName || !date) {
      return NextResponse.json({ error: '请填写学生名字和日期' }, { status: 400 });
    }

    if (!link1 && !link2 && !link3 && !link4) {
      return NextResponse.json({ error: '请至少填写一个作业链接' }, { status: 400 });
    }

    if (!/^\d{4}$/.test(date)) {
      return NextResponse.json({ error: '日期格式错误，应为 MMDD' }, { status: 400 });
    }

    // --------------- 构建 PDF 任务列表 ---------------

    const prefix = `${studentName}-${date}`;
    const tasks: PdfTask[] = [];
    let pagePrintLink1 = ''; // link1 的页面打印 URL（仅 page 模式有值）
    let link1Pages: string[] = []; // link1 的多个页面链接（每个单独识别命名生成）
    const usedLink1 = new Map<HomeworkType, number>(); // 链接1 内命名去重（PDF 与页面链接共享）

    if (link1) {
      const parsed = parseLink1Input(link1);
      if (parsed.mode === 'pdf-direct') {
        // PDF 直链：按内容/链接识别每个 PDF 的类型，并给出正确文件名
        if (parsed.pdfUrls && parsed.pdfUrls.length) {
          tasks.push(...(await classifyAndNamePdfDirect(prefix, parsed.pdfUrls, usedLink1)));
        }
        // 多个页面链接：收集起来稍后用浏览器逐个识别、各生成 1 份 PDF
        if (parsed.pageUrls && parsed.pageUrls.length) {
          link1Pages = parsed.pageUrls.map((u) => normalizeUrl(u));
        }
      } else if (parsed.mode === 'page' && parsed.pageUrl) {
        const pageUrl = normalizeUrl(parsed.pageUrl);
        pagePrintLink1 = pageUrl;
        tasks.push(
          { name: `${prefix}-中英文.pdf`, url: pageUrl },
          { name: `${prefix}-英文.pdf`,   url: pageUrl },
          { name: `${prefix}-中文.pdf`,   url: pageUrl },
          { name: `${prefix}-音标.pdf`,   url: pageUrl },
        );
      }
    }

    if (link2) {
      tasks.push({ name: `${prefix}-抗遗忘试卷.pdf`, url: normalizeUrl(link2) });
    }

    if (link3) {
      tasks.push({ name: `${prefix}-极简造句.pdf`, url: normalizeUrl(link3) });
    }

    let syntaxPrintUrl = ''; // link4 的语法页面 URL
    if (link4) {
      const url = normalizeUrl(link4);
      syntaxPrintUrl = url;
      tasks.push(
        { name: `${prefix}-例句.pdf`, url },
        { name: `${prefix}-题目.pdf`, url },
        { name: `${prefix}-解析.pdf`, url },
      );
    }

    // --------------- 创建临时目录 ---------------

    const sessionId = randomUUID();
    const sessionDir = path.join(TMP_DIR, sessionId);

    await fs.mkdir(sessionDir, { recursive: true });

    // 10 分钟后自动清理
    setTimeout(() => {
      fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
    }, 10 * 60 * 1000);

    // --------------- 获取浏览器（复用单例，避免每个学生都新开一个 Chromium 而闪出窗口）---------------

    let browser: Browser;
    try {
      browser = await getSharedBrowser();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      console.error('[generate-homework-pdfs] Playwright 启动失败:', msg);
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      return NextResponse.json(
        { error: `浏览器启动失败：${msg}` },
        { status: 500 }
      );
    }

    // --------------- 生成 PDF（并行优化） ---------------
    //
    // 优化策略：
    // 1. PDF 直链 → 全部并行 fetch
    // 2. Link1 页面 → 打开一次，循环切换版本生成 4 个 PDF（原来打开 4 次）
    // 3. Link2 / Link3 → 各自独立页面，与上面两组并行
    //

    const files: FileInfo[] = [];
    const parallelJobs: Promise<void>[] = [];

    // --- 组 1: PDF 直链，全部并行 ---
    for (const task of tasks) {
      if (!task.url.endsWith('.pdf')) continue;
      parallelJobs.push((async () => {
        try {
          let pdfBuffer = task.buffer;
          if (!pdfBuffer) {
            const resp = await fetch(task.url);
            if (!resp.ok) throw new Error(`下载 PDF 失败 HTTP ${resp.status}`);
            pdfBuffer = Buffer.from(await resp.arrayBuffer());
          }
          await fs.writeFile(path.join(sessionDir, task.name), pdfBuffer);
          files.push({ name: task.name, size: pdfBuffer.length });
        } catch (err) {
          const msg = err instanceof Error ? err.message : '未知错误';
          console.error(`[generate-homework-pdfs] ${task.name} 失败:`, msg);
          files.push({ name: task.name, size: 0, error: msg });
        }
      })());
    }

    // --- 组 2: Link1 页面打印（同一页面一次性生成 4 个版本） ---
    if (pagePrintLink1) {
      const link1Tasks = tasks.filter((t) => t.url === pagePrintLink1);
      parallelJobs.push((async () => {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(pagePrintLink1, { waitUntil: 'domcontentloaded', timeout: 30000 });
          // 等待 JS 渲染完毕
          await page.waitForTimeout(800);

          for (const task of link1Tasks) {
            try {
              const version = inferPrintVersion(task.name);
              if (version) {
                await clickPrintButton(page, version);
              }
              const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
              });
              const filePath = path.join(sessionDir, task.name);
              await fs.writeFile(filePath, pdfBuffer);
              files.push({ name: task.name, size: pdfBuffer.length });
            } catch (err) {
              const msg = err instanceof Error ? err.message : '未知错误';
              console.error(`[generate-homework-pdfs] ${task.name} 失败:`, msg);
              files.push({ name: task.name, size: 0, error: msg });
            }
          }
        } finally {
          await context.close().catch(() => {});
        }
      })());
    }

    // --- 组 2.5: 课后作业1 的多个页面链接，每个单独识别命名、生成 1 份 PDF ---
    if (link1Pages.length > 0) {
      for (let i = 0; i < link1Pages.length; i++) {
        const pageUrl = link1Pages[i];
        parallelJobs.push((async () => {
          const context = await browser.newContext();
          try {
            const page = await context.newPage();
            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(500);
            // 综合 URL / 页面标题 / 正文识别类型，给出正确文件名
            const title = await page.title().catch(() => '');
            const bodyText = await page.innerText('body').catch(() => '');
            const type = classifyFromTextAndUrl(pageUrl, title, bodyText);
            const name = assignName(prefix, type, usedLink1, i);
            const pdfBuffer = await page.pdf({
              format: 'A4',
              printBackground: true,
              margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
            });
            const filePath = path.join(sessionDir, name);
            await fs.writeFile(filePath, pdfBuffer);
            files.push({ name, size: pdfBuffer.length });
          } catch (err) {
            const msg = err instanceof Error ? err.message : '未知错误';
            console.error(`[generate-homework-pdfs] 课后作业1页面 ${pageUrl} 失败:`, msg);
            files.push({ name: `${prefix}-文件${i + 1}.pdf`, size: 0, error: msg });
          } finally {
            await context.close().catch(() => {});
          }
        })());
      }
    }

    // --- 组 3: Link2 / Link3 独立页面，各自并行 ---
    for (const task of tasks) {
      if (task.url === pagePrintLink1 || task.url === syntaxPrintUrl || task.url.endsWith('.pdf')) continue;
      parallelJobs.push((async () => {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(500);
          const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
          });
          const filePath = path.join(sessionDir, task.name);
          await fs.writeFile(filePath, pdfBuffer);
          files.push({ name: task.name, size: pdfBuffer.length });
        } catch (err) {
          const msg = err instanceof Error ? err.message : '未知错误';
          console.error(`[generate-homework-pdfs] ${task.name} 失败:`, msg);
          files.push({ name: task.name, size: 0, error: msg });
        } finally {
          await context.close().catch(() => {});
        }
      })());
    }

    // --- 组 4: Link4 语法页面打印（同一页面生成例句/题目/解析 3个版本） ---
    if (syntaxPrintUrl) {
      const syntaxTasks = tasks.filter((t) => t.url === syntaxPrintUrl);
      parallelJobs.push((async () => {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(syntaxPrintUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(800);

          for (const task of syntaxTasks) {
            try {
              const version = inferSyntaxVersion(task.name);
              if (version) {
                await clickPrintButton(page, version);
              }
              const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
              });
              const filePath = path.join(sessionDir, task.name);
              await fs.writeFile(filePath, pdfBuffer);
              files.push({ name: task.name, size: pdfBuffer.length });
            } catch (err) {
              const msg = err instanceof Error ? err.message : '未知错误';
              console.error(`[generate-homework-pdfs] ${task.name} 失败:`, msg);
              files.push({ name: task.name, size: 0, error: msg });
            }
          }
        } finally {
          await context.close().catch(() => {});
        }
      })());
    }

    await Promise.all(parallelJobs);

    // 注意：浏览器是服务级单例，这里不再 close，留给后续请求复用（进程退出时由 OS 回收）

    // 检查是否有成功的
    const successCount = files.filter((f) => !f.error).length;
    if (successCount === 0) {
      const errors = files.map((f) => `${f.name}: ${f.error}`).join('; ');
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      return NextResponse.json(
        { error: `所有 PDF 生成失败：${errors}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ sessionId, files });
  } catch (error) {
    console.error('[generate-homework-pdfs] 未知错误:', error);
    return NextResponse.json(
      { error: 'PDF 生成失败，请稍后重试。' },
      { status: 500 }
    );
  }
}

// ============================================================
// Helper Functions
// ============================================================

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function inferPrintVersion(fileName: string): string | null {
  if (fileName.includes('中英文')) return null;
  if (fileName.includes('音标'))   return '音标';
  if (fileName.includes('英文'))   return '英文';
  if (fileName.includes('中文'))   return '中文';
  return null;
}

function inferSyntaxVersion(fileName: string): string | null {
  // 中英文版本（先点击的默认版本）不需要点按钮
  if (fileName.includes('例句'))   return null;
  if (fileName.includes('题目'))   return '题目';
  if (fileName.includes('解析'))   return '解析';
  return null;
}

async function clickPrintButton(
  page: import('playwright').Page,
  version: string
): Promise<void> {
  const targetText = `打印${version}`;

  // 等待按钮出现
  await page.waitForSelector('button', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);

  // 策略 1: 原生 DOM 精确匹配（最可靠，绕过 Playwright 无障碍树）
  const clicked = await page.evaluate((target) => {
    const selectors = 'button, a, [role="button"]';
    const els = document.querySelectorAll(selectors);
    for (let i = 0; i < els.length; i++) {
      const el = els[i] as HTMLElement;
      if ((el.textContent || '').trim() === target) {
        el.click();
        return true;
      }
    }
    return false;
  }, targetText);

  if (clicked) {
    await page.waitForTimeout(1500);
    return;
  }

  // 策略 2: 收集页面按钮文本用于错误诊断
  const allButtons = await page.locator('button').all();
  const foundTexts: string[] = [];
  for (const b of allButtons) {
    const t = (await b.textContent().catch(() => ''))?.trim();
    if (t) foundTexts.push(t);
  }

  throw new Error(
    `无法找到"${targetText}"按钮。页面上找到的按钮: [${foundTexts.join(', ')}]`
  );
}
