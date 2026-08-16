// ============================================================
// PDF 批量下载器 — Popup Script
// ============================================================

const listContainer = document.getElementById('listContainer');
const emptyState = document.getElementById('emptyState');
const countBadge = document.getElementById('countBadge');
const searchInput = document.getElementById('searchInput');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnInvert = document.getElementById('btnInvert');
const btnRefresh = document.getElementById('btnRefresh');
const btnScan = document.getElementById('btnScan');
const btnDownload = document.getElementById('btnDownload');
const btnLabel = document.querySelector('.btn-label');
const selectedCountEl = document.getElementById('selectedCount');

let allPDFs = [];
let selectedSet = new Set();

// ---- Init ----
(async function init() {
  // 监听 content script 发来的下载进度
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'downloadProgress') {
      updateDownloadProgress(msg);
    }
  });

  await scanPage();
})();

// ---- Event listeners ----
btnScan.addEventListener('click', scanPage);
btnRefresh.addEventListener('click', scanPage);

searchInput.addEventListener('input', () => renderList());

btnSelectAll.addEventListener('click', () => {
  const filtered = getFilteredPDFs();
  if (selectedSet.size === filtered.length && filtered.length > 0) {
    filtered.forEach((p) => selectedSet.delete(p.url));
  } else {
    filtered.forEach((p) => selectedSet.add(p.url));
  }
  renderList();
});

btnInvert.addEventListener('click', () => {
  getFilteredPDFs().forEach((p) => {
    if (selectedSet.has(p.url)) selectedSet.delete(p.url);
    else selectedSet.add(p.url);
  });
  renderList();
});

btnDownload.addEventListener('click', async () => {
  const selected = allPDFs.filter((p) => selectedSet.has(p.url));
  if (selected.length === 0) {
    showToast('请先选择要下载的 PDF');
    return;
  }

  btnDownload.disabled = true;
  btnLabel.textContent = '⬇ 下载中';
  selectedCountEl.textContent = `(0/${selected.length})`;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('无法获取标签页');

    // 发消息给 content script（不 await，让进度消息异步回传）
    chrome.tabs.sendMessage(tab.id, {
      action: 'downloadPDFs',
      pdfs: selected.map((p) => ({ filename: p.filename, url: p.url })),
    }).then((resp) => {
      // 全部完成
      if (resp && resp.results) {
        const failed = resp.results.filter((r) => r.status === 'failed').length;
        const doneCount = resp.results.length - failed;
        if (failed > 0) {
          showToast(`全部完成：${doneCount} 成功，${failed} 失败`);
        } else {
          showToast(`全部下载完成！${doneCount} 个 PDF`);
        }
        // 通知后台发系统通知
        chrome.runtime.sendMessage({
          action: 'notifyComplete',
          done: doneCount,
          failed,
          total: resp.results.length,
        }).catch(() => {});
      }
      btnDownload.disabled = false;
      updateDownloadButton();
    }).catch((e) => {
      showToast('下载失败：' + e.message);
      btnDownload.disabled = false;
      updateDownloadButton();
    });
  } catch (e) {
    showToast('下载出错：' + e.message);
    btnDownload.disabled = false;
    updateDownloadButton();
  }
});

// ---- Scan page ----
async function scanPage() {
  btnScan.textContent = '⏳ 扫描中…';
  btnScan.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('无法获取当前标签页');

    // 向 content script 发消息（content script 在 manifest 中声明了 document_idle 自动注入）
    let resp;
    try {
      resp = await chrome.tabs.sendMessage(tab.id, { action: 'scanPDFs' });
    } catch {
      // content script 可能还未注入，手动注入
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      resp = await chrome.tabs.sendMessage(tab.id, { action: 'scanPDFs' });
    }

    if (resp && resp.pdfs) {
      allPDFs = resp.pdfs;
      selectedSet = new Set(allPDFs.map((p) => p.url));
      if (allPDFs.length > 0) {
        showToast(`找到 ${allPDFs.length} 个 PDF 文件`);
      }
    } else {
      allPDFs = [];
    }
  } catch (e) {
    allPDFs = [];
    showToast('扫描出错：' + e.message);
  }

  btnScan.textContent = '🔍 扫描页面';
  btnScan.disabled = false;
  renderList();
}

// ---- Render ----
function getFilteredPDFs() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return allPDFs;
  return allPDFs.filter(
    (p) => p.filename.toLowerCase().includes(query) || p.url.toLowerCase().includes(query)
  );
}

function renderList() {
  const filtered = getFilteredPDFs();
  countBadge.textContent = allPDFs.length;
  updateDownloadButton();

  if (allPDFs.length === 0) {
    listContainer.innerHTML = '';
    listContainer.appendChild(emptyState);
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔎</div>
        <div class="msg">没有匹配的 PDF</div>
        <div class="hint">尝试调整搜索关键词</div>
      </div>`;
    return;
  }

  let html = '';
  for (const pdf of filtered) {
    const isSelected = selectedSet.has(pdf.url);
    const urlPreview = pdf.url.length > 60 ? pdf.url.slice(0, 60) + '…' : pdf.url;
    const sourceLabel = pdf.source !== 'a' ? ` · ${pdf.source}` : '';

    html += `
      <div class="pdf-item ${isSelected ? 'selected' : ''}" data-url="${escapeAttr(pdf.url)}">
        <input type="checkbox" ${isSelected ? 'checked' : ''} data-url="${escapeAttr(pdf.url)}" />
        <div class="info">
          <div class="filename">📄 ${escapeHtml(pdf.filename)}</div>
          <div class="url-preview" title="${escapeAttr(pdf.url)}">${escapeHtml(urlPreview)}</div>
          ${pdf.text ? `<div class="meta">${escapeHtml(pdf.text.slice(0, 60))}${sourceLabel}</div>` : ''}
        </div>
        <a class="open-link" href="${escapeAttr(pdf.url)}" target="_blank" title="在新标签页打开" data-action="open">↗</a>
      </div>`;
  }
  listContainer.innerHTML = html;

  listContainer.querySelectorAll('.pdf-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="open"]')) return;
      if (e.target.tagName === 'INPUT') return;
      const url = item.dataset.url;
      const checkbox = item.querySelector('input[type="checkbox"]');
      if (selectedSet.has(url)) {
        selectedSet.delete(url);
        checkbox.checked = false;
        item.classList.remove('selected');
      } else {
        selectedSet.add(url);
        checkbox.checked = true;
        item.classList.add('selected');
      }
      updateDownloadButton();
    });
  });

  listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const url = cb.dataset.url;
      if (cb.checked) {
        selectedSet.add(url);
        cb.closest('.pdf-item')?.classList.add('selected');
      } else {
        selectedSet.delete(url);
        cb.closest('.pdf-item')?.classList.remove('selected');
      }
      updateDownloadButton();
    });
  });

  listContainer.querySelectorAll('[data-action="open"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.tabs.create({ url: link.getAttribute('href') });
    });
  });
}

function updateDownloadButton() {
  const count = allPDFs.filter((p) => selectedSet.has(p.url)).length;
  btnLabel.textContent = '⬇ 下载选中';
  selectedCountEl.textContent = count;
  btnDownload.disabled = count === 0;
}

// ---- Download progress（实时更新） ----
function updateDownloadProgress(msg) {
  const { done, failed, total, current } = msg;

  // 更新按钮文字
  btnLabel.textContent = '⬇ 下载中';
  selectedCountEl.textContent = `(${done}/${total})`;

  // 更新列表中对应项的状态
  if (current) {
    const item = listContainer.querySelector(`[data-url="${escapeAttr(current.url)}"]`);
    if (item) {
      const infoDiv = item.querySelector('.info');
      if (infoDiv) {
        const oldStatus = infoDiv.querySelector('.dl-status');
        if (oldStatus) oldStatus.remove();

        const el = document.createElement('div');
        el.className = 'dl-status';
        if (current.status === 'done') {
          el.style.cssText = 'font-size:10px;color:#27ae60;margin-top:2px;';
          el.textContent = `✅ 已下载 (${current.filename})`;
        } else {
          el.style.cssText = 'font-size:10px;color:#c0392b;margin-top:2px;';
          el.textContent = '❌ ' + (current.error || '失败');
        }
        infoDiv.appendChild(el);
      }
    }
  }
}

// ---- Utilities ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
