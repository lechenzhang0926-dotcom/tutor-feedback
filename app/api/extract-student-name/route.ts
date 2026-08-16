// ============================================================
// POST /api/extract-student-name
// 获取链接内容，从中提取学生名字
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body as { urls?: string[] };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ name: '' });
    }

    for (const rawUrl of urls) {
      if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) continue;

      const name = await extractNameFromUrl(rawUrl.trim());
      if (name) {
        return NextResponse.json({ name });
      }
    }

    return NextResponse.json({ name: '' });
  } catch (error) {
    console.error('[extract-student-name]', error);
    return NextResponse.json({ name: '' });
  }
}

async function extractNameFromUrl(url: string): Promise<string> {
  // ---- PDF 文件 ----
  if (/\.pdf(\?.*)?$/i.test(url)) {
    return extractNameFromPdf(url);
  }

  // ---- HTML 页面 ----
  if (url.startsWith('http')) {
    return extractNameFromHtml(url);
  }

  return '';
}

// ============================================================
// 从 HTML 页面提取学生名字
// ============================================================
async function extractNameFromHtml(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) return '';

    const html = await resp.text();
    return extractNameFromText(html);
  } catch {
    return '';
  }
}

// ============================================================
// 从 PDF 提取学生名字（读取文本 + URL 文件名）
// ============================================================
async function extractNameFromPdf(url: string): Promise<string> {
  // 先尝试从文件名提取
  const fileName = url.split('/').pop()?.split('?')[0] || '';
  const decodedName = decodeURIComponent(fileName).replace(/\.pdf$/i, '');
  const fromFileName = cleanNameCandidate(decodedName);
  if (fromFileName && isLikelyName(fromFileName)) return fromFileName;

  // 尝试下载 PDF 并提取文本
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*',
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) return '';

    const buffer = await resp.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);

    return extractNameFromText(text);
  } catch {
    return '';
  }
}

// ============================================================
// 从文本内容中提取学生名字
// ============================================================
function extractNameFromText(text: string): string {
  // 去除 HTML 标签（保留文本间的空格感）
  let plain = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  plain = plain.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  plain = plain.replace(/<[^>]*>/g, ' ');
  plain = plain.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  plain = plain.replace(/\s+/g, ' ').trim();

  // 模式 1: 标签匹配 — "学生：XXX" "学员：XXX" "姓名：XXX" "学员姓名 XXX"
  const labelPatterns: Array<{ regex: RegExp; strong: boolean }> = [
    { regex: /学生\s*[：:]\s*([^\s<]{2,10})/, strong: true },
    { regex: /学员\s*[：:]\s*([^\s<]{2,10})/, strong: true },
    { regex: /学员姓名\s*[：:]*\s*([^\s<]{2,20})/, strong: true },
    { regex: /姓名\s*[：:]\s*([^\s<]{2,10})/, strong: false },
    { regex: /名字\s*[：:]\s*([^\s<]{2,10})/, strong: false },
    { regex: /打印人\s*[：:]\s*([^\s<]{2,10})/, strong: false },
  ];
  for (const { regex: pat, strong } of labelPatterns) {
    const m = plain.match(pat);
    if (m) {
      const candidate = cleanNameCandidate(m[1]);
      if (candidate && isLikelyName(candidate, strong)) return candidate;
    }
  }

  // 模式 2: 在原始 HTML 中找标签后的名字（可能跨 HTML 标签，支持中英文）
  const rawHtml = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const htmlLabelMatch = rawHtml.match(/(?:学员姓名|学生|学员|姓名|名字)\s*[：:]*\s*([^\s,，。！？、]{2,20})/);
  if (htmlLabelMatch) {
    const candidate = cleanNameCandidate(htmlLabelMatch[1]);
    if (candidate && isLikelyName(candidate)) return candidate;
  }

  // 模式 3: 中文名字在标题中
  const titleMatch = text.match(/<title>([^<]*)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1];
    const cnMatch = title.match(/([一-鿿]{2,4})/);
    if (cnMatch && isLikelyChineseName(cnMatch[1])) {
      return cnMatch[1];
    }
  }

  // 是否为确认的教学系统页面（打印页/销课记录页）
  const isEduPage = /销课记录|打印时间|打印中英文|课后|抗遗忘|极简造句|学员姓名/.test(plain);

  // 模式 4: "打印时间"附近优先找标签 → 中文名 → 英文名
  const printIdx = plain.indexOf('打印时间');
  if (printIdx >= 0) {
    const nearby = plain.slice(Math.max(0, printIdx - 300), printIdx + 50);
    // 优先：找附近的学生/学员/姓名标签（中英文均支持）
    for (const { regex: pat, strong } of labelPatterns) {
      const m = nearby.match(pat);
      if (m) {
        const candidate = cleanNameCandidate(m[1]);
        if (candidate && isLikelyName(candidate, strong)) return candidate;
      }
    }
    // 其次：中文名（必须首字是姓氏）
    const cnMatches = nearby.match(/([一-鿿]{2,4})/g);
    if (cnMatches) {
      for (const name of cnMatches) {
        if (isLikelyChineseName(name, true)) return name;
      }
    }
    // 再次：英文名（附近出现过学生/学员等标签时）
    if (/学生|学员|姓名/.test(nearby)) {
      const enNear = nearby.match(/\b([A-Z][a-z]{1,14})\d*\b/g);
      if (enNear) {
        for (const en of enNear) {
          if (!COMMON_ENGLISH_WORDS.has(en) && isLikelyName(en)) return en;
        }
      }
    }
  }

  // 模式 5: 标签或教学页面中找英文名
  if (/学生|学员|学员姓名|姓名|名字|student|name/i.test(plain) || isEduPage) {
    const enMatches = plain.match(/\b([A-Z][a-z]{1,14})\d*\b/g);
    if (enMatches) {
      for (const en of enMatches) {
        if (!COMMON_ENGLISH_WORDS.has(en) && isLikelyName(en) && !/^\d+$/.test(en)) {
          return en;
        }
      }
    }
  }

  // 模式 6: 教学页面宽松中文名匹配（允许无姓氏的缩略名如"乐晨"）
  if (isEduPage) {
    const cnMatches = plain.match(/([一-鿿]{2,4})/g);
    if (cnMatches) {
      for (const name of cnMatches) {
        if (isLikelyChineseName(name, true)) return name;
      }
    }
  }

  return '';
}

/** 英文常见词（绝不可能是学生名） */
const COMMON_ENGLISH_WORDS = new Set([
  'Http', 'Https', 'The', 'This', 'That', 'For', 'And', 'But', 'Not', 'You',
  'All', 'New', 'Get', 'Set', 'Has', 'Can', 'May', 'Was', 'Are', 'Did',
  'Its', 'His', 'Her', 'Our', 'Pdf', 'Url', 'Css', 'Api', 'Html', 'Dom',
  'From', 'With', 'Will', 'Have', 'Been', 'They', 'Them', 'Then', 'Than',
  'When', 'What', 'Who', 'How', 'Where', 'Which', 'Would', 'Could', 'Should',
  'Print', 'Page', 'Home', 'About', 'Contact', 'Login', 'Admin', 'User',
  'File', 'Data', 'Time', 'Date', 'Name', 'Type', 'Size', 'Link',
  'Student', 'Teacher', 'Class', 'Report', 'Simple', 'Review',
]);

// ============================================================
// 辅助函数
// ============================================================

/** 清洗候选名字：去掉数字后缀、下划线 */
function cleanNameCandidate(raw: string): string {
  let s = raw.replace(/\s+/g, '').replace(/[，。！？、,\.!\?]+$/, '');
  if (s.includes('_')) {
    const parts = s.split('_').filter(p => p.length >= 2 && !/^\d+$/.test(p));
    s = parts[0] || s.replace(/_/g, '');
  }
  // 去掉末尾数字
  s = s.replace(/\d+$/, '');
  // 首字母大写（英文名）
  if (/^[A-Z]/i.test(s) && s.length <= 20) {
    s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return s;
}

// 中国常见姓氏（必须以此开头才算中文名）
const CHINESE_SURNAMES = new Set(
  '李王张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文倪柳涂温薛谭向尚冉裴覃阮蓝甘梅童祝关岳樊季焦付伍牟项覃韦薄祁鲍岑霍殷翟褚聂苑'.split('')
);

/** 绝不可能是名字的常见中文词组 */
const CHINESE_NOT_NAMES = new Set([
  '罗语欣', // 老师名，排除
  '今天', '明天', '昨天', '前天', '后天', '我们', '他们', '你们', '自己',
  '可以', '没有', '什么', '怎么', '为什么', '已经', '还是', '但是',
  '因为', '所以', '虽然', '如果', '不过', '而且', '然后', '时间',
  '打印', '结束', '开始', '完成', '当前', '页面', '链接', '学生',
  '学员', '老师', '教师', '课程', '作业', '报告', '下载', '上传',
  '中英文', '英文', '中文', '音标', '部分', '全部', '系统', '首页',
  '登录', '注册', '退出', '设置', '个人', '编辑', '管理', '查看',
  '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八',
  '第几天', '第几', '几天', '多少', '几个', '这次', '那次', '上次',
  '本次', '下次', '这个', '那个', '哪个', '每个', '某个', '一些',
  '是否', '已经', '正在', '即将', '马上', '立刻', '刚刚', '刚才',
  '之前', '之后', '以内', '以外', '以上', '以下', '左边', '右边',
  '数据', '数量', '质量', '效率', '速度', '结果', '状态', '类型',
  '正确', '错误', '成功', '失败', '通过', '拒绝', '确认', '取消',
  '正常', '异常', '新增', '修改', '删除', '保存', '刷新', '返回',
  '今日', '昨日', '明日', '本周', '上周', '下周', '本月', '上月',
  '共享', '共识', '记忆', '学习', '训练', '练习', '测试', '检查',
  '发现', '显示', '隐藏', '打开', '关闭', '输入', '输出', '搜索',
  '词汇', '单词', '句子', '语法', '发音', '拼写', '阅读', '听力',
  '遗忘', '复习', '巩固', '掌握', '理解', '吸收', '正确率', '错误率',
  '遗忘率', '需要', '注意', '关注', '提醒', '通知', '消息', '记录',
  '遗忘词', '新学', '学新', '已学', '未学', '复习词', '共识记',
  '抗遗忘', '复习周期', '复习日期', '遗忘词数', '正确个数',
]);

// 常见中文名用字（名/辈分字，用于判断无姓氏的缩略名如"乐晨"）
const CHINESE_GIVEN_NAME_CHARS = new Set(
  '晨乐欣怡婷雨彤瑶琳颖萱洁涵菲琪莉莎娜媛慧敏静娟芳秀英华兰芝萍燕玲珍雪云霞月君文博浩宇轩铭哲瀚辰杰豪鹏飞龙阳辉明伟峰强涛军勇斌刚毅恒亮俊凯睿志远达晟昊然思睿宣萌菲蕊瑶彦凡可心念桐泽延嘉亦桐梦依夏春冬秋'
);

/** 判断是否像一个真实的中文名字 */
function isLikelyChineseName(s: string, allowNoSurname = false, strong = false): boolean {
  if (s.length < 2 || s.length > 4) return false;
  if (CHINESE_NOT_NAMES.has(s)) return false;

  // 首字是姓氏 → 肯定像名字
  if (CHINESE_SURNAMES.has(s[0])) return true;

  // 不允许无姓氏名
  if (!allowNoSurname) return false;

  // 高可信度场景（如"学员姓名"标签直接匹配）→ 放宽条件
  if (strong) {
    return /^[一-鿿]{2,4}$/.test(s);
  }

  // 放宽模式：2字名，两个字都在常见名字用字中
  if (s.length === 2) {
    return s.split('').every((c) => CHINESE_GIVEN_NAME_CHARS.has(c));
  }
  // 3-4字无姓氏：需要在名字用字中
  if (s.length === 3 || s.length === 4) {
    return s.split('').every((c) => CHINESE_GIVEN_NAME_CHARS.has(c));
  }
  return false;
}

/** 判断是否像一个名字（中英文通用），strong 表示高可信度匹配场景 */
function isLikelyName(s: string, strong = false): boolean {
  if (!s || s.length < 2 || s.length > 20) return false;
  // 中文名：strong 时无需姓氏验证
  if (/^[一-鿿]+$/.test(s)) return isLikelyChineseName(s, strong, strong);
  // 英文名：首字母大写，纯字母
  if (/^[A-Z][a-z]+$/.test(s)) return true;
  return false;
}
