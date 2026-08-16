// ============================================================
// PDF 批量下载器 — Content Script
// 1. 扫描页面中所有 PDF 链接
// 2. 在页面上下文中下载（避免跨域/Cookie问题）
// 3. 用 <a download> 强制指定 .pdf 文件名
// ============================================================

/**
 * 扫描页面中所有指向 PDF 的资源
 */
function scanPDFs() {
  const results = [];
  const seen = new Set();

  function resolveURL(raw) {
    try { return new URL(raw, window.location.href).href; }
    catch { return raw; }
  }

  function extractFilename(url, fallback) {
    try {
      const u = new URL(url, window.location.href);
      const path = decodeURIComponent(u.pathname);
      const segments = path.split('/').filter(Boolean);
      const last = (segments[segments.length - 1] || '').replace(/[?#].*$/, '');

      if (last.toLowerCase().endsWith('.pdf')) return last;

      const pdfMatch = last.match(/([^/?#]*\.pdf)/i);
      if (pdfMatch) return pdfMatch[1];

      const params = new URLSearchParams(u.search);
      for (const [k, v] of params) {
        if (v.toLowerCase().endsWith('.pdf')) return v;
      }

      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].toLowerCase().endsWith('.pdf')) {
          return segments[i].replace(/[?#].*$/, '');
        }
      }

      const base = last || fallback || 'document';
      return base.replace(/[<>:"/\\|?*]/g, '_') + '.pdf';
    } catch {
      return (fallback || 'document') + '.pdf';
    }
  }

  function isPDFUrl(url) {
    const lower = url.toLowerCase();
    if (lower.endsWith('.pdf')) return true;
    if (/\.pdf[?#&]/.test(lower)) return true;
    if (/\.pdf\//.test(lower)) return true;
    return false;
  }

  // 扫描 <a> 标签
  document.querySelectorAll('a[href]').forEach((a) => {
    const raw = a.getAttribute('href');
    if (!raw) return;
    const url = resolveURL(raw);
    if (!isPDFUrl(url) || seen.has(url)) return;
    seen.add(url);
    results.push({
      filename: extractFilename(url, (a.textContent || '').trim().slice(0, 100) || undefined),
      url,
      text: (a.textContent || '').trim().slice(0, 100),
      source: 'a',
    });
  });

  // 扫描 <embed>
  document.querySelectorAll('embed[src]').forEach((el) => {
    const raw = el.getAttribute('src');
    if (!raw) return;
    const url = resolveURL(raw);
    if (!isPDFUrl(url) && !raw.toLowerCase().includes('.pdf')) return;
    if (seen.has(url)) return;
    seen.add(url);
    results.push({
      filename: extractFilename(url),
      url,
      text: el.getAttribute('title') || '',
      source: 'embed',
    });
  });

  // 扫描 <iframe>
  document.querySelectorAll('iframe[src]').forEach((el) => {
    const raw = el.getAttribute('src');
    if (!raw) return;
    const url = resolveURL(raw);
    if (!isPDFUrl(url) && !raw.toLowerCase().includes('.pdf')) return;
    if (seen.has(url)) return;
    seen.add(url);
    results.push({
      filename: extractFilename(url),
      url,
      text: el.getAttribute('title') || '',
      source: 'iframe',
    });
  });

  // 扫描 <object>
  document.querySelectorAll('object[data]').forEach((el) => {
    const raw = el.getAttribute('data');
    if (!raw) return;
    const url = resolveURL(raw);
    if (!isPDFUrl(url) && !raw.toLowerCase().includes('.pdf')) return;
    if (seen.has(url)) return;
    seen.add(url);
    results.push({
      filename: extractFilename(url),
      url,
      text: el.getAttribute('title') || '',
      source: 'object',
    });
  });

  // 扫描 onclick 中的 window.open
  document.querySelectorAll('[onclick]').forEach((el) => {
    const onclick = el.getAttribute('onclick') || '';
    const match = onclick.match(/(?:window\.open|open)\s*\(\s*['"]([^'"]*\.pdf[^'"]*)['"]/i);
    if (!match) return;
    const url = resolveURL(match[1]);
    if (seen.has(url)) return;
    seen.add(url);
    results.push({
      filename: extractFilename(url, (el.textContent || '').trim().slice(0, 100) || undefined),
      url,
      text: (el.textContent || '').trim().slice(0, 100),
      source: 'onclick',
    });
  });

  // 扫描 data-href / data-url 等
  document.querySelectorAll('[data-href], [data-url], [data-file], [data-src], [data-link]').forEach((el) => {
    for (const attr of ['data-href', 'data-url', 'data-file', 'data-src', 'data-link']) {
      const raw = el.getAttribute(attr);
      if (!raw || !raw.toLowerCase().includes('.pdf')) continue;
      const url = resolveURL(raw);
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({
        filename: extractFilename(url, (el.textContent || '').trim().slice(0, 100) || undefined),
        url,
        text: (el.textContent || '').trim().slice(0, 100),
        source: attr,
      });
    }
  });

  return results;
}

// ============================================================
// 在页面上下文中下载 PDF（通过 fetch + <a download>）
// 优势：有页面 cookie，无跨域限制，文件名 100% 由我们控制
// ============================================================

/**
 * 并发下载 PDF（最多 3 个同时），每完成一个就通知 popup 更新进度
 */
async function downloadPDFs(pdfList) {
  const results = [];
  let done = 0;
  const total = pdfList.length;

  // 通知 popup 开始
  chrome.runtime.sendMessage({
    action: 'downloadProgress',
    done: 0, failed: 0, total,
    current: null,
  }).catch(() => {});

  // 并发控制
  const concurrency = 3;
  const queue = [...pdfList];

  async function worker() {
    while (queue.length > 0) {
      const pdf = queue.shift();
      try {
        const filename = forcePdfExt(pdf.filename);

        const response = await fetch(pdf.url, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(pdfBlob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }, 3000);

        done++;
        results.push({ url: pdf.url, filename, status: 'done' });
      } catch (err) {
        done++;
        results.push({ url: pdf.url, filename: pdf.filename, status: 'failed', error: err.message });
      }

      // 每完成一个都通知 popup 更新进度
      chrome.runtime.sendMessage({
        action: 'downloadProgress',
        done,
        failed: results.filter((r) => r.status === 'failed').length,
        total,
        current: results[results.length - 1],
      }).catch(() => {});
    }
  }

  // 启动多个 worker 并发下载
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

function forcePdfExt(name) {
  let cleaned = (name || 'document.pdf')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/\.(htm|html|php|asp|aspx|jsp|do|cfm|cgi|pl|py|rb|xml|json|txt)$/i, '');

  if (!cleaned.toLowerCase().endsWith('.pdf')) {
    cleaned += '.pdf';
  }
  return cleaned.slice(0, 200);
}

// ============================================================
// 消息监听：接收 popup 的指令
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scanPDFs') {
    const pdfs = scanPDFs();
    sendResponse({ pdfs });
  } else if (message.action === 'downloadPDFs') {
    // 异步下载，完成后回传结果
    downloadPDFs(message.pdfs).then((results) => {
      sendResponse({ results });
    }).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // 保持通道开启等待异步结果
  }
  return true;
});

// 兼容旧路径：暴露到全局
window.__pdfScanner = { scanPDFs };
