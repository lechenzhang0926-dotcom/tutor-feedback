// ============================================================
// 客户端存储工具 — 仅客户端（依赖 localStorage）
// ============================================================

import { FeedbackRecord, StudentProfile, STORAGE_KEYS, MAX_DAILY_GENERATIONS, MAX_STUDENT_FEEDBACKS } from './types';

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
}

export function deleteFromHistory(id: string): void {
  if (typeof window === 'undefined') return;

  const history = getHistory().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
}

// --------------- 学生档案 ---------------

export function getStudents(): StudentProfile[] {
  if (typeof window === 'undefined') return [];

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.students) || '[]');
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
}

export function deleteStudent(id: string): void {
  if (typeof window === 'undefined') return;

  const students = getStudents().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(students));
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
}
