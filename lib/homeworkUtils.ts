// ============================================================
// 课后作业链接解析工具
// ============================================================

export interface ParsedLink1 {
  mode: 'page' | 'pdf-direct';
  pageUrl?: string;
  pdfUrls?: string[];
}

/**
 * 解析课后作业 1 链接
 * - 包含多个 .pdf 的直链 → pdf-direct 模式
 * - 单个普通 URL → page 模式
 */
export function parseLink1Input(input: string): ParsedLink1 {
  const trimmed = input.trim();
  if (!trimmed) return { mode: 'page' };

  // 提取所有 http/https 开头的 URL（在换行、空格、逗号分隔的文本中）
  const urls = trimmed.match(/https?:\/\/[^\s,，\n]+/gi) || [];

  // 过滤出 PDF 直链
  const pdfUrls = urls.filter((u) => /\.pdf(\?.*)?$/i.test(u));

  // 如果有 2 个及以上 PDF 直链，走 PDF direct 模式
  if (pdfUrls.length >= 2) {
    return { mode: 'pdf-direct', pdfUrls };
  }

  // 否则走页面打印模式
  const pageUrl = urls[0] || trimmed;
  return { mode: 'page', pageUrl };
}

/** PDF direct 模式的文件名顺序 */
const PDF_NAMES = ['中英文', '英文', '中文', '音标'];

export function getPdfDirectTasks(prefix: string, pdfUrls: string[]): { name: string; url: string }[] {
  return pdfUrls.slice(0, 4).map((url, i) => ({
    name: `${prefix}-${PDF_NAMES[i] || `文件${i + 1}`}.pdf`,
    url,
  }));
}
