// ============================================================
// GET /api/local-automation/get-page-info?url=xxx
// 用 Playwright 打开指定页面，返回页面信息
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: '请提供页面 URL' }, { status: 400 });
  }

  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

    const title = await page.title();

    // 获取页面文本（前 500 字符）
    const bodyText = (await page.locator('body').textContent()) || '';
    const previewText = bodyText.replace(/\s+/g, ' ').trim().slice(0, 500);

    // 提取所有链接
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors.map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a.textContent || '').trim().slice(0, 60),
      }));
    });

    // 分类链接
    const pdfLinks = links.filter((l) => /\.pdf(\?.*)?$/i.test(l.href));
    const printLinks = links.filter((l) => /prints|review-cycle-paper|simple/i.test(l.href));

    // 尝试识别学生名字
    const studentMatch = bodyText.match(/学生[：:]\s*(\S+)/);

    // 尝试识别课堂数据
    const dataLines: string[] = [];
    const dataPatterns = [/今日共识记词汇.*/, /学新词汇.*/, /学新遗忘.*/, /复习词汇.*/, /复习遗忘.*/, /正确率.*/, /需复习.*/, /已复习.*/];
    for (const p of dataPatterns) {
      const m = bodyText.match(p);
      if (m) dataLines.push(m[0].trim().slice(0, 80));
    }

    await context.close();
    await browser.close();

    return NextResponse.json({
      title,
      url,
      previewText,
      studentName: studentMatch ? studentMatch[1] : '',
      dataLines,
      pdfCount: pdfLinks.length,
      pdfLinks: pdfLinks.slice(0, 20).map((l) => ({ href: l.href, text: l.text })),
      printLinks: printLinks.slice(0, 20).map((l) => ({ href: l.href, text: l.text })),
      allLinksCount: links.length,
    });
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    const msg = error instanceof Error ? error.message : '读取失败';
    console.error('[get-page-info]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
