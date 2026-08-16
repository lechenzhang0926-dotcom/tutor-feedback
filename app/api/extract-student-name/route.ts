// ============================================================
// POST /api/extract-student-name
// 获取链接内容，从中提取学生名字（返回第一个能识别到名字的链接对应的名字）
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { extractNameFromUrl } from '@/lib/studentNameExtractor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body as { urls?: string[] };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ name: '' });
    }

    for (const rawUrl of urls) {
      if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) continue;

      const name = await extractNameFromUrl(rawUrl.trim());
      if (name) {
        return NextResponse.json({ name });
      }
    }

    return NextResponse.json({ name: '' });
  } catch (error) {
    console.error('[extract-student-name]', error);
    return NextResponse.json({ name: '' });
  }
}
