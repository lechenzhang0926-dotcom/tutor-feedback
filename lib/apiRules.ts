export type ApiRuleType = 'report' | 'homework' | 'pdf' | 'review' | 'simple' | 'other';

export interface ApiRule {
  id: string;
  name: string;
  type: ApiRuleType;
  method: string;
  url: string;
  urlPattern: string;
  contentType: string;
  samplePreview: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

const STORAGE_KEY = 'english_system_api_rules';

const TYPE_LABELS: Record<ApiRuleType, string> = {
  report: '报告接口',
  homework: '课后作业接口',
  pdf: 'PDF接口',
  review: '抗遗忘试卷接口',
  simple: '极简造句接口',
  other: '其他',
};

export function getRuleTypeLabel(type: ApiRuleType): string {
  return TYPE_LABELS[type];
}

export function getAllRuleTypes(): Array<{ value: ApiRuleType; label: string }> {
  return Object.entries(TYPE_LABELS).map(([value, label]) => ({ value: value as ApiRuleType, label }));
}

export function getRules(): ApiRule[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveRule(rule: ApiRule): void {
  if (typeof window === 'undefined') return;
  const rules = getRules();
  const idx = rules.findIndex((r) => r.id === rule.id);
  if (idx >= 0) {
    rules[idx] = { ...rule, updatedAt: new Date().toISOString() };
  } else {
    rules.push(rule);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function deleteRule(id: string): void {
  if (typeof window === 'undefined') return;
  const rules = getRules().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function createRuleFromResponse(
  response: { url: string; method?: string; contentType: string; bodyPreview: string; tags?: string[] },
  type: ApiRuleType,
  name?: string,
): ApiRule {
  const now = new Date().toISOString();
  const autoName = name || response.url.split('/').pop()?.split('?')[0]?.slice(0, 30) || '未命名规则';
  return {
    id: Date.now().toString(),
    name: autoName,
    type,
    method: response.method || 'GET',
    url: response.url,
    urlPattern: response.url,
    contentType: response.contentType || '',
    samplePreview: response.bodyPreview?.slice(0, 500) || '',
    createdAt: now,
    updatedAt: now,
    notes: '',
  };
}
