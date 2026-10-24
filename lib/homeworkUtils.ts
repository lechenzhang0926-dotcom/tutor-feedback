// ============================================================
// 课后作业链接解析工具
// ============================================================

/**
 * 按 URL 路径将一条作业链接路由到对应的输入框槽位。
 * 依据：link2 抗遗忘 → review-cycle-paper；link3 极简造句 → /simple；
 *       link4 句式 → syntax；其余（打印页 / PDF 直链）→ link1。
 * 用于「批量作业」粘贴多学生链接时自动归位，无需手工判断第几个作业。
 */
export function routeHomeworkLink(url: string): 'link1' | 'link2' | 'link3' | 'link4' {
  const u = url.toLowerCase();
  if (/review-cycle-paper/.test(u)) return 'link2';
  if (/simple/.test(u)) return 'link3';
  if (/syntax/.test(u)) return 'link4';
  return 'link1';
}


import * as zlib from 'zlib';

/** 作业 PDF 的四种类型 */
export type HomeworkType = '中英文' | '英文' | '中文' | '音标';

export interface ParsedLink1 {
  mode: 'page' | 'pdf-direct';
  /** 单页面链接（page 模式：打印该页 4 个版本） */
  pageUrl?: string;
  /** PDF 直链（按内容/链接识别命名） */
  pdfUrls?: string[];
  /** 多个页面链接（pdf-direct 模式：每个单独识别命名、生成 1 份） */
  pageUrls?: string[];
}

/**
 * 解析课后作业 1 链接，支持以下组合：
 * - 多个 PDF 直链 → pdf-direct（每个自动识别命名）
 * - 单个页面链接 → page（打印该页 中英文/英文/中文/音标 4 个版本）
 * - 多个不同页面链接 → pdf-direct（每个单独识别命名、生成 1 份）
 * - PDF 直链 + 页面链接混合 → pdf-direct（两者都处理）
 *
 * 关键点：URL 先去重。若用户把「同一个链接」粘了多次，去重后只剩 1 个，
 * 自动回落到「单页面 → 4 版本」老逻辑；粘的是「不同链接」才走逐个生成。
 */
export function parseLink1Input(input: string): ParsedLink1 {
  const trimmed = input.trim();
  if (!trimmed) return { mode: 'page' };

  // 提取所有 http/https 开头的 URL（换行、空格、逗号分隔），并去重
  const rawUrls = trimmed.match(/https?:\/\/[^\s,，\n]+/gi) || [];
  const urls = Array.from(new Set(rawUrls.map((u) => u.trim())));

  // 区分 PDF 直链与页面链接
  const pdfUrls = urls.filter((u) => /\.pdf(\?.*)?$/i.test(u));
  const pageUrls = urls.filter((u) => !/\.pdf(\?.*)?$/i.test(u));

  // 混合：既有 PDF 直链又有页面链接
  if (pdfUrls.length >= 1 && pageUrls.length >= 1) {
    return { mode: 'pdf-direct', pdfUrls, pageUrls };
  }
  // 仅 PDF 直链（1 个或多个）→ 按内容/链接自动识别命名
  if (pdfUrls.length >= 1) {
    return { mode: 'pdf-direct', pdfUrls };
  }
  // 没有任何可识别 URL，原样当作单页面兜底
  if (pageUrls.length === 0) {
    return { mode: 'page', pageUrl: trimmed };
  }
  // 仅 1 个页面链接 → 老逻辑：打印该页 4 个版本
  if (pageUrls.length === 1) {
    return { mode: 'page', pageUrl: pageUrls[0] };
  }
  // 多个不同页面链接 → 每个单独识别命名、生成 1 份 PDF
  return { mode: 'pdf-direct', pageUrls };
}

/**
 * 从链接 / 文件名判断作业 PDF 类型（优先，零开销）。
 * 返回 null 表示链接里没有可识别的类型字样，需要下载内容再判断。
 *
 * 匹配优先级：音标 > 中英文 > 英文 > 中文
 * （中英文同时含「中」「英」，必须放在英文/中文之前判断，否则会被抢先匹配）
 */
export function classifyLink1ByUrl(url: string): HomeworkType | null {
  const original = url;
  const lower = url.toLowerCase();

  // 文件名（去掉扩展名）+ 各 query 参数值，作为短关键词匹配域
  const pathPart = lower.split('?')[0];
  const basename = pathPart.split('/').pop() || '';
  const query = lower.includes('?') ? lower.split('?')[1] : '';
  // 把 _ 和 - 当作分隔符，使 en/zh/cn 等短码能被单词边界匹配到（如 247343_en.pdf）
  const norm = (s: string) => s.replace(/[_-]/g, ' ');
  const tokens = [norm(basename), ...query.split('&').map((s) => norm(s.split('=')[1] || ''))].join(' ');

  // 1) 音标
  if (/音标|拼音|注音|标音|语音/.test(original) || /yinbiao|yinb|phonetic|ipa|pinyin/.test(tokens)) return '音标';

  // 2) 中英文（先于 英文/中文，避免被其关键字抢先）
  if (/中英文|中英对照|双语|互译|对照/.test(original) || /bilingual|mixed|zh[-_]?en|cne|中英/.test(tokens)) return '中英文';

  // 3) 英文
  if (/英文|英语|英译|英汉|英中/.test(original) || /\beng\b|\ben\b|english/.test(tokens)) return '英文';

  // 4) 中文
  if (/中文|汉语|汉译|中译|汉字/.test(original) || /\bchn\b|\bzh\b|\bcn\b|chinese/.test(tokens)) return '中文';

  return null;
}

// IPA 字符范围（U+0250–U+02AF IPA Extensions，U+1D00–U+1DBF Phonetic Extensions）+ 常见音标相关符号（æ ŋ θ ð）
// 注意：必须带 g 标志，否则 .match() 只返回第一个匹配，会导致计数错误
const IPA_RE = /[\u0250-\u02AF\u1D00-\u1DBF\u00E6\u014B\u03B8\u00F0]/g;
const SLASH_IPA_RE = /\/[^/]*[\u0250-\u02AF\u1D00-\u1DBF\u00E6\u014B\u03B8\u00F0][^/]*\//g;

/**
 * 根据 PDF 文本内容判断类型（内容兜底）。
 * 仅靠字符比例做最佳猜测，英文/中文/中英文之间本就高度重叠，
 * 故链接识别（classifyLink1ByUrl）才是主依据，本函数仅作兜底。
 */
export function classifyByText(text: string): HomeworkType | null {
  if (!text || !text.trim()) return null;

  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const ipa = (text.match(IPA_RE) || []).length;
  const slashIpa = (text.match(SLASH_IPA_RE) || []).length;
  const ipaScore = ipa + slashIpa * 2;

  // 含音标符号且中文不多 → 音标（高置信）
  // 要求较强信号（多个 /.../ 注音 或 IPA 符号明显多于中文），避免把带发音的英文/中英文页误判为音标
  if ((ipaScore >= 3 && cjk < ipaScore) || (slashIpa >= 2 && cjk <= ipaScore * 2)) return '音标';
  // 中文 + 英文混排
  if (cjk > 0 && latin > 0) return '中英文';
  // 以中文为主
  if (cjk > latin) return '中文';
  // 以英文为主
  if (latin > 0) return '英文';

  return null;
}

/**
 * 综合「URL / 文件名」「页面标题」「页面正文」判断类型。
 * 用于「页面链接」（区别于 PDF 直链）的内容识别：
 * 先靠 URL 关键字，再靠页面标题，最后靠正文文本比例兜底。
 */
export function classifyFromTextAndUrl(
  url: string,
  pageTitle: string,
  pageText: string
): HomeworkType | null {
  return classifyLink1ByUrl(url) || classifyLink1ByUrl(pageTitle) || classifyByText(pageText);
}

// ============================================================
// 极简 PDF 文本提取（仅用于内容分类，非完整解析器）
// 解压 FlateDecode 流后用正则抽取 Tj / TJ 文本算子
// ============================================================

function unescapePdfString(s: string): string {
  return s
    .replace(/\\([nrtbf()\\])/g, (_, c) => (({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' } as Record<string, string>)[c] || c))
    .replace(/\\(\d{1,3})/g, (_, d) => String.fromCharCode(parseInt(d, 8) || 32));
}

/**
 * 解码 Tj/TJ 中的一段字符串。
 * - 自定义中文字体（Identity-H + ToUnicode 恒等映射）下，字符串是 2 字节 UTF-16BE，
 *   CID 即 Unicode 码点，需按 UTF-16BE 解码才能还原中文。
 * - 普通拉丁 PDF 按 latin1（原行为）解码。
 * 启发式：若按 UTF-16BE 解出中文字符或常见中文标点，则采用之；否则回退 latin1。
 */
function decodePdfString(s: string): string {
  const un = unescapePdfString(s);
  // 偶数长度才可能是 2 字节编码
  if (un.length >= 2 && un.length % 2 === 0) {
    let cjk = 0;
    let cjkPunct = 0;
    for (let i = 0; i + 1 < un.length; i += 2) {
      const code = (un.charCodeAt(i) << 8) | un.charCodeAt(i + 1);
      if (code >= 0x4e00 && code <= 0x9fff) cjk++;
      else if ((code >= 0x3000 && code <= 0x303f) || (code >= 0xff00 && code <= 0xffef)) cjkPunct++;
    }
    if (cjk > 0 || cjkPunct > 0) {
      let out = '';
      for (let i = 0; i + 1 < un.length; i += 2) {
        const code = (un.charCodeAt(i) << 8) | un.charCodeAt(i + 1);
        if (code !== 0) out += String.fromCharCode(code);
      }
      return out;
    }
  }
  return un;
}

function extractTextFromContent(s: string): string {
  let txt = '';
  let m: RegExpExecArray | null;

  // (...) Tj —— 普通文本
  const parenRe = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  while ((m = parenRe.exec(s))) txt += decodePdfString(m[1]) + ' ';

  // [ (..) (..) ] TJ —— 文本数组
  const tjRe = /\[([\s\S]*?)\]\s*TJ/g;
  while ((m = tjRe.exec(s))) {
    const inner = m[1];
    const pm = /\(((?:\\.|[^\\()])*)\)/g;
    let mm: RegExpExecArray | null;
    while ((mm = pm.exec(inner))) txt += decodePdfString(mm[1]) + ' ';
  }

  // <hex> Tj —— 十六进制文本
  const hexRe = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  while ((m = hexRe.exec(s))) {
    const hex = m[1].replace(/\s/g, '');
    let h = '';
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substr(i, 2), 16);
      if (!Number.isNaN(code)) h += String.fromCharCode(code);
    }
    txt += h + ' ';
  }

  return txt;
}

export function extractPdfText(buffer: Buffer): string {
  const out: string[] = [];
  const marker = Buffer.from('stream');
  const endMarker = Buffer.from('endstream');
  let idx = buffer.indexOf(marker);
  let guard = 0;
  while (idx !== -1 && guard < 5000) {
    guard++;
    let start = idx + 6;
    while (start < buffer.length && (buffer[start] === 0x0d || buffer[start] === 0x0a)) start++;
    const end = buffer.indexOf(endMarker, start);
    if (end === -1) break;
    const streamBuf = buffer.subarray(start, end);
    let data: Buffer;
    try {
      data = zlib.inflateSync(streamBuf);
    } catch {
      data = streamBuf;
    }
    out.push(extractTextFromContent(data.toString('latin1')));
    idx = buffer.indexOf(marker, end);
  }
  return out.join(' ');
}

// ============================================================
// 构建 PDF direct 任务（按识别结果命名）
// ============================================================

export function assignName(prefix: string, type: HomeworkType | null, used: Map<HomeworkType, number>, index: number): string {
  if (!type) return `${prefix}-文件${index + 1}.pdf`;
  const count = used.get(type) || 0;
  used.set(type, count + 1);
  const suffix = count === 0 ? '' : `(${count + 1})`;
  return `${prefix}-${type}${suffix}.pdf`;
}

export interface PdfTaskInput {
  name: string;
  url: string;
  /** 已下载的 PDF 内容，存在则生成时直接写入，避免重复下载 */
  buffer?: Buffer;
}

/**
 * 解析多个 PDF 直链，识别每个文件的类型并给出正确文件名。
 * 策略：先按链接/文件名识别；识别不出则下载后按内容识别。
 */
export async function classifyAndNamePdfDirect(
  prefix: string,
  pdfUrls: string[],
  used: Map<HomeworkType, number> = new Map()
): Promise<PdfTaskInput[]> {
  const urls = pdfUrls.slice(0, 4);

  // 并行下载（内容识别需要字节）
  const jobs = await Promise.all(
    urls.map(async (url) => {
      let buffer: Buffer | undefined;
      try {
        const resp = await fetch(url);
        if (resp.ok) buffer = Buffer.from(await resp.arrayBuffer());
      } catch {
        // 下载失败也继续，仅靠链接判断
      }
      return { url, buffer };
    })
  );

  return jobs.map(({ url, buffer }, i) => {
    let type: HomeworkType | null = classifyLink1ByUrl(url);
    if (!type && buffer) type = classifyByText(extractPdfText(buffer));
    return { name: assignName(prefix, type, used, i), url, buffer };
  });
}
