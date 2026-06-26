// RingsDB Chrome Extension Background Script
console.log('[RingsDB Extension] Background script 已加载');

chrome.runtime.onInstalled.addListener((details) => {
    console.log('[RingsDB Extension] 扩展已安装/更新:', details.reason);
    if (details.reason === 'install') {
        chrome.action.setBadgeText({ text: 'NEW' });
        chrome.action.setBadgeBackgroundColor({ color: '#3498db' });
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[RingsDB Extension] 收到消息:', request.action);
    handleMessage(request, sender, sendResponse);
    return true;
});

async function handleMessage(request, sender, sendResponse) {
    try {
        let result;
        switch (request.action) {
            case 'getPackData':
                result = await getPackData();
                break;
            case 'toggleExpansion':
                result = await toggleExpansion(request.packCode);
                break;
            case 'getEnabledPacks':
                result = await getEnabledPacks();
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

// 读取 pack.json
async function getPackData() {
    try {
        const response = await fetch(chrome.runtime.getURL('pack.json'));
        const data = await response.json();
        // 同时获取已启用的包列表
        const enabledResult = await chrome.storage.local.get('ringsdb_enabled_packs');
        const enabledPacks = enabledResult.ringsdb_enabled_packs || [];
        return {
            success: true,
            data: data,
            enabledPacks: enabledPacks
        };
    } catch (error) {
        console.error('[RingsDB Extension] 读取 pack.json 失败:', error);
        return { success: false, error: error.message };
    }
}

// 切换扩展启用状态
async function toggleExpansion(packCode) {
    const result = await chrome.storage.local.get('ringsdb_enabled_packs');
    let enabledPacks = result.ringsdb_enabled_packs || [];
    
    if (enabledPacks.includes(packCode)) {
        enabledPacks = enabledPacks.filter(code => code !== packCode);
    } else {
        enabledPacks.push(packCode);
    }
    
    await chrome.storage.local.set({ ringsdb_enabled_packs: enabledPacks });
    console.log('[RingsDB Extension] 已启用包:', enabledPacks);
    
    // 通知 content 重新加载
    notifyContentReload();
    
    return { success: true, enabledPacks: enabledPacks };
}

// 获取已启用的包
async function getEnabledPacks() {
    const result = await chrome.storage.local.get('ringsdb_enabled_packs');
    return {
        success: true,
        enabledPacks: result.ringsdb_enabled_packs || []
    };
}

// 通知所有 ringsdb 页面重新加载
async function notifyContentReload() {
    try {
        const tabs = await chrome.tabs.query({ url: 'https://*.ringsdb.com/*' });
        for (const tab of tabs) {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'reloadExpansions' });
            } catch (err) {
                // 忽略
            }
        }
    } catch (error) {
        // 忽略
    }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ringsdb.com')) {
        chrome.action.setIcon({
            path: { 16: 'icon16.png', 48: 'icon48.png', 128: 'icon128.png' },
            tabId: tabId
        });
        chrome.action.setBadgeText({ text: 'ON', tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#27ae60', tabId: tabId });
    }
});