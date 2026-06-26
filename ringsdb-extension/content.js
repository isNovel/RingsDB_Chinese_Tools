// RingsDB 简化收藏扩展 - Content Script
console.log('[RingsDB Extension] 加载中...');

function initExtension() {
    console.log('[RingsDB Extension] 初始化中...');
    injectScript();

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        if (event.data.type === 'RINGSDB_INJECT_READY') {
            console.log('[RingsDB Extension] inject.js 已就绪');
            loadAndApplyPackData();
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

// 从 pack.json 加载数据，只应用启用的包
async function loadAndApplyPackData() {
    try {
        console.log('[RingsDB Extension] 开始加载 pack.json...');

        // 从 background 获取数据
        const response = await chrome.runtime.sendMessage({ action: 'getPackData' });
        
        if (!response.success) {
            console.error('[RingsDB Extension] 获取数据失败:', response.error);
            return;
        }

        const packData = response.data;
        const enabledPacks = response.enabledPacks || [];
        
        console.log('[RingsDB Extension] pack.json 加载成功:', Object.keys(packData).length, '个卡包');
        console.log('[RingsDB Extension] 已启用:', enabledPacks);

        // 转换为 inject.js 期望的格式，只取启用的包
        const expansionsData = [];
        let currentId = 500;
        let currentPosition = 5;

        for (const [packName, packContent] of Object.entries(packData)) {
            const pack = packContent.pack;
            const cards = packContent.cards;
            
            // 检查是否启用
            const isEnabled = enabledPacks.includes(pack.code);
            
            // 如果没有启用，跳过
            if (!isEnabled) continue;

            if (!pack.id) {
                pack.id = currentId++;
            }

            const totalCardsCount = Object.keys(cards || {}).length;

            expansionsData.push({
                pack: {
                    code: pack.code || 'custom',
                    name: pack.name || packName,
                    s_name: (pack.name || packName).toLowerCase(),
                    id: pack.id,
                    position: currentPosition++,
                    cycle_position: 61,
                    url: "https://ringsdb.com/",
                    available: "2026-06-24",
                    known: totalCardsCount,
                    total: totalCardsCount,
                    owned: true
                },
                cards: cards || {}
            });
        }

        console.log('[RingsDB Extension] 准备应用', expansionsData.length, '个卡包');

        window.postMessage({
            type: 'RINGSDB_APPLY_EXPANSIONS',
            expansionsData: expansionsData
        }, '*');

    } catch (error) {
        console.error('[RingsDB Extension] 加载 pack.json 失败:', error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reloadExpansions' || request.action === 'expansionsUpdated') {
        loadAndApplyPackData();
        sendResponse({ success: true });
    }
});

initExtension();