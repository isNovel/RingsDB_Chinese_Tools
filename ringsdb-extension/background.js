// RingsDB Chrome Extension Background Script
// 处理扩展的后台逻辑
console.log('[RingsDB Extension] Background script 已加载');

// 监听扩展安装和更新
chrome.runtime.onInstalled.addListener((details) => {
    console.log('[RingsDB Extension] 扩展已安装/更新:', details.reason);

    if (details.reason === 'install') {
        console.log('[RingsDB Extension] 首次安装，显示欢迎信息');
        chrome.action.setBadgeText({ text: 'NEW' });
        chrome.action.setBadgeBackgroundColor({ color: '#3498db' });

        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
        }, 3000);
    } else if (details.reason === 'update') {
        console.log('[RingsDB Extension] 扩展已更新');
        chrome.action.setBadgeText({ text: 'UP' });
        chrome.action.setBadgeBackgroundColor({ color: '#27ae60' });

        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
        }, 3000);
    }
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[RingsDB Extension] 收到消息:', request.action);

    // 使用异步处理函数
    handleMessage(request, sender, sendResponse);
    return true; // 保持消息通道开放
});

// 统一的消息处理函数
async function handleMessage(request, sender, sendResponse) {
    try {
        let result;

        switch (request.action) {

            case 'getExpansions':
                result = await getExpansions();
                break;

            case 'importExpansions':
                result = await importExpansions(request.data); // ✅ 改成接 data
                break;

            case 'createExpansionWithCards':
                result = await createExpansionWithCards(request.name, request.cards);
                break;

            case 'renameExpansion':
                result = await renameExpansion(request.expansionId, request.name);
                break;

            case 'getExpansionCards':
                result = await getExpansionCards(request.expansionId);
                break;

            case 'deleteExpansion':
                result = await deleteExpansion(request.expansionId);
                break;


            case 'clearAllExpansions':
                result = await clearAllExpansions();
                break;

            default:
                result = { success: false, error: '未知操作: ' + request.action };
        }

        sendResponse(result);
    } catch (error) {
        console.error('[RingsDB Extension] 处理消息失败:', error);
        sendResponse({ success: false, error: error.message });
    }
}


// 获取扩展列表
async function getExpansions() {
    const result = await chrome.storage.local.get('ringsdb_expansions');
    return {
        success: true,
        data: result.ringsdb_expansions || {}
    };
}
// 新增或更新 expansions 到現有資料
async function importExpansions(newExpansions) {
    const result = await chrome.storage.local.get('ringsdb_expansions');
    const expansions = result.ringsdb_expansions || {};
    console.log('[RingsDB Extension] new:', newExpansions);

    // 合併新舊資料（新資料覆蓋同 key）
    const updated = { ...expansions, ...newExpansions };

    await chrome.storage.local.set({ ringsdb_expansions: updated });
    console.log('[RingsDB Extension] 更新:', updated);

    return {
        success: true,
        data: updated
    };
}



// 创建新扩展并包含卡牌
async function createExpansionWithCards(name, cardsData) {
    const result = await chrome.storage.local.get('ringsdb_expansions');
    const expansions = result.ringsdb_expansions || {};
    const expansionId = generateExpansionId();

    // 处理卡牌数据
    const cards = {};
    for (const [code, cardData] of Object.entries(cardsData || {})) {
        cards[code] = {
            code: code,
            name: cardData.name || code,
            count: cardData.count || 1,
            added: new Date().toISOString()
        };
    }

    expansions[expansionId] = {
        id: expansionId,
        name: name || '新扩展',
        created: new Date().toISOString(),
        cards: cards
    };

    await chrome.storage.local.set({ ringsdb_expansions: expansions });
    console.log('[RingsDB Extension] 扩展创建成功，包含', Object.keys(cards).length, '张卡牌');

    const enabledResult = await chrome.storage.local.get('ringsdb_enabled_expansions');
    let enabledExpansions = enabledResult.ringsdb_enabled_expansions || [];

    if (!enabledExpansions.includes(expansionId)) {
        enabledExpansions.push(expansionId);
        await chrome.storage.local.set({ ringsdb_enabled_expansions: enabledExpansions });
        console.log('[RingsDB Extension] 新扩展已自动启用:', expansionId);
    }
    // 通知所有打开的 popup 页面刷新
    notifyPopupUpdate();

    return {
        success: true,
        message: '扩展创建成功',
        expansionId: expansionId,
        cardCount: Object.keys(cards).length
    };
}

// 重命名扩展
async function renameExpansion(expansionId, name) {
    const result = await chrome.storage.local.get('ringsdb_expansions');
    const expansions = result.ringsdb_expansions || {};

    if (!expansions[expansionId]) {
        throw new Error('扩展不存在');
    }

    expansions[expansionId].name = name;
    expansions[expansionId].modified = new Date().toISOString();

    await chrome.storage.local.set({ ringsdb_expansions: expansions });
    console.log('[RingsDB Extension] 扩展重命名成功');

    notifyPopupUpdate();

    return { success: true, message: '扩展重命名成功' };
}

// 获取特定扩展的卡牌
async function getExpansionCards(expansionId) {
    const result = await chrome.storage.local.get('ringsdb_expansions');
    const expansions = result.ringsdb_expansions || {};
    const expansion = expansions[expansionId];

    if (!expansion) {
        throw new Error('扩展不存在');
    }

    return { success: true, data: expansion };
}

// 删除扩展
async function deleteExpansion(expansionId) {
    const result = await chrome.storage.local.get('ringsdb_expansions');
    const expansions = result.ringsdb_expansions || {};

    if (!expansions[expansionId]) {
        throw new Error('扩展不存在');
    }

    delete expansions[expansionId];
    await chrome.storage.local.set({ ringsdb_expansions: expansions });
    console.log('[RingsDB Extension] 扩展删除成功');

    notifyPopupUpdate();

    return { success: true, message: '扩展删除成功' };
}


// 清除所有扩展数据
async function clearAllExpansions() {
    await chrome.storage.local.remove(['ringsdb_expansions']);
    console.log('[RingsDB Extension] 扩展数据已清除');

    notifyPopupUpdate();

    return { success: true, message: '扩展数据已清除' };
}

// 生成唯一的扩展ID
function generateExpansionId() {
    return 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 通知所有打开的 popup 页面刷新
async function notifyPopupUpdate() {
    try {
        // 尝试向所有扩展页面发送消息
        await chrome.runtime.sendMessage({
            action: 'expansionsUpdated'
        });
        console.log('[RingsDB Extension] 已发送更新通知');
    } catch (error) {
        // 如果没有 popup 打开，忽略错误
        console.log('[RingsDB Extension] 没有打开的 popup 页面或消息发送失败');
    }
}

// 监听标签页更新，在RingsDB页面显示扩展图标
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ringsdb.com')) {
        chrome.action.setIcon({
            path: {
                16: 'icon16.png',
                48: 'icon48.png',
                128: 'icon128.png'
            },
            tabId: tabId
        });

        chrome.action.setBadgeText({
            text: 'ON',
            tabId: tabId
        });
        chrome.action.setBadgeBackgroundColor({
            color: '#27ae60',
            tabId: tabId
        });
    }
});

