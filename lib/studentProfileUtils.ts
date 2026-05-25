// ============================================================
// 学生档案自动积累工具
// ============================================================

import type { StudentProfile, FeedbackRecord } from './types';
import { MAX_STUDENT_FEEDBACKS } from './types';

const MAX_WEAK_WORDS = 20;
const MAX_ISSUES = 10;
const MAX_STRENGTHS = 10;

/** 从反馈生成的上下文中提取信息，更新学生档案 */
export function updateProfileFromFeedback(
  profile: StudentProfile,
  structuredData: string,
  notes: string,
  feedback: string,
  record: FeedbackRecord
): StudentProfile {
  const updated = { ...profile };
  const combined = `${structuredData}\n${notes}`;

  // 1. 更新反馈历史
  updated.recentFeedbacks = [record, ...updated.recentFeedbacks].slice(
    0,
    MAX_STUDENT_FEEDBACKS
  );

  // 2. 提取教材/词库（从结构化数据中匹配）
  const textbookMatch = combined.match(/词库[:：]\s*(.+)/);
  if (textbookMatch) {
    updated.textbook = textbookMatch[1].trim();
  }

  // 3. 提取常忘单词
  const foundWords = new Set(
    (updated.commonWeakWords || []).map((w: string) => w.toLowerCase())
  );

  // 从"记一下 X" / "X 经常记不住" / "X 记不住" 提取
  const wordPatterns = [
    /记一下\s*(\S+)/g,
    /(\S+)\s*经常记不住/g,
    /(\S+)\s*记不住/g,
    /重点记一下\s*(\S+)/g,
  ];

  for (const pattern of wordPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(combined)) !== null) {
      const word = m[1].replace(/[,，。.!！?？\s]+$/g, '').trim();
      if (word.length > 1 && word.length < 30) {
        foundWords.add(word);
      }
    }
  }

  // 也从结构化数据中的"补充说明"提取
  const supplementMatch = combined.match(/补充说明[:：]\s*(.+)/);
  if (supplementMatch) {
    for (const p of wordPatterns) {
      let m: RegExpExecArray | null;
      while ((m = p.exec(supplementMatch[1])) !== null) {
        const word = m[1].replace(/[,，。.!！?？\s]+$/g, '').trim();
        if (word.length > 1 && word.length < 30) {
          foundWords.add(word);
        }
      }
    }
  }

  updated.commonWeakWords = Array.from(foundWords).slice(0, MAX_WEAK_WORDS);

  // 4. 提取常见问题
  const issues = new Set(updated.commonIssues || []);

  const issuePatterns = [
    /([^。，\n]{2,30}(?:反应慢|容易混淆|记不住|容易忘|分不清|搞混|混淆|经常错|反应不过来|跟不上)[^。，\n]{0,20})/g,
  ];

  for (const pattern of issuePatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(notes)) !== null) {
      const issue = m[1].trim();
      if (issue.length >= 4) issues.add(issue);
    }
  }

  updated.commonIssues = Array.from(issues).slice(0, MAX_ISSUES);

  // 5. 提取学习优点
  const strengths = new Set(updated.strengths || []);

  const strengthPatterns = [
    /([^。，\n]{2,30}(?:配合度|掌握稳定|表现好|表现不错|全对|全部正确|满分|反应快|积极|认真|扎实|很棒|记得牢|发音好|进步|有进步)[^。，\n]{0,20})/g,
  ];

  for (const pattern of strengthPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(feedback)) !== null) {
      const s = m[1].trim();
      if (s.length >= 3) strengths.add(s);
    }
  }

  updated.strengths = Array.from(strengths).slice(0, MAX_STRENGTHS);

  // 6. 更新时间
  updated.updatedAt = new Date().toISOString();

  return updated;
}
