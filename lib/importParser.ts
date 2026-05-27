// ============================================================
// 智能英语系统导入 — 文本解析工具
// ============================================================

export interface ParsedImport {
  studentName: string;
  date: string;
  textbook: string;
  trainingTime: string;
  learningProgress: string;
  // 课堂数据
  totalVocabulary: string;
  newWords: string;
  newForgotten: string;
  newForgottenRate: string;
  reviewWords: string;
  reviewForgotten: string;
  reviewForgottenRate: string;
  // 补充说明（不在结构化字段里的内容）
  supplement: string;
  // 作业链接
  link1: string;
  link2: string;
  link3: string;
  // 提取到的所有键值对
  raw: Record<string, string>;
}

export function parseImportedText(text: string): ParsedImport {
  const result: ParsedImport = {
    studentName: '',
    date: '',
    textbook: '',
    trainingTime: '',
    learningProgress: '',
    totalVocabulary: '',
    newWords: '',
    newForgotten: '',
    newForgottenRate: '',
    reviewWords: '',
    reviewForgotten: '',
    reviewForgottenRate: '',
    supplement: '',
    link1: '',
    link2: '',
    link3: '',
    raw: {},
  };

  const lines = text.split(/\n|，|。/).map((l) => l.trim()).filter(Boolean);

  // 正则匹配 "标签：值" 或 "标签: 值" 模式
  const fieldPatterns: Array<{ key: keyof ParsedImport; patterns: RegExp[] }> = [
    { key: 'studentName', patterns: [/学生[名字名]?[:：]\s*(.+)/, /^([^\s]+)同学/] },
    { key: 'date', patterns: [/日期[:：]\s*(.+)/, /(\d{1,2}月\d{1,2}日)/] },
    { key: 'textbook', patterns: [/词库[:：]\s*(.+)/, /教材[:：]\s*(.+)/] },
    { key: 'trainingTime', patterns: [/训练时间[:：]\s*(.+)/, /上课时间[:：]\s*(.+)/] },
    { key: 'learningProgress', patterns: [/学习进度[:：]\s*(.+)/, /进度[:：]\s*(.+)/] },
    { key: 'totalVocabulary', patterns: [/今日共识记词汇[:：]\s*(.+)/, /共识记词汇[:：]\s*(.+)/, /词汇[:：]\s*(\d+个)/] },
    { key: 'newWords', patterns: [/学新词汇[:：]\s*(.+)/, /新词汇[:：]\s*(.+)/] },
    { key: 'newForgotten', patterns: [/学新遗忘词汇[:：]\s*(.+)/, /新遗忘[:：]\s*(.+)/] },
    { key: 'newForgottenRate', patterns: [/学新遗忘率[:：]\s*(.+)/, /新遗忘率[:：]\s*(.+)/] },
    { key: 'reviewWords', patterns: [/复习词汇[:：]\s*(.+)/, /复习词[:：]\s*(.+)/] },
    { key: 'reviewForgotten', patterns: [/复习遗忘词汇[:：]\s*(.+)/, /复习遗忘[:：]\s*(.+)/] },
    { key: 'reviewForgottenRate', patterns: [/复习遗忘率[:：]\s*(.+)/] },
  ];

  for (const line of lines) {
    for (const { key, patterns } of fieldPatterns) {
      if (result[key]) continue; // 已有值则跳过
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          (result as any)[key] = match[1].trim();
          result.raw[key] = match[1].trim();
          break;
        }
      }
    }
  }

  // 提取 URL
  const urlMatches = text.match(/https?:\/\/[^\s,，\n]+/gi) || [];
  const uniqueUrls = [...new Set(urlMatches)];

  if (uniqueUrls.length > 0) result.link1 = uniqueUrls[0];
  if (uniqueUrls.length > 1) result.link2 = uniqueUrls[1];
  if (uniqueUrls.length > 2) result.link3 = uniqueUrls[2];

  // 把不在结构化字段里的内容作为补充说明
  const knownValues = Object.values(result).filter((v) => typeof v === 'string' && v);
  const remaining = text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(学生|日期|词库|教材|训练时间|进度|学习进度|今日共识记词汇|学新词汇|学新遗忘词汇|学新遗忘率|复习词汇|复习遗忘词汇|复习遗忘率|共识记词汇|新词汇|新遗忘|新遗忘率|复习词|复习遗忘)[:：]\s*\S+/g, '')
    .replace(/\d{1,2}月\d{1,2}日/, '')
    .trim()
    .replace(/[\s,，。]+/g, ' ')
    .trim();

  if (remaining && remaining.length > 3) {
    result.supplement = remaining;
  }

  return result;
}

/** 从已解析的数据构造正课反馈的 structuredData 文本 */
export function buildStructuredDataFromImport(data: ParsedImport): string {
  const lines: string[] = [];
  if (data.studentName) lines.push(`学生：${data.studentName}`);
  if (data.date) lines.push(`日期：${data.date}`);
  if (data.textbook) lines.push(`词库：${data.textbook}`);
  if (data.trainingTime) lines.push(`训练时间：${data.trainingTime}`);
  if (data.learningProgress) lines.push(`学习进度：${data.learningProgress}`);
  if (data.totalVocabulary) lines.push(`今日共识记词汇：${data.totalVocabulary}`);
  if (data.newWords) lines.push(`学新词汇：${data.newWords}`);
  if (data.newForgotten) lines.push(`学新遗忘词汇：${data.newForgotten}`);
  if (data.newForgottenRate) lines.push(`学新遗忘率：${data.newForgottenRate}`);
  if (data.reviewWords) lines.push(`复习词汇：${data.reviewWords}`);
  if (data.reviewForgotten) lines.push(`复习遗忘词汇：${data.reviewForgotten}`);
  if (data.reviewForgottenRate) lines.push(`复习遗忘率：${data.reviewForgottenRate}`);
  return lines.join('\n');
}
