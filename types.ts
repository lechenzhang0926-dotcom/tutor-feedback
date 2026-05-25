// ============================================================
// Tutor 课后反馈生成器 — TypeScript 数据结构
// ============================================================

// --------------- 枚举 ---------------

/** 课程类型 */
export type CourseType = 'regular' | 'review' | 'trial';

/** 课程类型中文标签 */
export const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  regular: '正课',
  review:  '复习课',
  trial:   '试听课',
};

/** 语气类型 */
export type Tone = 'warm' | 'formal' | 'lively';

/** 语气中文标签 */
export const TONE_LABEL: Record<Tone, string> = {
  warm:   '亲切',
  formal: '正式',
  lively: '活泼',
};

// --------------- 学生 ---------------

/** 学生基本信息 */
export interface Student {
  /** 唯一标识，时间戳字符串（v1），迁移 Supabase 后替换为 uuid */
  id: string;

  /** 学生名字，如"小明" */
  name: string;

  /** 创建时间（ISO 8601） */
  createdAt: string;

  /** 更新时间（ISO 8601） */
  updatedAt: string;

  /** 默认使用的语气偏好（可选） */
  preferredTone?: Tone;

  /** 备注（可选），如"家长喜欢简洁风格" */
  note?: string;
}

// --------------- 表单 ---------------

/** 用户在页面填写的表单数据，提交给 API 前 */
export interface FeedbackForm {
  /** 学生名字，对应 Student.name，直接输入无需预先建档 */
  studentName: string;

  /** 课程类型 */
  courseType: CourseType;

  /** 用户随手写的课堂情况，必填 */
  notes: string;

  /** 本节课复习/强调的重点内容，选填 */
  focus?: string;

  /** 重点单词，逗号分隔的字符串，选填。如 "present, boring, theatre" */
  keywords?: string;

  /** 输出语气 */
  tone: Tone;
}

// --------------- API ---------------

/** 发送给 AI API 的请求载荷 */
export interface GenerateRequest {
  /** System prompt */
  systemPrompt: string;

  /** 拼装后的用户消息 */
  userMessage: string;

  /** 模型名称，如 "deepseek-chat" */
  model: string;

  /** 温度参数，正常生成 0.82，重新生成 0.95 */
  temperature: number;

  /** 最大输出 token 数 */
  maxTokens: number;
}

/** AI API 返回的错误 */
export interface ApiError {
  /** HTTP 状态码 */
  status: number;

  /** 错误消息 */
  message: string;
}

// --------------- 反馈记录 ---------------

/** 一条已生成的反馈，存入 localStorage 的历史记录 */
export interface FeedbackRecord {
  /** 唯一标识，时间戳字符串（v1），迁移 Supabase 后替换为 uuid */
  id: string;

  /** 创建时间（ISO 8601） */
  createdAt: string;

  /** 学生名字，冗余存储方便按学生筛选（v1 无学生表时） */
  studentName: string;

  /** 课程类型 */
  courseType: CourseType;

  /** 语气 */
  tone: Tone;

  /** 用户当时的课堂笔记原始输入 */
  originalNotes: string;

  /** 当时的复习重点 */
  focus?: string;

  /** 当时的重点单词 */
  keywords?: string;

  /** AI 生成的反馈正文 */
  feedback: string;

  /** 本次生成所消耗的 token 数（可选，用于统计用量） */
  tokenUsage?: number;
}

// --------------- 统计（后续版本） ---------------

/** 使用统计摘要，用于仪表盘展示 */
export interface UsageStats {
  /** 本月生成反馈总数 */
  totalThisMonth: number;

  /** 总反馈数 */
  totalAllTime: number;

  /** 各类型课程统计 */
  byCourseType: Record<CourseType, number>;

  /** 活跃学生数（去重） */
  activeStudentCount: number;
}

// --------------- 序列化 ---------------

/** localStorage 中存储的所有数据 */
export interface LocalStore {
  /** 学生列表 */
  students: Student[];

  /** 历史反馈记录，最新在前 */
  feedbacks: FeedbackRecord[];

  /** API Key */
  apiKey: string;
}

/** localStorage key 常量 */
export const STORAGE_KEYS = {
  apiKey:   'tutor_deepseek_key',
  feedbacks: 'tutor_feedback_history',
  students:  'tutor_students',
} as const;
