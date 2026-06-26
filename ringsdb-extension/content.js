// RingsDB 简化收藏扩展 - Content Script
console.log('[RingsDB Extension] 加载中...');

// 等待页面加载完成后初始化
function initExtension() {
    console.log('[RingsDB Extension] 初始化中...');

    const currentPath = window.location.pathname;
    console.log('[RingsDB Extension] 当前路径:', currentPath);

    // 检测牌库详情页面
    if (currentPath.includes('/decklist/view/') || currentPath.includes('/deck/view/')) {
        console.log('[RingsDB Extension] 检测到牌库详情页面');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addSaveButton);
        } else {
            addSaveButton();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSelfPack);
    } else {
        initSelfPack();
    }
}

// ===== Deck Edit 页面功能 =====
function initSelfPack() {
    console.log('[RingsDB Extension] 初始化 自製PACK 功能...');
    injectScript();

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;

        if (event.data.type === 'RINGSDB_INJECT_READY') {
            console.log('[RingsDB Extension] inject.js 已就绪');
            loadAndApplyEnabledExpansions();
        } else if (event.data.type === 'RINGSDB_EXPANSIONS_APPLIED') {
            console.log('[RingsDB Extension] 扩展已应用:', event.data.count, '张卡牌');
        }
    });
}

function injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function () {
        console.log('[RingsDB Extension] inject.js 注入成功');
        script.remove();
    };
    script.onerror = function () {
        console.error('[RingsDB Extension] inject.js 注入失败');
    };
    (document.head || document.documentElement).appendChild(script);
}

// 加载并应用已启用的扩展
async function loadAndApplyEnabledExpansions() {
    try {
        console.log('[RingsDB Extension] 开始加载已启用的扩展...');

        const enabledResult = await chrome.storage.local.get('ringsdb_enabled_expansions');
        const enabledExpansions = enabledResult.ringsdb_enabled_expansions || [];

        console.log('[RingsDB Extension] 已启用的扩展:', enabledExpansions);

        if (enabledExpansions.length === 0) {
            window.postMessage({
                type: 'RINGSDB_APPLY_EXPANSIONS',
                expansionsData: []
            }, '*');
            return;
        }

        const expansionsResult = await chrome.storage.local.get('ringsdb_expansions');
        const expansions = expansionsResult.ringsdb_expansions || {};

        const expansionsData = [];

        let currentId = 500;
        let currentPosition = 5;

        enabledExpansions.forEach(expansionId => {
            const expansion = expansions[expansionId];
            if (expansion) {
                const totalCardsCount = Object.keys(expansion.cards || {}).length;

                expansionsData.push({
                    pack: {
                        code: expansion.code || 'custom',
                        name: expansion.name || '自订扩展',
                        s_name: (expansion.name || '').toLowerCase(),
                        id: currentId,
                        position: currentPosition,
                        cycle_position: 61,
                        url: "https://ringsdb.com/",
                        available: "2026-06-24",
                        known: totalCardsCount,
                        total: totalCardsCount,
                        owned: true
                    },
                    cards: expansion.cards || {}
                });

                currentId++;
                currentPosition++;
            }
        });

        console.log('[RingsDB Extension] 准备应用', expansionsData.length, '个自订卡包');
        window.postMessage({
            type: 'RINGSDB_APPLY_EXPANSIONS',
            expansionsData: expansionsData
        }, '*');

    } catch (error) {
        console.error('[RingsDB Extension] 加载扩展失败:', error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reloadExpansions' || request.action === 'expansionsUpdated') {
        loadAndApplyEnabledExpansions();
        sendResponse({ success: true });
    }
});

// ===== 牌库详情页面功能 =====
function addSaveButton() {
    console.log('[RingsDB Extension] 开始添加收藏按钮...');
    const existingButton = document.getElementById('ringsdb-save-button');
    if (existingButton) existingButton.remove();

    const insertionPoints = ['.panel-heading .btn-group', '.page-header .btn-group', '.panel-body h2', 'h1'];
    let targetElement = null;

    for (const selector of insertionPoints) {
        targetElement = document.querySelector(selector);
        if (targetElement) break;
    }

    if (!targetElement) targetElement = document.body;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'btn-group ringsdb-ext-container';
    buttonContainer.style.cssText = `margin-left: 10px; margin-top: 10px; margin-bottom: 10px;`;

    const saveButton = document.createElement('button');
    saveButton.id = 'ringsdb-save-button';
    saveButton.className = 'btn btn-primary btn-sm';
    saveButton.innerHTML = '⭐ 加进收藏';
    saveButton.addEventListener('click', handleSaveClick);

    buttonContainer.appendChild(saveButton);

    if (targetElement === document.body) {
        document.body.insertBefore(buttonContainer, document.body.firstChild);
    } else {
        targetElement.parentNode.insertBefore(buttonContainer, targetElement.nextSibling);
    }
}

// 处理收藏按钮点击事件
async function handleSaveClick() {
    const button = document.getElementById('ringsdb-save-button');
    const originalText = button.innerHTML;
    const originalClass = button.className;

    const defaultTitle = getDeckTitle() || '新扩展';
    
    // 1. 輸入與確認完整名稱
    const deckTitle = prompt("请输入自订扩展包的【完整名称】:", defaultTitle);
    if (deckTitle === null) return;
    if (!deckTitle.trim()) {
        showMessage('扩展包名称不能为空！', 'error');
        return;
    }

    // 2. 輸入與確認 Pack Code
    const defaultCode = deckTitle.trim().substring(0, 3).toUpperCase();
    const deckCode = prompt("请输入自订扩展包的【英文代号/Pack Code】\n(例如 Core, EoL, TdG 等短代码):", defaultCode);
    if (deckCode === null) return;
    if (!deckCode.trim()) {
        showMessage('Pack Code 不能为空！', 'error');
        return;
    }

    try {
        button.innerHTML = '⏳ 处理中...';
        button.className = 'btn btn-warning btn-sm';
        button.disabled = true;

        const cards = extractDeckCards();
        if (Object.keys(cards).length === 0) throw new Error('未找到任何卡牌');

        const response = await chrome.runtime.sendMessage({
            action: 'createExpansionWithCards',
            name: deckTitle.trim(),
            code: deckCode.trim(),
            cards: cards
        });

        if (response.success) {
            showMessage(`成功创建扩展 "${deckTitle.trim()}" (${deckCode.trim()})！`, 'success');
            button.innerHTML = '✅ 已收藏';
            button.className = 'btn btn-success btn-sm';
        } else {
            throw new Error(response.error || '保存失败');
        }

        setTimeout(() => {
            button.innerHTML = originalText;
            button.className = originalClass;
            button.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('[RingsDB Extension] 收藏失败:', error);
        showMessage('收藏失败: ' + error.message, 'error');
        button.innerHTML = originalText;
        button.className = originalClass;
        button.disabled = false;
    }
}

function extractDeckCards() {
    const cards = {};
    const processedHeroCodes = new Set();
    const allHeroIcons = document.querySelectorAll('.icon-hero');

    allHeroIcons.forEach((heroIcon) => {
        const parentDiv = heroIcon.parentElement;
        const cardLink = parentDiv?.querySelector('a[data-code]');
        if (cardLink) {
            const code = cardLink.dataset.code;
            const name = cardLink.textContent.trim();
            if (code && name && !processedHeroCodes.has(code)) {
                cards[code] = { name, count: 1 };
                processedHeroCodes.add(code);
            }
        }
    });

    const countElements = document.querySelectorAll('.card-count');
    countElements.forEach((countElement) => {
        const countText = countElement.textContent.trim();
        const countMatch = countText.match(/(\d+)x/);
        if (countMatch) {
            const count = parseInt(countMatch[1]);
            const container = countElement.parentElement;
            const cardLink = container.querySelector('a[data-code]');
            if (cardLink) {
                const code = cardLink.dataset.code;
                const name = cardLink.textContent.trim();
                if (code && name) {
                    if (cards[code]) {
                        cards[code].count += count;
                    } else {
                        cards[code] = { name, count };
                    }
                }
            }
        }
    });

    if (Object.keys(cards).length === 0) extractCardsFallback(cards);
    return cards;
}

function extractCardsFallback(cards) {
    const elements = document.querySelectorAll('[data-code]');
    elements.forEach(element => {
        const code = element.dataset.code;
        if (code && !cards[code]) {
            const name = element.textContent.trim() || '未知卡牌';
            cards[code] = { name, count: 1 };
        }
    });
}

function getDeckTitle() {
    const element = document.querySelector('h1, .deck-title');
    return element ? element.textContent.trim() : null;
}

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px; padding: 12px 16px; border-radius: 4px; color: white; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); opacity: 0; transform: translateX(100%); transition: all 0.3s ease; background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};`;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    setTimeout(() => { messageDiv.style.opacity = '1'; messageDiv.style.transform = 'translateX(0)'; }, 100);
    setTimeout(() => { messageDiv.style.opacity = '0'; messageDiv.style.transform = 'translateX(100%)'; setTimeout(() => messageDiv.remove(), 300); }, 3000);
}

function addCSS() {
    if (!document.getElementById('ringsdb-extension-styles')) {
        const style = document.createElement('style');
        style.id = 'ringsdb-extension-styles';
        style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
    }
}

addCSS();
initExtension();