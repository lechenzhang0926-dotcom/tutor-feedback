// ============================================================
// Tutor 课后反馈助手 — Background Service Worker
// 负责将插件数据通过 postMessage 发送到 Tutor 网站
// ============================================================

const TUTOR_URL = 'http://localhost:3000';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendToTutor') {
    sendToTutorPage(message.payload)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }
});

async function sendToTutorPage(payload) {
  // Find existing Tutor tab
  const existingTabs = await chrome.tabs.query({ url: TUTOR_URL + '/*' });

  let tab;
  if (existingTabs.length > 0) {
    tab = existingTabs[0];
    // Activate it
    await chrome.tabs.update(tab.id, { active: true });
  } else {
    // Open new tab
    tab = await chrome.tabs.create({ url: TUTOR_URL });
  }

  // Wait for the page to load
  await waitForTabLoad(tab.id);

  // Inject postMessage script into Tutor page
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (data) => {
      window.postMessage(data, window.location.origin);
    },
    args: [payload],
  });

  // Store last payload for extensions that might need to re-read
  await chrome.storage.local.set({ lastSentPayload: payload });
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tutor 页面加载超时（15秒）')), 15000);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Also check if tab is already loaded
    chrome.tabs.get(tabId).then((tab) => {
      if (tab && tab.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {});
  });
}
