// 全域變數
let translations = {};
let caseInsensitiveTranslations = {};
let translationRegex = null;
let currentMode = 'zh_only'; // 預設為中文模式
let originalTexts = new Map(); // 儲存原始文字
let isInterceptEnabled = true; // 控制是否啟用攔截

// 從 storage 載入當前模式
async function loadModeFromStorage() {
  try {
    const result = await chrome.storage.local.get('RingsDB_translate_mode');
    currentMode = result.RingsDB_translate_mode || 'zh_only';
    console.log(`從 storage 載入模式: ${currentMode}`);
    return currentMode;
  } catch (error) {
    console.error('從 storage 載入模式失敗:', error);
    currentMode = 'zh_only';
    return currentMode;
  }
}

// 保存模式到 storage
async function saveModeToStorage(mode) {
  try {
    await chrome.storage.local.set({ 'RingsDB_translate_mode': mode });
    console.log(`模式已保存到 storage: ${mode}`);
  } catch (error) {
    console.error('保存模式到 storage 失敗:', error);
  }
}

// 載入翻譯資料
async function loadTranslations() {
  try {
    const response = await fetch(chrome.runtime.getURL('translation.json'));
    translations = await response.json();

    // 創建不區分大小寫的翻譯物件
    caseInsensitiveTranslations = {};
    for (const english in translations) {
      caseInsensitiveTranslations[english.toLowerCase()] = translations[english];
    }

    // 創建正規表達式
    const sortedKeys = Object.keys(translations).sort((a, b) => b.length - a.length);
    const pattern = sortedKeys.map(key => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (/[^a-zA-Z0-9\s]/.test(key)) {
        return escapedKey;
      }
      return `\\b${escapedKey}\\b`;
    }).join('|');

    translationRegex = new RegExp(pattern, 'gi');
    console.log('RingsDB翻譯資料載入完成');
  } catch (error) {
    console.error('載入翻譯資料失敗:', error);
  }
}

// 替換文字內容的函數
function translateText(text, mode = 'zh_only') {
  if (!translationRegex || !text || mode === 'restore') return text;

  return text.replace(translationRegex, (match) => {
    const translation = caseInsensitiveTranslations[match.toLowerCase()];
    if (translation) {
      if (mode === 'zh_only') {
        return translation;
      } else if (mode === 'bilingual') {
        return `${match} (${translation})`;
      }
    }
    return match;
  });
}

// 儲存和恢復原始內容的系統
function storeOriginalText(node, originalText) {
  if (!originalTexts.has(node)) {
    originalTexts.set(node, originalText);
  }
}

function getOriginalText(node) {
  return originalTexts.get(node) || node.textContent;
}

// 攔截網路響應（支援中文和中英對照模式）
function interceptNetworkResponses() {
  // 攔截 XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._url = url;
    return originalXHROpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const xhr = this;
    this.addEventListener('readystatechange', function () {
      if (this.readyState === 4 && this.status === 200 && isInterceptEnabled &&
        (currentMode === 'zh_only' || currentMode === 'bilingual')) {
        const contentType = this.getResponseHeader('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
          const originalResponse = this.responseText;
          if (originalResponse && typeof originalResponse === 'string') {
            const translatedResponse = translateText(originalResponse, currentMode);

            // 替換 responseText
            Object.defineProperty(this, 'responseText', {
              writable: false,
              value: translatedResponse
            });
          }
        }
      }
    });

    return originalXHRSend.call(this, ...args);
  };

  // 攔截 fetch API
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    // 支援中文和中英對照模式的攔截
    if (isInterceptEnabled && (currentMode === 'zh_only' || currentMode === 'bilingual')) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        const originalText = await response.text();
        const translatedText = translateText(originalText, currentMode);

        const newResponse = new Response(translatedText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });

        return newResponse;
      }
    }

    return response;
  };
}

// 處理單個文字節點
function processTextNode(textNode, mode) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

  const currentText = textNode.textContent;
  const originalText = getOriginalText(textNode);

  let newText;
  if (mode === 'restore') {
    newText = originalText;
  } else {
    // 確保我們總是從原始文字開始翻譯
    storeOriginalText(textNode, currentText.includes('(') ? originalText : currentText);
    newText = translateText(originalText, mode);
  }

  if (newText !== currentText) {
    textNode.textContent = newText;
  }
}

// 處理元素節點
function processElementNode(element, mode) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        // 跳過腳本和樣式標籤
        const parent = node.parentElement;
        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  const textNodes = [];
  let node;

  while (node = walker.nextNode()) {
    textNodes.push(node);
  }

  textNodes.forEach(textNode => processTextNode(textNode, mode));
}

// 翻譯整個頁面
async function translatePage(mode) {
  currentMode = mode;

  // 保存模式到 storage
  await saveModeToStorage(mode);

  // 只有恢復模式才禁用攔截
  if (mode === 'restore') {
    isInterceptEnabled = false;
  } else {
    isInterceptEnabled = true;
  }

  processElementNode(document.body, mode);

  console.log(`翻譯模式已切換為: ${mode}`);
}

// MutationObserver 用於處理動態內容
function setupDOMObserver() {
  // 移除 observerTimeout 變數
  // 移除 clearTimeout(observerTimeout);
  // 移除 observerTimeout = setTimeout(() => { ... }, 100);

  const observer = new MutationObserver((mutations) => {
    // *** 翻譯邏輯現在會同步執行 ***
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            processTextNode(node, currentMode);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            // 這會處理整個新插入的 HTML 結構，包括牌庫清單
            processElementNode(node, currentMode);
          }
        });
      } else if (mutation.type === 'characterData') {
        // 處理文字內容變動
        processTextNode(mutation.target, currentMode);
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

// 監聽來自 popup 的訊息
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  switch (request.action) {
    case 'zh_only':
      await translatePage('zh_only'); sendResponse({ success: true });

      break;
    case 'bilingual':
      await translatePage('bilingual'); sendResponse({ success: true });

      break;
    case 'restore':
      await translatePage('restore'); sendResponse({ success: true });

      break;
  }
});



// 初始化腳本
async function init() {
  // 載入翻譯資料
  await loadTranslations();

  // 從 storage 載入當前模式
  await loadModeFromStorage();

  // 設置網路攔截（僅在中文模式時生效）
  interceptNetworkResponses();

  // 等待頁面載入完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(async () => {
        await translatePage(currentMode);
        setupDOMObserver();
      }, 500);
    });
  } else {
    setTimeout(async () => {
      await translatePage(currentMode);
      setupDOMObserver();
    }, 500);
  }
}

// 頁面卸載時清理資源
window.addEventListener('beforeunload', () => {
  originalTexts.clear();
});

// 啟動初始化
init();