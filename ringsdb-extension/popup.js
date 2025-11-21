// RingsDB Extension Popup Script
// 处理扩展弹窗的交互逻辑
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
    // 重置所有按钮样式
    document.getElementById('zhOnlyButton').style.backgroundColor = '';
    document.getElementById('zhOnlyButton').style.color = '';
    document.getElementById('bilingualButton').style.backgroundColor = '';
    document.getElementById('bilingualButton').style.color = '';
    document.getElementById('restoreButton').style.backgroundColor = '';
    document.getElementById('restoreButton').style.color = '';

    // 高亮当前模式按钮
    const buttonMap = {
        'zh_only': 'zhOnlyButton',
        'bilingual': 'bilingualButton',
        'restore': 'restoreButton'
    };

    const activeButton = document.getElementById(buttonMap[currentMode]);
    if (activeButton) {
        activeButton.style.backgroundColor = '#4CAF50';
        activeButton.style.color = 'white';
    }
}

// ===================================================================
// B. 中文查询工具逻辑 (单卡查询)
// ===================================================================

// 载入中文查询资料 (只建立 中文到英文 的映射)
async function loadZhToEnMap() {
    try {
        const response = await fetch(chrome.runtime.getURL('translation.json'));
        const enToZh = await response.json(); // 这是原始的 英文 Key -> 中文 Value 映射

        // 反转映射以建立 中文到英文 映射 (zhToEnMap)
        zhToEnMap = {};
        for (const en in enToZh) {
            // 将中文名 (Value) 作为 Key，英文名 (Key) 作为 Value
            zhToEnMap[enToZh[en]] = en;
        } for (const en in enToZh) {
            // 将中文名 (Value) 作为 Key，英文名 (Key) 作为 Value
            zhToEnMap[en] = enToZh[en];
        }

        chineseNames = Object.keys(zhToEnMap); // 用于单卡查询的自动完成
        // console.log('[Popup] 翻译资料载入完成，共有 ' + chineseNames.length + ' 条卡牌名称。');
    } catch (error) {
        console.error('载入翻译资料失败:', error);
    }
}

// 处理单卡查询按钮点击
function handleQuery() {
    const chineseNameInput = document.getElementById('chineseNameInput');
    const resultDiv = document.getElementById('resultDiv');
    const query = chineseNameInput.value.trim();

    resultDiv.innerHTML = '';

    if (!query) {
        resultDiv.textContent = '请输入卡牌名称。';
        return;
    }

    // 从中文到英文的映射表中查询
    const englishName = zhToEnMap[query];

    if (englishName) {
        resultDiv.innerHTML = `${englishName}`;
    } else {
        resultDiv.innerHTML = `未找到: 「${query}」`;
    }
}

// 设置自动完成功能
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

        const filteredNames = chineseNames.filter(name => name.includes(query)).slice(0, 5); // 只显示前 5 个

        if (filteredNames.length > 0) {
            filteredNames.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                li.addEventListener('click', () => {
                    chineseNameInput.value = name;
                    autocompleteList.innerHTML = '';
                    autocompleteList.style.display = 'none';
                    handleQuery(); // 自动完成后执行查询
                });
                autocompleteList.appendChild(li);
            });
            autocompleteList.style.display = 'block';
        } else {
            autocompleteList.style.display = 'none';
        }
    });

    // 点击外部关闭列表
    document.addEventListener('click', function (e) {
        if (e.target !== chineseNameInput) {
            autocompleteList.style.display = 'none';
        }
    });
}

// ===================================================================
// C. 牌表批量翻译逻辑 (中文转英文)
// ===================================================================

/**
 * 处理多行中文牌表输入，并翻译成英文。
 */
function handleBatchTranslate() {
    const decklistInput = document.getElementById('decklistInput');
    const batchResultDiv = document.getElementById('batchResultDiv');
    const inputText = decklistInput.value.trim();

    if (!inputText) {
        batchResultDiv.textContent = '请输入牌表内容。';
        return;
    }

    const sourceMap = zhToEnMap;
    const sourceLangName = '中文';
    const targetLangName = '英文';

    // 将输入拆分成行
    const lines = inputText.split('\n').filter(line => line.trim() !== '');
    const translatedLines = [];

    // 先排序 key，长的优先（最大匹配原则）
    const sortedKeys = Object.keys(sourceMap).sort((a, b) => b.length - a.length);

    lines.forEach(line => {
        let tempLine = line;
        const tempMap = {}; // 原名 → 暂时标记

        sortedKeys.forEach((sourceName, idx) => {
            const translatedName = sourceMap[sourceName];
            const placeholder = `__TMP_${idx}__`; // 临时标记

            const regex = new RegExp(`(?<!\\S)${sourceName}(?!\\S)`, 'g');
            if (regex.test(tempLine)) {
                tempMap[placeholder] = translatedName;
                tempLine = tempLine.replace(regex, placeholder);
            }
        });

        // 最后再把标记换成翻译
        Object.keys(tempMap).forEach(placeholder => {
            tempLine = tempLine.replace(new RegExp(placeholder, 'g'), tempMap[placeholder]);
        });

        translatedLines.push(tempLine);
    });


    // 显示结果
    if (translatedLines.length > 0) {
        const resultText = translatedLines.join('\n');
        batchResultDiv.textContent = resultText;

        if (resultText.trim() === inputText.trim()) {
            batchResultDiv.textContent += `\n\n(提示: 所有行均未找到 ${sourceLangName} 到 ${targetLangName} 的翻译)`;
        }
    } else {
        batchResultDiv.textContent = '无法识别任何有效的牌表行。';
    }

}

async function handleTranslationModeChange(mode) {
    // 1. 永遠執行：儲存模式到 Storage
    await saveCurrentMode(mode);

    // 2. 永遠執行：更新 Popup 介面按鈕狀態

    // 3. 嘗試發送訊息給內容腳本 (在 RingsDB 頁面才嘗試)
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        // 檢查 tab 是否存在且網址是否包含 ringsdb.com
        if (tab && tab.url && tab.url.includes('ringsdb.com')) {
            // *** 在 RingsDB 頁面：發送訊息給 content2.js 觸發即時翻譯 ***
            updateButtonStates(mode);
            await chrome.tabs.sendMessage(tab.id, { action: mode });
            showSuccess(`已切換至 ${mode} 模式並更新頁面。`);
        } else {
            // *** 在其他頁面：只顯示儲存成功 ***
            showError(`只在 RingsDB 頁面時才能設定。`);
        }
    } catch (error) {
        // 捕捉因內容腳本未載入或連線中斷而發生的錯誤 (即您看到的 [object Object] 錯誤)
        // 由於 storage 已更新，我們只需給出提示
        console.error('[Popup] 即時更新頁面失敗:', error);
        showSuccess(`模式已儲存為 ${mode}。但即時更新頁面失敗，請重新載入 RingsDB 頁面。`);
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentMode();
    await loadZhToEnMap();
    setupAutocomplete();
    document.getElementById('zhOnlyButton')?.addEventListener('click', () => handleTranslationModeChange('zh_only'));
    document.getElementById('bilingualButton')?.addEventListener('click', () => handleTranslationModeChange('bilingual'));
    document.getElementById('restoreButton')?.addEventListener('click', () => handleTranslationModeChange('restore'));

    // 5. 绑定中文查询工具事件 (单卡查询)
    document.getElementById('queryButton')?.addEventListener('click', handleQuery);

    // 6. 绑定牌表批量翻译事件 (中文 → 英文)
    document.getElementById('batchTranslateButton')?.addEventListener('click', handleBatchTranslate);

    console.log('[RingsDB Extension] Popup 页面已加载');

    // 绑定事件监听器
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('clearDataBtn').addEventListener('click', clearData);
    document.getElementById('importFile').addEventListener('change', handleImportFile);

    // JSON模态框事件
    document.getElementById('jsonModalClose').addEventListener('click', hideJsonModal);
    document.getElementById('jsonModalCloseFooter').addEventListener('click', hideJsonModal);
    document.getElementById('copyJsonBtn').addEventListener('click', copyJsonToClipboard);

    // 点击模态框背景关闭
    document.getElementById('jsonModal').addEventListener('click', (e) => {
        if (e.target.id === 'jsonModal') {
            hideJsonModal();
        }
    });

    // 监听来自 background 的更新通知
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'expansionsUpdated') {
            console.log('[RingsDB Extension] 收到扩展更新通知，刷新列表');
            loadExpansions();
        }
    });

    // 监听 storage 变化（更可靠的方式）
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.ringsdb_expansions) {
            console.log('[RingsDB Extension] 检测到扩展数据变化，刷新列表');
            loadExpansions();
        }
    });

    // 加载扩展列表
    loadExpansions();
});

// 加载扩展列表
async function loadExpansions() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getExpansions' });

        if (response.success) {
            await updateExpansionsDisplay(response.data);
        } else {
            console.error('[RingsDB Extension] 获取扩展失败:', response.error);
            showError('获取扩展失败: ' + response.error);
        }
    } catch (error) {
        console.error('[RingsDB Extension] 通信失败:', error);
        showError('通信失败: ' + error.message);
    }
}

// 更新扩展显示
async function updateExpansionsDisplay(expansions) {
    const expansionContainer = document.getElementById('expansionList');
    const expansionCount = Object.keys(expansions).length;

    if (expansionCount === 0) {
        expansionContainer.innerHTML = '<div class="empty-state">暂无扩展，请在牌库详情页面使用"⭐ 加进收藏"按钮添加</div>';
        return;
    }

    // 获取已启用的扩展列表
    const result = await chrome.storage.local.get('ringsdb_enabled_expansions');
    const enabledExpansions = result.ringsdb_enabled_expansions || [];

    console.log('[RingsDB Extension] 已启用的扩展:', enabledExpansions);

    // 按创建时间降序排列
    const sortedExpansions = Object.entries(expansions)
        .sort((a, b) => new Date(b[1].created) - new Date(a[1].created));

    const expansionItems = sortedExpansions.map(([expansionId, expansion]) => {
        const cardCount = Object.values(expansion.cards || {})
            .reduce((sum, card) => sum + card.count, 0);

        const isEnabled = enabledExpansions.includes(expansionId);

        return `
            <div class="expansion-item" data-expansion-id="${expansionId}">
                <div class="expansion-header">
                    <div class="expansion-left">
                        <input type="checkbox" 
                               class="expansion-checkbox" 
                               data-expansion-id="${expansionId}"
                               ${isEnabled ? 'checked' : ''}
                               title="在 Deck Edit 页面启用此扩展">
                        <span class="expansion-name ${isEnabled ? 'enabled' : ''}">${escapeHtml(expansion.name || '未命名扩展')}</span>
                    </div>
                    <span class="expansion-count">${cardCount}</span>
                </div>
                <div class="expansion-actions">
                    <button class="expansion-btn view" data-expansion-id="${expansionId}">查看卡牌</button>
                    <button class="expansion-btn rename" data-expansion-id="${expansionId}">重命名</button>
                    <button class="expansion-btn delete" data-expansion-id="${expansionId}">删除</button>
                </div>
                <div class="expansion-cards-container" id="cards-${expansionId}"></div>
            </div>
        `;
    }).join('');

    expansionContainer.innerHTML = expansionItems;

    // 绑定按钮事件
    expansionContainer.querySelectorAll('.expansion-btn').forEach(button => {
        button.addEventListener('click', handleExpansionAction);
    });

    // 绑定 checkbox 事件
    expansionContainer.querySelectorAll('.expansion-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleExpansionToggle);
    });
}

// 处理扩展操作
async function handleExpansionAction(e) {
    const button = e.target;
    const expansionId = button.getAttribute('data-expansion-id');

    if (button.classList.contains('view')) {
        await toggleExpansionCards(expansionId);
    } else if (button.classList.contains('rename')) {
        await renameExpansion(expansionId);
    } else if (button.classList.contains('delete')) {
        await deleteExpansion(expansionId);
    }
}

// 处理扩展启用/禁用
async function handleExpansionToggle(e) {
    const checkbox = e.target;
    const expansionId = checkbox.getAttribute('data-expansion-id');
    const isEnabled = checkbox.checked;

    console.log('[RingsDB Extension] 切换扩展状态:', expansionId, isEnabled);

    try {
        // 获取当前已启用的扩展列表
        const result = await chrome.storage.local.get('ringsdb_enabled_expansions');
        let enabledExpansions = result.ringsdb_enabled_expansions || [];

        console.log('[RingsDB Extension] 当前已启用:', enabledExpansions);

        if (isEnabled) {
            // 添加到已启用列表
            if (!enabledExpansions.includes(expansionId)) {
                enabledExpansions.push(expansionId);
            }
        } else {
            // 从已启用列表移除
            enabledExpansions = enabledExpansions.filter(id => id !== expansionId);
        }

        console.log('[RingsDB Extension] 更新后已启用:', enabledExpansions);

        // 保存到 storage
        await chrome.storage.local.set({ ringsdb_enabled_expansions: enabledExpansions });

        console.log('[RingsDB Extension] 已保存到 storage');

        // 更新扩展名称样式
        const nameElement = checkbox.nextElementSibling;
        if (isEnabled) {
            nameElement.classList.add('enabled');
        } else {
            nameElement.classList.remove('enabled');
        }

        // 立即通知所有 deck edit 页面重新加载扩展
        await notifyDeckEditPages();

        showSuccess(isEnabled ? '扩展已启用' : '扩展已禁用');

    } catch (error) {
        console.error('[RingsDB Extension] 切换扩展状态失败:', error);
        showError('切换失败: ' + error.message);
        // 恢复 checkbox 状态
        checkbox.checked = !isEnabled;
    }
}

// 通知所有 deck edit 页面重新加载扩展
async function notifyDeckEditPages() {
    try {
        console.log('[RingsDB Extension] 查询 deck edit 页面...');

        const tabs = await chrome.tabs.query({ url: 'https://ringsdb.com/deck/edit/*' });

        console.log('[RingsDB Extension] 找到', tabs.length, '个 deck edit 页面');

        if (tabs.length === 0) {
            console.log('[RingsDB Extension] 没有打开的 deck edit 页面');
            return;
        }

        for (const tab of tabs) {
            try {
                console.log('[RingsDB Extension] 向标签页发送消息:', tab.id);

                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'reloadExpansions'
                });

                console.log('[RingsDB Extension] 标签页响应:', response);
            } catch (err) {
                console.log('[RingsDB Extension] 无法通知标签页', tab.id, ':', err.message);
            }
        }

        console.log('[RingsDB Extension] 已通知所有 deck edit 页面');
    } catch (error) {
        console.error('[RingsDB Extension] 通知 deck edit 页面失败:', error);
    }
}

// 展开/收起扩展卡牌
async function toggleExpansionCards(expansionId) {
    const container = document.getElementById(`cards-${expansionId}`);
    const button = document.querySelector(`.expansion-btn.view[data-expansion-id="${expansionId}"]`);

    // 如果已展开，则收起
    if (container.classList.contains('show')) {
        container.classList.remove('show');
        button.textContent = '查看卡牌';
        button.style.background = '';
        button.style.color = '';
        return;
    }

    // 收起其他所有扩展
    document.querySelectorAll('.expansion-cards-container.show').forEach(c => {
        c.classList.remove('show');
    });
    document.querySelectorAll('.expansion-btn.view').forEach(btn => {
        btn.textContent = '查看卡牌';
        btn.style.background = '';
        btn.style.color = '';
    });

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getExpansionCards',
            expansionId: expansionId
        });

        if (response.success) {
            const cards = response.data.cards || {};
            const cardItems = Object.entries(cards)
                .sort((a, b) => a[1].name.localeCompare(b[1].name))
                .map(([code, card]) => {
                    return `
                        <div class="inline-card-item">
                            <span class="inline-card-name">${escapeHtml(card.name)}   x${card.count}</span>
                        </div>
                    `;
                }).join('');

            container.innerHTML = cardItems || '<div class="empty-state">此扩展暂无卡牌</div>';
            container.classList.add('show');
            button.textContent = '收起卡牌';
            button.style.background = '#17a2b8';
            button.style.color = 'white';
        } else {
            showError('获取扩展卡牌失败: ' + response.error);
        }
    } catch (error) {
        console.error('[RingsDB Extension] 查看扩展卡牌失败:', error);
        showError('查看扩展卡牌失败: ' + error.message);
    }
}

// 重命名扩展
async function renameExpansion(expansionId) {
    const currentName = prompt('请输入新的扩展名称:');
    if (!currentName || !currentName.trim()) {
        return;
    }

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'renameExpansion',
            expansionId: expansionId,
            name: currentName.trim()
        });

        if (response.success) {
            showSuccess('扩展重命名成功！');
            await loadExpansions();
        } else {
            showError('重命名失败: ' + response.error);
        }
    } catch (error) {
        console.error('[RingsDB Extension] 重命名扩展失败:', error);
        showError('重命名失败: ' + error.message);
    }
}

// 删除扩展
async function deleteExpansion(expansionId) {
    if (!confirm('确定要删除这个扩展吗？此操作不可撤销。')) {
        return;
    }

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'deleteExpansion',
            expansionId: expansionId
        });

        if (response.success) {
            showSuccess('扩展删除成功！');
            await loadExpansions();
        } else {
            showError('删除失败: ' + response.error);
        }
    } catch (error) {
        console.error('[RingsDB Extension] 删除扩展失败:', error);
        showError('删除失败: ' + error.message);
    }
}

// 导出数据
async function exportData() {
    try {
        setLoading(true);
        console.log('[RingsDB Extension] 开始导出数据...');

        const expansionsResponse = await chrome.runtime.sendMessage({ action: 'getExpansions' });

        if (!expansionsResponse.success) {
            throw new Error(expansionsResponse.error || '获取扩展数据失败');
        }

        const expansions = expansionsResponse.data;
        const expansionCount = Object.keys(expansions).length;

        if (expansionCount === 0) {
            showError('没有数据可导出');
            return;
        }

        console.log(`[RingsDB Extension] 找到 ${expansionCount} 个扩展，生成JSON...`);

        const exportData = expansions;

        showJsonModal(exportData);
        showSuccess(`找到 ${expansionCount} 个扩展，JSON数据已生成！`);

    } catch (error) {
        console.error('[RingsDB Extension] 导出数据失败:', error);
        showError('导出失败: ' + error.message);
    } finally {
        setLoading(false);
    }
}

async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    console.log('[RingsDB Extension] 選取檔案:', file.name);

    try {
        setLoading(true);
        console.log('[RingsDB Extension] 开始导入数据...');

        const text = await file.text(); // ✅ 讀取內容
        const json = JSON.parse(text);  // ✅ 轉成 JSON 物件
        console.log('[RingsDB Extension] JSON內容:', json);

        // ✅ 改傳可序列化物件，而不是 File
        const response = await chrome.runtime.sendMessage({
            action: 'importExpansions',
            data: json
        });

        if (response.success) {
            showSuccess('数据导入成功！');
            loadExpansions(); // 重新加载扩展列表
        } else {
            showError('导入失败: ' + response.error);
        }
    } catch (error) {
        console.error('[RingsDB Extension] 导入数据失败:', error);
        showError('导入失败: ' + error.message);
    } finally {
        setLoading(false);
        // 清空文件输入
        event.target.value = '';
    }
}
// 显示JSON模态框
function showJsonModal(data) {
    const modal = document.getElementById('jsonModal');
    const content = document.getElementById('jsonContent');

    content.textContent = JSON.stringify(data, null, 2);
    modal.classList.add('show');
}

// 隐藏JSON模态框
function hideJsonModal() {
    const modal = document.getElementById('jsonModal');
    modal.classList.remove('show');
}

// 复制JSON到剪贴板
async function copyJsonToClipboard() {
    const jsonContent = document.getElementById('jsonContent').textContent;

    try {
        await navigator.clipboard.writeText(jsonContent);
        showSuccess('JSON数据已复制到剪贴板！');

        // 改变按钮文本提示
        const button = document.getElementById('copyJsonBtn');
        const originalText = button.textContent;
        button.textContent = '✓ 已复制';

        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    } catch (error) {
        console.error('复制失败:', error);
        showError('复制失败，请手动复制JSON数据');
    }
}

// 清除数据
async function clearData() {
    if (!confirm(
        '确定要清除所有扩展数据吗？\n\n' +
        '此操作不可撤销，建议先导出备份。'
    )) {
        return;
    }

    try {
        setLoading(true);

        const response = await chrome.runtime.sendMessage({ action: 'clearAllExpansions' });

        if (response.success) {
            showSuccess('数据已清除！');
            await loadExpansions();
        } else {
            showError('清除失败: ' + response.error);
        }
    } catch (error) {
        console.error('[RingsDB Extension] 清除数据失败:', error);
        showError('清除失败: ' + error.message);
    } finally {
        setLoading(false);
    }
}



// 设置加载状态
function setLoading(loading) {
    if (loading) {
        document.body.classList.add('loading');
    } else {
        document.body.classList.remove('loading');
    }
}

// 显示成功消息
function showSuccess(message) {
    showNotification(message, 'success');
}

// 显示错误消息
function showError(message) {
    showNotification(message, 'error');
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        opacity: 0;
        transition: all 0.3s ease;
        max-width: 300px;
        text-align: center;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // 显示动画
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    }, 100);

    // 自动隐藏
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => {
            notification.parentNode?.removeChild(notification);
        }, 300);
    }, 3000);
}

// HTML转义函数（防止XSS）
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

