// ============================================================
// Tutor 课后反馈生成器 — 类型定义
// 客户端 / 服务端共享
// ============================================================

/** 课程类型 */
export type CourseType = 'regular' | 'review' | 'trial';

export const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  regular: '正课',
  review:  '复习课',
  trial:   '试听课',
};

/** 语气类型 */
export type Tone = 'warm' | 'formal' | 'lively';

export const TONE_LABEL: Record<Tone, string> = {
  warm:   '亲切',
  formal: '正式',
  lively: '活泼',
};

// --------------- 表单 ---------------

/** 用户在页面填写的表单数据 */
export interface FeedbackForm {
  studentName: string;
  courseType: CourseType;
  notes: string;
  focus?: string;
  keywords?: string;
  tone: Tone;
}

// --------------- API ---------------

/** POST /api/generate-feedback 请求体 */
export interface GenerateRequest {
  studentName: string;
  courseType: CourseType;
  notes: string;
  focus?: string;
  keywords?: string;
  tone: Tone;
  /** 上一次的反馈结果，用于避免重复 */
  previousResult?: string;
}

/** POST /api/generate-feedback 成功响应 */
export interface GenerateResponse {
  feedback: string;
}

/** POST /api/generate-feedback 错误响应 */
export interface GenerateError {
  error: string;
}

// --------------- 历史记录 ---------------

/** 一条已生成的反馈记录 */
export interface FeedbackRecord {
  id: string;
  createdAt: string;
  studentName: string;
  courseType: CourseType;
  tone: Tone;
  originalNotes: string;
  focus?: string;
  keywords?: string;
  feedback: string;
}

// --------------- 存储 ---------------

// --------------- 学生档案 ---------------

export interface StudentProfile {
  id: string;
  name: string;
  /** 自动积累：教材/词库 */
  textbook?: string;
  /** 自动积累：常忘单词 */
  commonWeakWords?: string[];
  /** 自动积累：常见问题 */
  commonIssues?: string[];
  /** 自动积累：学习优点 */
  strengths?: string[];
  /** 最近 10 条反馈历史 */
  recentFeedbacks: FeedbackRecord[];
  createdAt: string;
  updatedAt: string;
}

export const STORAGE_KEYS = {
  history:      'tutor_feedback_history',
  dailyCount:   'tutor_daily_count',
  dailyDate:    'tutor_daily_date',
  students:     'tutor_students',
} as const;

export const MAX_STUDENT_FEEDBACKS = 10;

export const MAX_DAILY_GENERATIONS = 50;
export const MAX_NOTES_LENGTH = 2000;
