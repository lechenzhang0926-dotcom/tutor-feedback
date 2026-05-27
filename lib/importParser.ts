export interface ParsedImport {
  studentName: string; date: string; textbook: string; trainingTime: string; learningProgress: string;
  totalVocabulary: string; newWords: string; newForgotten: string; newForgottenRate: string;
  reviewWords: string; reviewForgotten: string; reviewForgottenRate: string;
  supplement: string; link1: string; link2: string; link3: string;
}

export function parseImportedText(text: string): ParsedImport {
  const result: ParsedImport = { studentName: '', date: '', textbook: '', trainingTime: '', learningProgress: '', totalVocabulary: '', newWords: '', newForgotten: '', newForgottenRate: '', reviewWords: '', reviewForgotten: '', reviewForgottenRate: '', supplement: '', link1: '', link2: '', link3: '' };
  const lines = text.split(/\n|，。|,/).filter(Boolean);
  const fieldMap: Array<{ key: keyof ParsedImport; patterns: RegExp[] }> = [
    { key: 'studentName', patterns: [/学生[名字名]?[:：]\s*(.+)/] },
    { key: 'date', patterns: [/日期[:：]\s*(.+)/, /(\d{1,2}月\d{1,2}日)/] },
    { key: 'textbook', patterns: [/词库[:：]\s*(.+)/] },
    { key: 'trainingTime', patterns: [/训练时间[:：]\s*(.+)/] },
    { key: 'learningProgress', patterns: [/学习进度[:：]\s*(.+)/, /进度[:：]\s*(.+)/] },
    { key: 'totalVocabulary', patterns: [/今日共识记词汇[:：]\s*(.+)/, /共识记词汇[:：]\s*(.+)/] },
    { key: 'newWords', patterns: [/学新词汇[:：]\s*(.+)/] },
    { key: 'newForgotten', patterns: [/学新遗忘词汇[:：]\s*(.+)/] },
    { key: 'newForgottenRate', patterns: [/学新遗忘率[:：]\s*(.+)/] },
    { key: 'reviewWords', patterns: [/复习词汇[:：]\s*(.+)/] },
    { key: 'reviewForgotten', patterns: [/复习遗忘词汇[:：]\s*(.+)/] },
    { key: 'reviewForgottenRate', patterns: [/复习遗忘率[:：]\s*(.+)/] },
  ];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const { key, patterns } of fieldMap) {
      if ((result as any)[key]) continue;
      for (const p of patterns) {
        const m = trimmed.match(p);
        if (m) { (result as any)[key] = m[1].trim(); break; }
      }
    }
  }
  const urls = Array.from(new Set(text.match(/https?:\/\/[^\s,，\n]+/gi) || []));
  if (urls[0]) result.link1 = urls[0];
  if (urls[1]) result.link2 = urls[1];
  if (urls[2]) result.link3 = urls[2];
  return result;
}

export function buildStructuredDataFromImport(data: ParsedImport): string {
  const parts: string[] = [];
  if (data.studentName) parts.push(`学生：${data.studentName}`);
  if (data.date) parts.push(`日期：${data.date}`);
  if (data.textbook) parts.push(`词库：${data.textbook}`);
  if (data.trainingTime) parts.push(`训练时间：${data.trainingTime}`);
  if (data.learningProgress) parts.push(`学习进度：${data.learningProgress}`);
  if (data.totalVocabulary) parts.push(`今日共识记词汇：${data.totalVocabulary}`);
  if (data.newWords) parts.push(`学新词汇：${data.newWords}`);
  if (data.newForgotten) parts.push(`学新遗忘词汇：${data.newForgotten}`);
  if (data.newForgottenRate) parts.push(`学新遗忘率：${data.newForgottenRate}`);
  if (data.reviewWords) parts.push(`复习词汇：${data.reviewWords}`);
  if (data.reviewForgotten) parts.push(`复习遗忘词汇：${data.reviewForgotten}`);
  if (data.reviewForgottenRate) parts.push(`复习遗忘率：${data.reviewForgottenRate}`);
  return parts.join('\n');
}
