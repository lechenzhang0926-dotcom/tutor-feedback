// ============================================================
// 统一北京时间工具函数
// 所有生成内容中的日期/时间都必须使用此模块
// 禁止使用浏览器本地时区、new Date().toLocaleDateString() 等
// ============================================================

function beijingDate(): Date {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
}

/** 2026年5月29日 */
export function getBeijingDateText(): string {
  const d = beijingDate();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 0529 */
export function getBeijingMMDD(): string {
  const d = beijingDate();
  return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** 2026年5月29日 20:15 */
export function getBeijingDateTimeText(): string {
  const d = beijingDate();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${h}:${m}`;
}

/** 2026-05-29 */
export function getBeijingISODate(): string {
  const d = beijingDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 2026-05-29T20:15:00+08:00 */
export function getBeijingISO(): string {
  const d = beijingDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
}

/** 星期几（中文） */
export function getBeijingDayOfWeek(): string {
  const d = beijingDate();
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `周${days[d.getDay()]}`;
}
