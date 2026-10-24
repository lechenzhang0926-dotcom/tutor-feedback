// ============================================================
// 识别到的学生名 ↔ 学生档案 的名字匹配
//
// 背景：PDF/页面里识别到的常常是「带姓的全名」（如：龚浩博），
// 而学生档案里存的可能是「不带姓的短名」（如：浩博）。
// 本模块负责把识别名对应到档案里已有的学生，避免同一个人被当成新学生。
//
// 匹配优先级：
//   1. 完全一致（忽略大小写）
//   2. 档案名被包含在识别名里（龚浩博 → 浩博），取最长的一个
//   3. 识别名被包含在档案名里（浩博 → 龚浩博），取最长的一个
//
// 安全约束：参与「包含」匹配的名字至少 2 个字，
// 避免单字档案名（如「博」）误匹配大量学生。
// ============================================================

import { getStudents } from '@/lib/storage';

const MIN_FUZZY_LEN = 2;

export interface NameMatchResult {
  /** 对应到的档案名；没匹配到则回退为原始识别名 */
  name: string;
  /** 是否匹配到了档案中的学生 */
  matched: boolean;
  /** 命中方式，便于调试/提示 */
  kind: 'exact' | 'archive-in-detected' | 'detected-in-archive' | 'none';
  /** 档案中原本的名字（未匹配到时为空） */
  archiveName: string;
}

function normalize(s: string): string {
  return (s || '').trim().toLowerCase();
}

/**
 * 在档案里找与 detected 对应的学生名。
 * 传入 archiveNames 可避免重复读取 localStorage（批量场景）。
 */
export function matchStudentName(
  detected: string,
  archiveNames?: string[]
): NameMatchResult {
  const raw = (detected || '').trim();
  if (!raw) {
    return { name: '', matched: false, kind: 'none', archiveName: '' };
  }

  const lower = normalize(raw);
  const names = archiveNames ?? getStudents().map((s) => s.name);

  // 1. 完全一致
  const exact = names.find((n) => normalize(n) === lower);
  if (exact) {
    return { name: exact, matched: true, kind: 'exact', archiveName: exact };
  }

  // 2. 档案名 ⊂ 识别名（龚浩博 → 浩博）：取最长，最长的最具体、歧义最小
  let bestContained = '';
  for (const n of names) {
    const nl = normalize(n);
    if (nl.length < MIN_FUZZY_LEN) continue;
    if (!lower.includes(nl)) continue;
    if (nl.length > normalize(bestContained).length) bestContained = n;
  }
  if (bestContained) {
    return {
      name: bestContained,
      matched: true,
      kind: 'archive-in-detected',
      archiveName: bestContained,
    };
  }

  // 3. 识别名 ⊂ 档案名（浩博 → 龚浩博）
  if (lower.length >= MIN_FUZZY_LEN) {
    let bestHost = '';
    for (const n of names) {
      const nl = normalize(n);
      if (nl.length < MIN_FUZZY_LEN) continue;
      if (!nl.includes(lower)) continue;
      if (nl.length > normalize(bestHost).length) bestHost = n;
    }
    if (bestHost) {
      return {
        name: bestHost,
        matched: true,
        kind: 'detected-in-archive',
        archiveName: bestHost,
      };
    }
  }

  return { name: raw, matched: false, kind: 'none', archiveName: '' };
}

/**
 * 批量匹配，并找出「多个不同识别名对应到同一档案名」的冲突。
 * 冲突时不阻止生成，但应提示用户确认，避免两个学生被并成一个。
 */
export function matchStudentNames(
  detectedNames: string[]
): {
  results: NameMatchResult[];
  /** 档案名 → 被映射过来的不同识别名列表（长度 > 1 即为冲突） */
  collisions: Map<string, string[]>;
} {
  const archiveNames = getStudents().map((s) => s.name);
  const results = detectedNames.map((n) => matchStudentName(n, archiveNames));

  // 档案名 → 映射到它的不同识别名（用于提示「龚浩博、李浩博 都对应到 浩博」）
  const byArchive = new Map<string, string[]>();
  detectedNames.forEach((raw, i) => {
    const r = results[i];
    // 完全一致不算冲突；只有靠包含关系映射过去的才可能撞车
    if (!r.matched || r.kind === 'exact') return;
    const bucket = byArchive.get(r.archiveName) || [];
    if (!bucket.includes(raw)) bucket.push(raw);
    byArchive.set(r.archiveName, bucket);
  });

  const collisions = new Map<string, string[]>();
  Array.from(byArchive.entries()).forEach(([archive, list]) => {
    if (list.length > 1) collisions.set(archive, list);
  });

  return { results, collisions };
}
