// ============================================================
// 学生 → 腾讯会议号 映射表
// 选择学生名字时自动填入会议号
// ============================================================

const STUDENT_MEETING_IDS: Record<string, string> = {
  禹豪: '348-130-612',
  Happy: '230-424-506',
  豆豆: '561-813-293',
  隽语: '497-759-712',
  俊豪: '936-5395-3041',
  Mia: '809-8357-9729',
  杨小杨: '392-997-240',
  周妍: '690-149-795',
  睿泽: '501-1592-2881',
  辰辰: '624-6379-3676',
  谦谦: '460-627-174',
  芯妤: '620-723-282',
  浩东: '368-2692-9375',
  诗蕊: '237-727-824',
  智宸: '692-692-243',
  恩骏: '227-594-935',
  梓峻: '461-904-359',
  宇婷: '935-538-002',
};

/**
 * 根据学生名字查找会议号。
 * 模糊匹配：先精确匹配，再尝试包含匹配。
 */
export function getMeetingIdByName(name: string): string | undefined {
  if (!name) return undefined;

  // 精确匹配
  if (STUDENT_MEETING_IDS[name]) {
    return STUDENT_MEETING_IDS[name];
  }

  // 模糊匹配：名字包含关键字
  const keys = Object.keys(STUDENT_MEETING_IDS);
  for (const key of keys) {
    if (name.includes(key) || key.includes(name)) {
      return STUDENT_MEETING_IDS[key];
    }
  }

  return undefined;
}

/**
 * 获取完整的会议号文本（含 "#腾讯会议：" 前缀）
 */
export function getMeetingIdText(name: string): string | undefined {
  const id = getMeetingIdByName(name);
  if (!id) return undefined;
  return `#腾讯会议：${id}`;
}

export { STUDENT_MEETING_IDS };
