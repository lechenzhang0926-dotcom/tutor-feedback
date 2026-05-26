// ============================================================
// POST /api/generate-homework-pdfs
// 使用 Playwright 打开链接生成 PDF，暂存到临时目录，
// 返回文件列表供前端逐个下载
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

interface PdfTask {
  name: string;
  url: string;
}

interface FileInfo {
  name: string;
  size: number;
  error?: string;
}

// 临时文件目录
const TMP_DIR = path.join(os.tmpdir(), 'tutor-pdfs');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentName, date, link1, link2, link3 } = body;

    // --------------- 校验 ---------------

    if (!studentName || !date) {
      return NextResponse.json({ error: '请填写学生名字和日期' }, { status: 400 });
    }

    if (!link1 && !link2 && !link3) {
      return NextResponse.json({ error: '请至少填写一个作业链接' }, { status: 400 });
    }

    if (!/^\d{4}$/.test(date)) {
      return NextResponse.json({ error: '日期格式错误，应为 MMDD' }, { status: 400 });
    }

    // --------------- 构建 PDF 任务列表 ---------------

    const prefix = `${studentName}-${date}`;
    const tasks: PdfTask[] = [];
    const normalizedLink1 = link1 ? normalizeUrl(link1) : '';

    if (link1) {
      tasks.push(
        { name: `${prefix}-中英文.pdf`, url: normalizedLink1 },
        { name: `${prefix}-英文.pdf`,   url: normalizedLink1 },
        { name: `${prefix}-中文.pdf`,   url: normalizedLink1 },
        { name: `${prefix}-音标.pdf`,   url: normalizedLink1 },
      );
    }

    if (link2) {
      tasks.push({ name: `${prefix}-抗遗忘试卷.pdf`, url: normalizeUrl(link2) });
    }

    if (link3) {
      tasks.push({ name: `${prefix}-极简造句.pdf`, url: normalizeUrl(link3) });
    }

    // --------------- 创建临时目录 ---------------

    const sessionId = randomUUID();
    const sessionDir = path.join(TMP_DIR, sessionId);

    await fs.mkdir(sessionDir, { recursive: true });

    // 10 分钟后自动清理
    setTimeout(() => {
      fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
    }, 10 * 60 * 1000);

    // --------------- 生成 PDF ---------------

    let browser;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      console.error('[generate-homework-pdfs] Playwright 启动失败:', msg);
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      return NextResponse.json(
        { error: `浏览器启动失败：${msg}` },
        { status: 500 }
      );
    }

    const files: FileInfo[] = [];

    for (const task of tasks) {
      let context;
      try {
        context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(task.url, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });

        // link1 的 4 个变体需要切换打印版本
        const isLink1Task = link1 && task.url === normalizedLink1;
        if (isLink1Task) {
          const version = inferPrintVersion(task.name);
          if (version) {
            await clickPrintButton(page, version);
          }
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
        console.error(`[generate-homework-pdfs] ${task.name} 生成失败:`, msg);
        files.push({ name: task.name, size: 0, error: msg });
      } finally {
        if (context) await context.close().catch(() => {});
      }
    }

    await browser.close();

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
