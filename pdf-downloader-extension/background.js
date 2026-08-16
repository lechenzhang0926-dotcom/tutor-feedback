// ============================================================
// PDF 批量下载器 — Background Service Worker
// 极简：辅助通知、跨上下文消息中继
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 中继：如果 popup 的 sendMessage 到 content script 失败，这里做 fallback
  if (message.action === 'notifyComplete') {
    const { done, failed, total } = message;
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'PDF 批量下载完成',
      message: `成功 ${done} 个` + (failed > 0 ? `，失败 ${failed} 个` : '') + `，共 ${total} 个`,
      priority: 0,
    });
    sendResponse({ success: true });
  }
  return true;
});
