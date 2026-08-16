export interface ClickMemory {
  actionName: string;
  resultType: 'new-page-homework1' | 'new-page-review-paper' | 'new-page-simple' | 'same-page-report' | 'unknown';
  triggerText: string;
  urlPattern: string;
  pageType: string;
  evidence: {
    urlChanged: boolean;
    popup: boolean;
    domChanged: boolean;
    keywords: string[];
  };
  updatedAt: string;
}

const STORAGE_KEY = 'english_system_click_memory';

export function getClickMemories(): ClickMemory[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

export function saveClickMemory(memory: ClickMemory): void {
  if (typeof window === 'undefined') return;
  const memories = getClickMemories();
  const idx = memories.findIndex((m) => m.actionName === memory.actionName);
  if (idx >= 0) {
    memories[idx] = { ...memory, updatedAt: new Date().toISOString() };
  } else {
    memories.push({ ...memory, updatedAt: new Date().toISOString() });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
}

export function findClickMemory(actionName: string): ClickMemory | undefined {
  return getClickMemories().find((m) => m.actionName === actionName);
}

// Pre-defined patterns based on known behavior
const DEFAULT_MEMORIES: ClickMemory[] = [
  {
    actionName: '课后',
    resultType: 'new-page-homework1',
    triggerText: '课后',
    urlPattern: '/pc/prints?id=',
    pageType: '课后作业1打印页',
    evidence: { urlChanged: true, popup: true, domChanged: true, keywords: ['打印中英文', '打印英文', '打印中文', '打印音标'] },
    updatedAt: '',
  },
  {
    actionName: '极简造句',
    resultType: 'new-page-simple',
    triggerText: '极简造句',
    urlPattern: 'simple',
    pageType: '极简造句页',
    evidence: { urlChanged: true, popup: true, domChanged: true, keywords: ['极简造句', '造句'] },
    updatedAt: '',
  },
  {
    actionName: '抗遗忘试卷',
    resultType: 'new-page-review-paper',
    triggerText: '抗遗忘试卷',
    urlPattern: 'review-cycle-paper',
    pageType: '抗遗忘试卷页',
    evidence: { urlChanged: true, popup: true, domChanged: true, keywords: ['抗遗忘', '复习日期', '遗忘词数'] },
    updatedAt: '',
  },
  {
    actionName: '报告',
    resultType: 'same-page-report',
    triggerText: '报告',
    urlPattern: '',
    pageType: '报告结果',
    evidence: { urlChanged: false, popup: false, domChanged: true, keywords: ['报告', '今日共识记', '学新词汇', '复习词汇'] },
    updatedAt: '',
  },
];

export function deleteClickMemory(actionName: string): void {
  if (typeof window === 'undefined') return;
  const memories = getClickMemories().filter((m) => m.actionName !== actionName);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
}

export function getEffectiveClickMemory(actionName: string): ClickMemory | undefined {
  return findClickMemory(actionName) || DEFAULT_MEMORIES.find((m) => m.actionName === actionName);
}

export function hasSavedMemory(actionName: string): boolean {
  return findClickMemory(actionName) !== undefined;
}
