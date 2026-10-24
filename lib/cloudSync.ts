// ============================================================
// 云端镜像层（Supabase）
//
// 设计前提：UI 仍只用 localStorage（见 lib/storage.ts 的同步 API），
// 本文件负责把 localStorage 的改动「后台镜像」到 Supabase，并按 user_id 隔离；
// 以及登录时把云端数据拉回 localStorage（首次登录还会把本机已有数据上传做迁移）。
//
// 这样组件代码完全不用改，每人数据天然隔离（RLS: auth.uid() = user_id）。
// ============================================================

import { supabase, getCurrentUserId } from './supabaseClient';
import { STORAGE_KEYS, type FeedbackRecord, type StudentProfile } from './types';

// ---------------- 行映射 ----------------

function rowToStudent(r: Record<string, unknown>): StudentProfile {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    studentNo: (r.student_no as string) || undefined,
    textbook: (r.textbook as string) || undefined,
    commonWeakWords: (r.common_weak_words as string[]) || [],
    commonIssues: (r.common_issues as string[]) || [],
    strengths: (r.strengths as string[]) || [],
    recentFeedbacks: (r.recent_feedbacks as FeedbackRecord[]) || [],
    createdAt: (r.created_at as string) || new Date().toISOString(),
    updatedAt: (r.updated_at as string) || new Date().toISOString(),
  };
}

function studentToRow(s: StudentProfile, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    name: s.name,
    student_no: s.studentNo ?? null,
    textbook: s.textbook ?? null,
    common_weak_words: s.commonWeakWords ?? [],
    common_issues: s.commonIssues ?? [],
    strengths: s.strengths ?? [],
    recent_feedbacks: s.recentFeedbacks ?? [],
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function rowToRecord(r: Record<string, unknown>): FeedbackRecord {
  return {
    id: String(r.id),
    studentName: String(r.student_name ?? ''),
    courseType: (r.course_type as FeedbackRecord['courseType']) ?? 'regular',
    tone: (r.tone as FeedbackRecord['tone']) ?? 'warm',
    originalNotes: String(r.original_notes ?? ''),
    focus: (r.focus as string) || undefined,
    keywords: (r.keywords as string) || undefined,
    feedback: String(r.feedback ?? ''),
    createdAt: (r.created_at as string) || new Date().toISOString(),
  };
}

function recordToRow(rec: FeedbackRecord, userId: string) {
  return {
    id: rec.id,
    user_id: userId,
    student_name: rec.studentName,
    course_type: rec.courseType,
    tone: rec.tone,
    original_notes: rec.originalNotes,
    focus: rec.focus ?? null,
    keywords: rec.keywords ?? null,
    feedback: rec.feedback,
    created_at: rec.createdAt,
  };
}

// ---------------- 工具 ----------------

function lsGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, val); } catch { /* 忽略写入失败 */ }
}
function todayStr() { return new Date().toDateString(); }

// ---------------- 登录：从云端拉取（含首次迁移） ----------------

/**
 * 登录成功后调用：把当前用户的云端数据拉回 localStorage。
 * 首次登录且云端为空、但本机有数据 → 先上传本机数据到云端，完成迁移，再拉回。
 * 云端已有数据 → 直接覆盖本机（云端为权威）。
 */
export async function seedFromSupabase(): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid || !supabase || typeof window === 'undefined') return;

  const [{ data: students }, { data: history }, { data: usage }] = await Promise.all([
    supabase.from('students').select('*'),
    supabase.from('feedback_history').select('*').order('created_at', { ascending: false }),
    supabase.from('daily_usage').select('day,count').eq('user_id', uid).maybeSingle(),
  ]);

  const cloudStudents = students || [];
  const cloudHistory = history || [];

  // 首次迁移：云端空 + 本机有 → 上传本机
  if (cloudStudents.length === 0) {
    const localStudents: StudentProfile[] = JSON.parse(lsGet(STORAGE_KEYS.students) || '[]');
    const localHistory: FeedbackRecord[] = JSON.parse(lsGet(STORAGE_KEYS.history) || '[]');
    if (localStudents.length > 0) {
      await supabase.from('students').upsert(localStudents.map((s) => studentToRow(s, uid)));
    }
    if (localHistory.length > 0) {
      await supabase.from('feedback_history').insert(localHistory.map((r) => recordToRow(r, uid)));
    }
    // 重新拉取，确保本机与云端一致
    const [{ data: s2 }, { data: h2 }] = await Promise.all([
      supabase.from('students').select('*'),
      supabase.from('feedback_history').select('*').order('created_at', { ascending: false }),
    ]);
    lsSet(STORAGE_KEYS.students, JSON.stringify((s2 || []).map(rowToStudent)));
    lsSet(STORAGE_KEYS.history, JSON.stringify((h2 || []).map(rowToRecord)));
  } else {
    lsSet(STORAGE_KEYS.students, JSON.stringify(cloudStudents.map(rowToStudent)));
    lsSet(STORAGE_KEYS.history, JSON.stringify(cloudHistory.map(rowToRecord)));
  }

  // 每日用量：仅当云端有「今天」的记录时同步；否则保留本机（可能刚用过）
  if (usage && (usage as { day?: string }).day === todayStr()) {
    lsSet(STORAGE_KEYS.dailyDate, todayStr());
    lsSet(STORAGE_KEYS.dailyCount, String((usage as { count?: number }).count || 0));
  }
}

/** 登出时清空本机缓存，避免同一浏览器下一位用户看到上一位的数据 */
export async function clearLocalData(): Promise<void> {
  if (typeof window === 'undefined') return;
  [STORAGE_KEYS.students, STORAGE_KEYS.history, STORAGE_KEYS.dailyDate, STORAGE_KEYS.dailyCount].forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* 忽略 */ }
  });
}

// ---------------- 镜像写入（fire-and-forget，由 storage.ts 调用） ----------------

export async function mirrorUpsertStudent(s: StudentProfile): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid || !supabase) return;
  await supabase.from('students').upsert(studentToRow(s, uid));
}

export async function mirrorDeleteStudent(id: string): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid || !supabase) return;
  await supabase.from('students').delete().eq('id', id).eq('user_id', uid);
}

export async function mirrorAddFeedback(studentId: string, recentFeedbacks: FeedbackRecord[]): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid || !supabase) return;
  await supabase
    .from('students')
    .update({ recent_feedbacks: recentFeedbacks, updated_at: new Date().toISOString() })
    .eq('id', studentId)
    .eq('user_id', uid);
}

export async function mirrorAddHistory(r: FeedbackRecord): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid || !supabase) return;
  await supabase.from('feedback_history').insert(recordToRow(r, uid));
}

export async function mirrorDeleteHistory(id: string): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid || !supabase) return;
  await supabase.from('feedback_history').delete().eq('id', id).eq('user_id', uid);
}

export async function mirrorDaily(count: number): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid || !supabase) return;
  await supabase.from('daily_usage').upsert({ user_id: uid, day: todayStr(), count });
}
