// ============================================================
// GET /api/meeting-time?meetingId=793-508-153
// 用 Playwright 打开腾讯会议页面，提取预约时间
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get('meetingId');

  if (!meetingId || !/^[\d-]+$/.test(meetingId)) {
    return NextResponse.json({ error: '请提供有效的会议号' }, { status: 400 });
  }

  // 去掉横杠
  const cleanId = meetingId.replace(/-/g, '');

  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 腾讯会议加入页面
    const url = `https://meeting.tencent.com/dm/${cleanId}`;
    console.log('[meeting-time] 访问:', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

    // 尝试从页面提取时间信息
    // 腾讯会议页面中时间通常在 __NEXT_DATA__ 或 meta 标签中
    const time = await page.evaluate(() => {
      // 尝试从 JSON-LD 或页面数据中提取
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (let i = 0; i < scripts.length; i++) {
        try {
          const data = JSON.parse(scripts[i].textContent || '');
          if (data.startDate) return data.startDate;
        } catch {}
      }

      // 尝试从页面文本提取时间
      const body = document.body.textContent || '';
      // 匹配 "2026年5月25日 19:45" 或 "5月25日 19:45" 等格式
      const timeMatch = body.match(/(\d{4}年)?(\d{1,2}月\d{1,2}日)\s*(\d{1,2}:\d{2})/);
      if (timeMatch) {
        return `${timeMatch[2]} ${timeMatch[3]}`;
      }

      // 尝试 __NEXT_DATA__
      const nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) {
        try {
          const json = JSON.parse(nextData.textContent || '');
          const pageProps = json?.props?.pageProps;
          if (pageProps?.meetingInfo?.begin_time) return pageProps.meetingInfo.begin_time;
          if (pageProps?.beginTime) return pageProps.beginTime;
        } catch {}
      }

      return null;
    });

    await context.close();
    await browser.close();

    if (!time) {
      return NextResponse.json(
        { error: '无法获取会议时间，请手动输入' },
        { status: 422 }
      );
    }

    return NextResponse.json({ time });
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    console.error('[meeting-time]', error);
    return NextResponse.json(
      { error: '查询会议时间失败，请手动输入' },
      { status: 500 }
    );
  }
}
