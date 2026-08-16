// ============================================================
// POST /api/extract-student-names
// 批量提取：接收 urls 数组，并行识别每个链接对应的学生名，
// 返回与输入顺序一一对应的 names 数组（识别不到则为空字符串）。
// 供「批量作业」按学生分组使用。
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { extractNameFromUrl } from '@/lib/studentNameExtractor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body as { urls?: string[] };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ names: [] });
    }

    const names = await Promise.all(
      urls.map((rawUrl) => {
        if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) return Promise.resolve('');
        return extractNameFromUrl(rawUrl.trim()).catch(() => '');
      })
    );

    return NextResponse.json({ names });
  } catch (error) {
    console.error('[extract-student-names]', error);
    return NextResponse.json({ names: [] }, { status: 500 });
  }
}
