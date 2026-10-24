// ============================================================
// 客户端存储工具 — 仍以 localStorage 为「工作缓存」（同步 API，组件不动）
//
// 多用户改造说明：
// 本文件保持原有同步函数签名不变；每次写入 localStorage 后，额外把改动
// 「后台镜像」到 Supabase（见 lib/cloudSync.ts），并按 user_id 隔离。
// 登录时由 cloudSync.seedFromSupabase 把云端数据拉回 localStorage。
//
// 未配置 Supabase（环境变量缺失）时：镜像函数为 no-op，纯本地模式，行为同改造前。
// ============================================================

import {
  FeedbackRecord,
  StudentProfile,
  STORAGE_KEYS,
  MAX_DAILY_GENERATIONS,
  MAX_STUDENT_FEEDBACKS,
} from './types';
import {
  mirrorAddFeedback,
  mirrorAddHistory,
  mirrorDaily,
  mirrorDeleteHistory,
  mirrorDeleteStudent,
  mirrorUpsertStudent,
} from './cloudSync';

// --------------- 每日次数限制 ---------------

export function getDailyCount(): number {
  if (typeof window === 'undefined') return 0;

  const today = new Date().toDateString();
  const savedDate = localStorage.getItem(STORAGE_KEYS.dailyDate);

  if (savedDate !== today) {
    localStorage.setItem(STORAGE_KEYS.dailyDate, today);
    localStorage.setItem(STORAGE_KEYS.dailyCount, '0');
    return 0;
  }

  return parseInt(localStorage.getItem(STORAGE_KEYS.dailyCount) || '0', 10);
}

export function incrementDailyCount(): number {
  const count = getDailyCount() + 1;
  localStorage.setItem(STORAGE_KEYS.dailyCount, String(count));
  // 后台镜像到云端（未配置 Supabase 时 no-op）
  void mirrorDaily(count).catch(() => {});
  return count;
}

export function isRateLimited(): boolean {
  return getDailyCount() >= MAX_DAILY_GENERATIONS;
}

export function getRemainingToday(): number {
  return Math.max(0, MAX_DAILY_GENERATIONS - getDailyCount());
}

// --------------- 历史记录 ---------------

export function getHistory(): FeedbackRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
  } catch {
    return [];
  }
}

export function saveToHistory(record: FeedbackRecord): void {
  if (typeof window === 'undefined') return;

  const history = getHistory();
  history.unshift(record);

  if (history.length > 50) {
    history.length = 50;
  }

  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  void mirrorAddHistory(record).catch(() => {});
}

export function deleteFromHistory(id: string): void {
  if (typeof window === 'undefined') return;

  const history = getHistory().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  void mirrorDeleteHistory(id).catch(() => {});
}

// --------------- 学生档案 ---------------

export function getStudents(): StudentProfile[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw: StudentProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.students) || '[]');
    // 按创建时间从早到晚排序，缺失 createdAt 的按 name 拼音兜底
    raw.sort((a, b) => {
      if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
      if (a.createdAt) return -1;
      if (b.createdAt) return 1;
      return a.name.localeCompare(b.name, 'zh-Hans');
    });
    return raw;
  } catch {
    return [];
  }
}

export function saveStudent(student: StudentProfile): void {
  if (typeof window === 'undefined') return;

  const students = getStudents();
  const idx = students.findIndex((s) => s.id === student.id);

  if (idx >= 0) {
    students[idx] = student;
  } else {
    students.push(student);
  }

  localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(students));
  void mirrorUpsertStudent(student).catch(() => {});
}

export function deleteStudent(id: string): void {
  if (typeof window === 'undefined') return;

  const students = getStudents().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(students));
  void mirrorDeleteStudent(id).catch(() => {});
}

export function getStudentById(id: string): StudentProfile | undefined {
  return getStudents().find((s) => s.id === id);
}

export function addFeedbackToStudent(studentId: string, record: FeedbackRecord): void {
  if (typeof window === 'undefined') return;

  const students = getStudents();
  const student = students.find((s) => s.id === studentId);
  if (!student) return;

  student.recentFeedbacks.unshift(record);
  if (student.recentFeedbacks.length > MAX_STUDENT_FEEDBACKS) {
    student.recentFeedbacks.length = MAX_STUDENT_FEEDBACKS;
  }

  student.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(students));
  void mirrorAddFeedback(studentId, student.recentFeedbacks).catch(() => {});
}
