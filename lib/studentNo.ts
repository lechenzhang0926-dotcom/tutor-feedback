// ============================================================
// 学生编号（作业链接里的数字）
//
// 背景：打印页链接形如 https://xxx.com/pc/prints?id=247343，
// 其中 247343 是系统里的学生编号，由系统分配且不会变动。
// 学生名可能识别不准、也可能重名，但编号是确定的 ——
// 所以识别学生时「按编号」比「按名字」可靠得多，应作为最高优先级依据。
// ============================================================

/**
 * 从作业链接里提取学生编号。
 *
 * 支持的形态（按优先级尝试）：
 *   - 查询参数 id： /pc/prints?id=247343             → 247343
 *   - 查询参数 studentId / sid / uid / studentno    → 对应数字
 *   - 路径末段纯数字： /pc/prints/247343             → 247343
 *
 * 注意：fqyy 这类 PDF 直链文件名是时间戳（如 202608172124525074.pdf），
 * 不是学生编号，因此**不匹配 .pdf 文件名里的长数字**，避免张冠李戴。
 *
 * @returns 编号字符串；取不到返回 ''
 */
export function extractStudentNo(url: string): string {
  if (!url) return '';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }

  // 1) 查询参数：id / studentId / sid / uid / studentNo / student_no 等。
  //    注意：参数名可能有大小写差异（如 studentId），而 URLSearchParams.get 区分大小写，
  //    所以这里遍历全部参数、把参数名统一转小写后再比对。
  const paramKeys = ['id', 'studentid', 'sid', 'uid', 'studentno', 'student_no', 'student'];
  const entries = Array.from(parsed.searchParams.entries());
  for (const key of paramKeys) {
    const hit = entries.find(([k]) => k.trim().toLowerCase() === key);
    if (!hit) continue;
    const v = (hit[1] || '').trim();
    if (/^\d{3,}$/.test(v)) return v;
  }

  // 2) 路径末段纯数字（如 /pc/prints/247343）
  const seg = parsed.pathname.split('/').filter(Boolean).pop() || '';
  if (/^\d{3,}$/.test(seg)) return seg;

  return '';
}

/**
 * 在档案里按编号找学生。传入 students 可避免重复读 localStorage。
 */
export function findStudentByNo<T extends { studentNo?: string }>(
  no: string,
  students: T[]
): T | undefined {
  if (!no) return undefined;
  return students.find((s) => s.studentNo && s.studentNo === no);
}
