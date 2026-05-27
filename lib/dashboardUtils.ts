// ============================================================
// Dashboard 统计工具 — localStorage 读写
// ============================================================

const ACTIVITY_KEY = 'tutor_daily_activity';
const RECENT_STUDENTS_KEY = 'tutor_recent_students';

interface DailyActivity {
  date: string;
  feedbackCount: number;
  homeworkMsgCount: number;
  meetingCount: number;
}

export function getTodayActivity(): DailyActivity {
  if (typeof window === 'undefined') return { date: '', feedbackCount: 0, homeworkMsgCount: 0, meetingCount: 0 };

  const today = beijingToday();
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    const data: DailyActivity = raw ? JSON.parse(raw) : { date: '', feedbackCount: 0, homeworkMsgCount: 0, meetingCount: 0 };
    if (data.date !== today) {
      return { date: today, feedbackCount: 0, homeworkMsgCount: 0, meetingCount: 0 };
    }
    return data;
  } catch {
    return { date: today, feedbackCount: 0, homeworkMsgCount: 0, meetingCount: 0 };
  }
}

export function incrementFeedbackCount(): void {
  const activity = getTodayActivity();
  activity.feedbackCount++;
  activity.date = beijingToday();
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}

export function incrementHomeworkMsgCount(): void {
  const activity = getTodayActivity();
  activity.homeworkMsgCount++;
  activity.date = beijingToday();
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}

export function incrementMeetingCount(): void {
  const activity = getTodayActivity();
  activity.meetingCount++;
  activity.date = beijingToday();
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}

/** 获取最近使用的学生 ID 列表 */
export function getRecentStudentIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_STUDENTS_KEY) || '[]');
  } catch {
    return [];
  }
}

/** 记录学生使用 */
export function recordStudentUsage(studentId: string): void {
  if (typeof window === 'undefined') return;
  const ids = getRecentStudentIds().filter((id) => id !== studentId);
  ids.unshift(studentId);
  localStorage.setItem(RECENT_STUDENTS_KEY, JSON.stringify(ids.slice(0, 10)));
}

// --------------- 累计统计 ---------------

const TOTAL_STATS_KEY = 'tutor_total_stats';

interface TotalStats {
  feedbackCount: number;
  homeworkCount: number;
  meetingCount: number;
}

export function getTotalStats(): TotalStats {
  if (typeof window === 'undefined') return { feedbackCount: 0, homeworkCount: 0, meetingCount: 0 };
  try {
    return JSON.parse(localStorage.getItem(TOTAL_STATS_KEY) || '{"feedbackCount":0,"homeworkCount":0,"meetingCount":0}');
  } catch {
    return { feedbackCount: 0, homeworkCount: 0, meetingCount: 0 };
  }
}

function addTotalStat(key: keyof TotalStats): void {
  const stats = getTotalStats();
  stats[key]++;
  localStorage.setItem(TOTAL_STATS_KEY, JSON.stringify(stats));
}

export function incrementTotalFeedbackCount(): void { addTotalStat('feedbackCount'); }
export function incrementTotalHomeworkCount(): void { addTotalStat('homeworkCount'); }
export function incrementTotalMeetingCount(): void { addTotalStat('meetingCount'); }

/** 获取今日北京时间的 YYYY-MM-DD */
function beijingToday(): string {
  const now = new Date();
  const bj = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  return `${bj.getFullYear()}-${String(bj.getMonth() + 1).padStart(2, '0')}-${String(bj.getDate()).padStart(2, '0')}`;
}
