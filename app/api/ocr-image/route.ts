// ============================================================
// POST /api/ocr-image
// Claude Vision — 看懂截图结构，输出结构化数据
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { extractReportFromImage } from '@/lib/claudeVision';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64 } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: '请提供图片' }, { status: 400 });
    }

    const text = await extractReportFromImage(imageBase64);

    if (!text.trim()) {
      return NextResponse.json({ error: '未能识别到文字，请检查图片清晰度' }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error('[ocr-image]', error);
    const msg = error instanceof Error ? error.message : '图片识别失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
