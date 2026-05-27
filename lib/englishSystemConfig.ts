// ============================================================
// 英语系统页面位置配置 — localStorage
// ============================================================

export interface PageRecord {
  url: string;
  title: string;
  previewText: string;
}

export interface EnglishSystemConfig {
  systemUrl: string;
  studentSearch: string;
  reportPage: string;
  homework1Page: string;
  reviewPaperPage: string;
  simpleSentencePage: string;
  notes: string;
  recordedPages: {
    report?: PageRecord;
    homework1?: PageRecord;
    reviewPaper?: PageRecord;
    simpleSentence?: PageRecord;
  };
}

const STORAGE_KEY = 'english_system_navigation_config';

const DEFAULT_CONFIG: EnglishSystemConfig = {
  systemUrl: '',
  studentSearch: '',
  reportPage: '',
  homework1Page: '',
  reviewPaperPage: '',
  simpleSentencePage: '',
  notes: '',
  recordedPages: {},
};

export function getConfig(): EnglishSystemConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: EnglishSystemConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
