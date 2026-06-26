// RingsDB Extension Popup Script
// 保留翻译功能 + 扩展勾选 + 展开查看卡牌

// ============================================================
// 翻译功能部分
// ============================================================

let zhToEnMap = {};
let chineseNames = [];

async function loadCurrentMode() {
    try {
        const result = await chrome.storage.local.get('ringsdb_translate_mode');
        const currentMode = result.ringsdb_translate_mode || 'zh_only';
        updateButtonStates(currentMode);
        return currentMode;
    } catch (error) {
        console.error('载入模式失败:', error);
        updateButtonStates('zh_only');
    }
}

async function saveCurrentMode(mode) {
    try {
        await chrome.storage.local.set({ 'ringsdb_translate_mode': mode });
        console.log(`模式已保存: ${mode}`);
    } catch (error) {
        console.error('保存模式失败:', error);
    }
}

function updateButtonStates(currentMode) {
    const buttons = ['zhOnlyButton', 'bilingualButton', 'restoreButton'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.style.backgroundColor = '';
            btn.style.color = '';
            btn.className = '';
        }
    });

    const buttonMap = {
        'zh_only': 'zhOnlyButton',
        'bilingual': 'bilingualButton',
        'restore': 'restoreButton'
    };

    const activeButton = document.getElementById(buttonMap[currentMode]);
    if (activeButton) {
        activeButton.style.backgroundColor = '#4CAF50';
        activeButton.style.color = 'white';
        activeButton.className = 'active';
    }
}

async function loadZhToEnMap() {
    try {
        const response = await fetch(chrome.runtime.getURL('translation.json'));
        const enToZh = await response.json();
        zhToEnMap = {};
        for (const en in enToZh) {
            zhToEnMap[enToZh[en]] = en;
        }
        for (const en in enToZh) {
            zhToEnMap[en] = enToZh[en];
        }
        chineseNames = Object.keys(zhToEnMap);
        console.log('[Popup] 翻译资料载入完成，共 ' + chineseNames.length + ' 条');
    } catch (error) {
        console.error('载入翻译资料失败:', error);
    }
}

function handleQuery() {
    const chineseNameInput = document.getElementById('chineseNameInput');
    const resultDiv = document.getElementById('resultDiv');
    const query = chineseNameInput.value.trim();
    resultDiv.innerHTML = '';
    if (!query) {
        resultDiv.textContent = '请输入卡牌名称。';
        return;
    }
    const englishName = zhToEnMap[query];
    if (englishName) {
        resultDiv.innerHTML = englishName;
    } else {
        resultDiv.innerHTML = `未找到: 「${query}」`;
    }
}

function setupAutocomplete() {
    const chineseNameInput = document.getElementById('chineseNameInput');
    const autocompleteList = document.getElementById('autocompleteList');
    if (!chineseNameInput || !autocompleteList) return;

    chineseNameInput.addEventListener('input', function () {
        const query = this.value.trim();
        autocompleteList.innerHTML = '';
        if (query.length < 1) {
            autocompleteList.style.display = 'none';
            return;
        }
        const filteredNames = chineseNames.filter(name => name.includes(query)).slice(0, 5);
        if (filteredNames.length > 0) {
            filteredNames.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                li.addEventListener('click', () => {
                    chineseNameInput.value = name;
                    autocompleteList.innerHTML = '';
                    autocompleteList.style.display = 'none';
                    handleQuery();
                });
                autocompleteList.appendChild(li);
            });
            autocompleteList.style.display = 'block';
        } else {
            autocompleteList.style.display = 'none';
        }
    });

    document.addEventListener('click', function (e) {
        if (e.target !== chineseNameInput) {
            autocompleteList.style.display = 'none';
        }
    });
}

function handleBatchTranslate() {
    const decklistInput = document.getElementById('decklistInput');
    const batchResultDiv = document.getElementById('batchResultDiv');
    const inputText = decklistInput.value.trim();
    if (!inputText) {
        batchResultDiv.textContent = '请输入牌表内容。';
        return;
    }

    const sourceMap = zhToEnMap;
    const lines = inputText.split('\n').filter(line => line.trim() !== '');
    const translatedLines = [];
    const sortedKeys = Object.keys(sourceMap).sort((a, b) => b.length - a.length);

    lines.forEach(line => {
        let tempLine = line;
        const tempMap = {};
        sortedKeys.forEach((sourceName, idx) => {
            const translatedName = sourceMap[sourceName];
            const placeholder = `__TMP_${idx}__`;
            const regex = new RegExp(`(?<!\\S)${sourceName}(?!\\S)`, 'g');
            if (regex.test(tempLine)) {
                tempMap[placeholder] = translatedName;
                tempLine = tempLine.replace(regex, placeholder);
            }
        });
        Object.keys(tempMap).forEach(placeholder => {
            tempLine = tempLine.replace(new RegExp(placeholder, 'g'), tempMap[placeholder]);
        });
        translatedLines.push(tempLine);
    });

    if (translatedLines.length > 0) {
        batchResultDiv.textContent = translatedLines.join('\n');
    } else {
        batchResultDiv.textContent = '无法识别任何有效的牌表行。';
    }
}

async function handleTranslationModeChange(mode) {
    await saveCurrentMode(mode);
    updateButtonStates(mode);
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.url.includes('ringsdb.com')) {
            await chrome.tabs.sendMessage(tab.id, { action: mode });
        }
    } catch (error) {
        console.log('[Popup] 页面更新失败:', error);
    }
}

// ============================================================
// 扩展列表部分
// ============================================================

let allPackData = {};

// 加载并显示扩展列表
async function loadPacks() {
    const packList = document.getElementById('packList');
    packList.innerHTML = '<div class="empty-state">加载中...</div>';

    try {
        const response = await chrome.runtime.sendMessage({ action: 'getPackData' });

        if (!response.success) {
            packList.innerHTML = `<div class="empty-state">❌ 加载失败: ${response.error}</div>`;
            return;
        }

        allPackData = response.data;
        const enabledPacks = response.enabledPacks || [];

        const packNames = Object.keys(allPackData);
        if (packNames.length === 0) {
            packList.innerHTML = '<div class="empty-state">📭 没有找到任何扩展包</div>';
            return;
        }

        let html = '';
        // 按 pack 的 id 排序
        const sortedPacks = packNames.sort((a, b) => {
            const idA = allPackData[a].pack.id || 0;
            const idB = allPackData[b].pack.id || 0;
            return idA - idB;
        });

        sortedPacks.forEach(packName => {
            const packContent = allPackData[packName];
            const pack = packContent.pack;
            const cards = packContent.cards || {};
            const cardCount = Object.keys(cards).length;
            const isEnabled = enabledPacks.includes(pack.code);
            const packKey = pack.code || packName;

            html += `
                <div class="pack-item" data-pack-key="${packKey}">
                    <div class="pack-header" data-pack-key="${packKey}">
                        <input type="checkbox" 
                               class="pack-checkbox" 
                               data-pack-key="${packKey}"
                               ${isEnabled ? 'checked' : ''}
                               title="在 RingsDB 页面启用此扩展包">
                        <span class="pack-name ${isEnabled ? 'enabled' : ''}">
                            ${escapeHtml(pack.name || packName)}
                            <span class="pack-code">(${escapeHtml(pack.code)})</span>
                        </span>
                        <span class="pack-count">${cardCount}</span>
                        <span class="expand-icon">▶</span>
                    </div>
                    <div class="pack-cards" data-pack-key="${packKey}">
                        ${renderCardList(cards)}
                    </div>
                </div>
            `;
        });

        packList.innerHTML = html;

        // 绑定 checkbox 事件
        packList.querySelectorAll('.pack-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', handlePackToggle);
            // 阻止点击 checkbox 时触发展开
            checkbox.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        });

        // 绑定 header 点击展开事件
        packList.querySelectorAll('.pack-header').forEach(header => {
            header.addEventListener('click', handlePackHeaderClick);
        });

    } catch (error) {
        console.error('[Popup] 加载扩展列表失败:', error);
        packList.innerHTML = `<div class="empty-state">❌ 加载失败: ${error.message}</div>`;
    }
}

// 渲染卡牌列表
function renderCardList(cards) {
    const cardEntries = Object.entries(cards);
    if (cardEntries.length === 0) {
        return '<div class="empty-state">此扩展包暂无卡牌</div>';
    }

    // 按卡牌 code 排序
    cardEntries.sort((a, b) => {
        const codeA = parseInt(a[0]) || 0;
        const codeB = parseInt(b[0]) || 0;
        return codeA - codeB;
    });

    return cardEntries.map(([code, card]) => {
        const cardName = card.name || card.card_name || code;
        return `
            <div class="card-item">
                <span class="card-code">${escapeHtml(code)}</span>
                <span class="card-name">${escapeHtml(cardName)}</span>
            </div>
        `;
    }).join('');
}

// 切换扩展启用状态
async function handlePackToggle(e) {
    e.stopPropagation(); // 阻止冒泡
    const checkbox = e.target;
    const packKey = checkbox.getAttribute('data-pack-key');
    const isEnabled = checkbox.checked;

    console.log('[Popup] 切换扩展:', packKey, isEnabled);

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'toggleExpansion',
            packCode: packKey
        });

        if (response.success) {
            // 更新样式
            const packItem = checkbox.closest('.pack-item');
            const nameSpan = packItem.querySelector('.pack-name');
            if (isEnabled) {
                nameSpan.classList.add('enabled');
            } else {
                nameSpan.classList.remove('enabled');
            }

            showNotification(isEnabled ? `已启用: ${packKey}` : `已禁用: ${packKey}`, 'success');
        } else {
            showNotification('操作失败: ' + response.error, 'error');
            checkbox.checked = !isEnabled;
        }
    } catch (error) {
        console.error('[Popup] 切换失败:', error);
        showNotification('操作失败: ' + error.message, 'error');
        checkbox.checked = !isEnabled;
    }
}

// 点击 header 展开/收起卡牌列表
function handlePackHeaderClick(e) {
    // 如果点击的是 checkbox，不处理
    if (e.target.classList.contains('pack-checkbox')) return;

    const header = e.currentTarget;
    const packKey = header.getAttribute('data-pack-key');
    const packItem = header.closest('.pack-item');
    const cardsContainer = packItem.querySelector('.pack-cards');
    const expandIcon = header.querySelector('.expand-icon');

    if (cardsContainer.classList.contains('show')) {
        // 收起
        cardsContainer.classList.remove('show');
        expandIcon.classList.remove('expanded');
    } else {
        // 展开 - 先收起其他所有
        document.querySelectorAll('.pack-cards.show').forEach(el => {
            el.classList.remove('show');
        });
        document.querySelectorAll('.expand-icon.expanded').forEach(el => {
            el.classList.remove('expanded');
        });

        cardsContainer.classList.add('show');
        expandIcon.classList.add('expanded');
    }
}

// 重新加载并应用到页面
async function refreshAndApply() {
    try {
        // 先重新加载列表
        await loadPacks();

        // 通知所有 ringsdb 页面重新加载
        const tabs = await chrome.tabs.query({ url: 'https://*.ringsdb.com/*' });
        if (tabs.length === 0) {
            showNotification('没有打开的 RingsDB 页面', 'info');
            return;
        }

        for (const tab of tabs) {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'reloadExpansions' });
            } catch (err) {
                // 忽略
            }
        }

        showNotification(`已通知 ${tabs.length} 个页面重新加载`, 'success');
    } catch (error) {
        console.error('[Popup] 刷新失败:', error);
        showNotification('刷新失败: ' + error.message, 'error');
    }
}

// ============================================================
// 工具函数
// ============================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const existing = document.querySelector('.popup-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'popup-notification';
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
        color: white;
        padding: 10px 16px;
        border-radius: 6px;
        font-size: 13px;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        opacity: 0;
        transition: all 0.3s ease;
        max-width: 300px;
        text-align: center;
        pointer-events: none;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    }, 50);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 翻译功能
    await loadCurrentMode();
    await loadZhToEnMap();
    setupAutocomplete();

    document.getElementById('zhOnlyButton')?.addEventListener('click', () => handleTranslationModeChange('zh_only'));
    document.getElementById('bilingualButton')?.addEventListener('click', () => handleTranslationModeChange('bilingual'));
    document.getElementById('restoreButton')?.addEventListener('click', () => handleTranslationModeChange('restore'));
    document.getElementById('queryButton')?.addEventListener('click', handleQuery);
    document.getElementById('batchTranslateButton')?.addEventListener('click', handleBatchTranslate);

    // 扩展列表
    await loadPacks();

    document.getElementById('refreshPacksBtn')?.addEventListener('click', refreshAndApply);

    // 监听 storage 变化
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.ringsdb_enabled_packs) {
            console.log('[Popup] 检测到启用列表变化，刷新列表');
            loadPacks();
        }
    });

    console.log('[RingsDB Extension] Popup 页面已加载');
});