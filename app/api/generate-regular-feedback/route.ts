// ============================================================
// POST /api/generate-regular-feedback
// 正课反馈生成
// 如果输入是 OCR 原始文字，先整理结构再生成反馈
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateFeedback } from '@/lib/deepseek';
import {
  REGULAR_FEEDBACK_PROMPT,
  buildRegularFeedbackMessage,
  ANTI_FORGETTING_PROMPT,
  buildAntiForgettingMessage,
  STRUCTURE_OCR_PROMPT,
  buildStructureMessage,
} from '@/lib/prompts';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { feedbackType, feedbackLength, structuredData: incomingStructured, notes, studentProfile } = body;

    const hasStructured = incomingStructured && typeof incomingStructured === 'string' && incomingStructured.trim();
    const hasNotes = notes && typeof notes === 'string' && notes.trim();

    if (!hasStructured && !hasNotes) {
      return NextResponse.json({ error: '请上传截图识别或填写补充说明' }, { status: 400 });
    }

    // 合并 Claude 结构化数据 + 用户补充说明
    let combined: string;

    if (hasStructured && hasNotes) {
      combined = incomingStructured.trim() + '\n\n补充说明：' + notes.trim();
    } else if (hasStructured) {
      combined = incomingStructured.trim();
    } else {
      combined = notes!.trim();
    }

    if (combined.length > 5000) {
      return NextResponse.json({ error: '内容过长，请缩短至 5000 字以内' }, { status: 400 });
    }

    // 判断是否需要整理（Claude 输出已有标签，直接使用；纯文本需要整理）
    const hasLabels =
      combined.includes('学生：') ||
      combined.includes('日期：') ||
      combined.includes('今日共识记词汇') ||
      combined.includes('抗遗忘') ||
      combined.includes('复习周期');
    const needsStructuring = !hasLabels;

    let structuredData: string;

    if (needsStructuring) {
      const structureMsg = buildStructureMessage(combined);
      structuredData = await generateFeedback(STRUCTURE_OCR_PROMPT, structureMsg, 0);
    } else {
      structuredData = combined;
    }

    // 如果提供了学生档案，附加到结构化数据后面
    if (studentProfile && typeof studentProfile === 'string' && studentProfile.trim()) {
      structuredData += `\n\n===== 学生档案（参考，不要机械写入）=====\n${studentProfile.trim()}\n\n使用规则：只有当本次课堂内容和学生档案相关时，才自然融入反馈。禁止写"根据学生档案""长期学习特点"等系统化表达。`;
    }

    // 第二步：根据反馈类型用不同 prompt 生成
    const isAntiForgetting = feedbackType === 'anti-forgetting';

    const prompt = isAntiForgetting ? ANTI_FORGETTING_PROMPT : REGULAR_FEEDBACK_PROMPT;
    const userMessage = isAntiForgetting
      ? buildAntiForgettingMessage(structuredData)
      : buildRegularFeedbackMessage(structuredData, feedbackLength);

    const feedback = await generateFeedback(prompt, userMessage, 0.82);

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error('[generate-regular-feedback]', error);
    const msg = error instanceof Error ? error.message : '生成失败，请稍后重试。';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
