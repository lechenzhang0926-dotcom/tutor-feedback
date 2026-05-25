// ============================================================
// POST /api/generate-feedback
// 服务端 API Route — API Key 仅在此链路中可访问
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateFeedback } from '@/lib/deepseek';
import { SYSTEM_PROMPT, buildUserMessage } from '@/lib/prompts';
import { MAX_NOTES_LENGTH } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { studentName, courseType, notes, focus, keywords, tone, previousResult } = body;

    // --------------- 校验 ---------------

    if (!studentName || typeof studentName !== 'string' || !studentName.trim()) {
      return NextResponse.json({ error: '请填写学生名字' }, { status: 400 });
    }

    if (!notes || typeof notes !== 'string' || !notes.trim()) {
      return NextResponse.json({ error: '请填写课堂情况' }, { status: 400 });
    }

    if (notes.length > MAX_NOTES_LENGTH) {
      return NextResponse.json(
        { error: `课堂情况内容过长，请缩短至 ${MAX_NOTES_LENGTH} 字以内` },
        { status: 400 }
      );
    }

    const validCourseTypes = ['regular', 'review', 'trial'];
    if (!validCourseTypes.includes(courseType)) {
      return NextResponse.json({ error: '无效的课程类型' }, { status: 400 });
    }

    const validTones = ['warm', 'formal', 'lively'];
    if (!validTones.includes(tone)) {
      return NextResponse.json({ error: '无效的语气类型' }, { status: 400 });
    }

    // --------------- 调用 AI ---------------

    const userMessage = buildUserMessage({
      studentName: studentName.trim(),
      courseType,
      notes: notes.trim(),
      focus: focus?.trim() || undefined,
      keywords: keywords?.trim() || undefined,
      tone,
      previousResult: previousResult || undefined,
    });

    // 重新生成时提高 temperature 以增加多样性
    const temperature = previousResult ? 0.95 : 0.82;

    const feedback = await generateFeedback(SYSTEM_PROMPT, userMessage, temperature);

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error('[generate-feedback]', error);
    return NextResponse.json(
      { error: '生成失败，请稍后重试。' },
      { status: 500 }
    );
  }
}
