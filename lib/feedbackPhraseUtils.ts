// ============================================================
// 反馈短语标签工具
// ============================================================

const CUSTOM_PHRASES_KEY = 'tutor_custom_phrases';
const MAX_CUSTOM = 12;

const DEFAULT_PHRASES: string[] = [
  '单词认读还不够熟练',
  '中文意思掌握较好，但英文反应慢',
  '容易把相近意思的单词混淆',
  '拼写还需要继续巩固',
  '发音需要多跟读',
  '长单词记忆不够稳定',
  '看到英文能理解，但主动说出还不够快',
  '新词吸收不错，但复习词还要加强',
  '课堂专注度不错',
  '基础比较扎实',
  '今天内容比较多，需要课后消化',
  '这个单词经常记不住',
  '可以和反义词放在一起记',
  '可以通过例句帮助理解',
  '回去重点复习今天不熟的单词',
];

export function getDefaultFeedbackPhrases(): string[] {
  return DEFAULT_PHRASES;
}

export function getCustomFeedbackPhrases(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PHRASES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomFeedbackPhrases(phrases: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_PHRASES_KEY, JSON.stringify(phrases.slice(0, MAX_CUSTOM)));
}

export function deleteCustomPhrase(phrase: string): void {
  const phrases = getCustomFeedbackPhrases().filter((p) => p !== phrase);
  saveCustomFeedbackPhrases(phrases);
}

/** 从补充说明中提取关键词片段，更新个性化短语 */
export function updateCustomPhrasesFromUsage(
  notes: string,
  selectedPhrases: string[]
): string[] {
  const existing = getCustomFeedbackPhrases();
  const combined = notes + ' ' + selectedPhrases.join(' ');

  // 提取候选短语：长度 4-15 字的中文片段
  const candidates = new Map<string, number>();

  for (const phrase of selectedPhrases) {
    if (phrase.length >= 4) {
      candidates.set(phrase, (candidates.get(phrase) || 0) + 1);
    }
  }

  // 从 notes 中提取高频关键词组
  const words = combined.split(/[，。！？、\s\n]+/).filter((w) => w.length >= 4 && w.length <= 20);

  for (const word of words) {
    if (DEFAULT_PHRASES.includes(word)) continue;
    if (existing.includes(word)) continue;
    candidates.set(word, (candidates.get(word) || 0) + 1);
  }

  // 合并已有个性化短语和新候选
  const merged = new Set(existing);
  for (const [phrase] of Array.from(candidates.entries()).sort((a, b) => b[1] - a[1])) {
    if (merged.size >= MAX_CUSTOM) break;
    merged.add(phrase);
  }

  return [...merged].slice(0, MAX_CUSTOM);
}
