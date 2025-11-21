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
    // 检测牌库编辑页面
    else if (currentPath.includes('/deck/edit/')) {
        console.log('[RingsDB Extension] 检测到牌库编辑页面');
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initDeckEdit);
        } else {
            initDeckEdit();
        }
    }
}

// ===== Deck Edit 页面功能 =====
function initDeckEdit() {
    console.log('[RingsDB Extension] 初始化 Deck Edit 功能...');
    
    // 注入 inject.js 到页面上下文
    injectScript();
    
    // 监听来自注入脚本的消息
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;
        
        if (event.data.type === 'RINGSDB_INJECT_READY') {
            console.log('[RingsDB Extension] inject.js 已就绪');
            // 加载并应用已启用的扩展
            loadAndApplyEnabledExpansions();
        } else if (event.data.type === 'RINGSDB_EXPANSIONS_APPLIED') {
            console.log('[RingsDB Extension] 扩展已应用:', event.data.count, '张卡牌');
        }
    });
}

// 注入脚本到页面上下文
function injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    
    script.onload = function() {
        console.log('[RingsDB Extension] inject.js 注入成功');
        script.remove();
    };
    
    script.onerror = function() {
        console.error('[RingsDB Extension] inject.js 注入失败');
    };
    
    (document.head || document.documentElement).appendChild(script);
}

// 加载并应用已启用的扩展
async function loadAndApplyEnabledExpansions() {
    try {
        console.log('[RingsDB Extension] 开始加载已启用的扩展...');
        
        // 获取已启用的扩展
        const enabledResult = await chrome.storage.local.get('ringsdb_enabled_expansions');
        const enabledExpansions = enabledResult.ringsdb_enabled_expansions || [];
        
        console.log('[RingsDB Extension] 已启用的扩展:', enabledExpansions);
        
        if (enabledExpansions.length === 0) {
            console.log('[RingsDB Extension] 没有已启用的扩展，清除所有卡牌');
            // 清除所有卡牌
            window.postMessage({
                type: 'RINGSDB_APPLY_EXPANSIONS',
                cardCodes: []
            }, '*');
            return;
        }
        
        // 获取所有扩展数据
        const expansionsResult = await chrome.storage.local.get('ringsdb_expansions');
        const expansions = expansionsResult.ringsdb_expansions || {};
        
        // 收集所有已启用扩展中的卡牌代码
        const allCardCodes = [];
        
        enabledExpansions.forEach(expansionId => {
            const expansion = expansions[expansionId];
            if (expansion && expansion.cards) {
                Object.keys(expansion.cards).forEach(code => {
                    if (!allCardCodes.includes(code)) {
                        allCardCodes.push(code);
                    }
                });
            }
        });
        
        console.log('[RingsDB Extension] 准备应用', allCardCodes.length, '张卡牌');
        
        // 通过 postMessage 发送到注入的脚本
        window.postMessage({
            type: 'RINGSDB_APPLY_EXPANSIONS',
            cardCodes: allCardCodes
        }, '*');
        
    } catch (error) {
        console.error('[RingsDB Extension] 加载扩展失败:', error);
    }
}

// 监听来自 popup 的消息（当用户切换扩展启用状态时）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reloadExpansions') {
        console.log('[RingsDB Extension] 收到重新加载扩展的请求');
        loadAndApplyEnabledExpansions();
        sendResponse({success: true});
    }
});

// ===== 牌库详情页面功能 =====

// 添加收藏按钮
function addSaveButton() {
    console.log('[RingsDB Extension] 开始添加收藏按钮...');
    
    // 移除已存在的按钮（防止重复）
    const existingButton = document.getElementById('ringsdb-save-button');
    if (existingButton) {
        existingButton.remove();
    }
    
    // 寻找合适的插入位置
    const insertionPoints = [
        '.panel-heading .btn-group',
        '.page-header .btn-group',
        '.panel-body .btn-group',
        '.deck-header .btn-group',
        '.panel-heading',
        '.page-header',
        '.panel-body h2',
        '.panel-body h1',
        '.container h2',
        '.container h1',
        'h2',
        'h1'
    ];
    
    let targetElement = null;
    
    for (const selector of insertionPoints) {
        targetElement = document.querySelector(selector);
        if (targetElement) {
            console.log('[RingsDB Extension] 找到插入位置:', selector);
            break;
        }
    }
    
    // 如果没找到，使用body作为默认位置
    if (!targetElement) {
        targetElement = document.body;
        console.log('[RingsDB Extension] 使用body作为插入位置');
    }
    
    // 创建按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'btn-group ringsdb-ext-container';
    buttonContainer.style.cssText = `
        margin-left: 10px;
        margin-top: 10px;
        margin-bottom: 10px;
    `;
    
    // 创建收藏按钮
    const saveButton = document.createElement('button');
    saveButton.id = 'ringsdb-save-button';
    saveButton.className = 'btn btn-primary btn-sm';
    saveButton.innerHTML = '⭐ 加进收藏';
    saveButton.title = '将此牌库的所有卡牌添加为新扩展';
    
    // 添加点击事件
    saveButton.addEventListener('click', handleSaveClick);
    
    buttonContainer.appendChild(saveButton);
    
    // 插入按钮
    if (targetElement === document.body) {
        const firstContainer = document.querySelector('.container, .panel, .page') || document.body.firstChild;
        if (firstContainer && firstContainer !== document.body.firstChild) {
            firstContainer.parentNode.insertBefore(buttonContainer, firstContainer);
        } else {
            document.body.insertBefore(buttonContainer, document.body.firstChild);
        }
    } else {
        if (targetElement.parentNode && targetElement.parentNode.insertBefore) {
            targetElement.parentNode.insertBefore(buttonContainer, targetElement.nextSibling);
        } else {
            targetElement.appendChild(buttonContainer);
        }
    }
    
    console.log('[RingsDB Extension] 收藏按钮创建完成');
}

// 处理收藏按钮点击事件
async function handleSaveClick() {
    const button = document.getElementById('ringsdb-save-button');
    const originalText = button.innerHTML;
    const originalClass = button.className;
    
    try {
        // 更新按钮状态
        button.innerHTML = '<span style="animation: spin 1s linear infinite;">⏳</span> 处理中...';
        button.className = 'btn btn-warning btn-sm';
        button.disabled = true;
        
        console.log('[RingsDB Extension] 开始提取卡牌...');
        
        // 提取卡牌数据
        const cards = extractDeckCards();
        
        if (Object.keys(cards).length === 0) {
            throw new Error('未找到任何卡牌');
        }
        
        console.log('[RingsDB Extension] 提取到', Object.keys(cards).length, '张卡牌');
        
        // 获取牌库标题作为扩展名
        const deckTitle = getDeckTitle() || '新扩展';
        
        // 发送到background保存
        const response = await chrome.runtime.sendMessage({
            action: 'createExpansionWithCards',
            name: deckTitle,
            cards: cards
        });
        
        if (response.success) {
            showMessage(`成功创建扩展 "${deckTitle}"，包含 ${Object.keys(cards).length} 张卡牌！`, 'success');
            
            button.innerHTML = '✅ 已收藏';
            button.className = 'btn btn-success btn-sm';
        } else {
            throw new Error(response.error || '保存失败');
        }
        
        // 2秒后恢复按钮状态
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

// 提取当前页面的卡牌数据
function extractDeckCards() {
    const cards = {};
    
    console.log('[RingsDB Extension] 开始解析卡牌...');
    
    // 1. 解析Hero卡牌（每个Hero只解析一次）
    const processedHeroCodes = new Set();
    const allHeroIcons = document.querySelectorAll('.icon-hero');
    console.log(`[RingsDB Extension] 找到 ${allHeroIcons.length} 个Hero图标`);
    
    allHeroIcons.forEach((heroIcon, index) => {
        const parentDiv = heroIcon.parentElement;
        const cardLink = parentDiv?.querySelector('a[data-code]');
        
        if (cardLink) {
            const code = cardLink.dataset.code;
            const name = cardLink.textContent.trim();
            
            if (code && name && !processedHeroCodes.has(code)) {
                cards[code] = { name, count: 1 };
                processedHeroCodes.add(code);
                console.log(`[RingsDB Extension] 解析Hero: ${code} - ${name}`);
            }
        }
    });
    
    // 2. 解析Mainboard和Sideboard卡牌
    console.log('[RingsDB Extension] 解析Mainboard/Sideboard卡牌...');
    const countElements = document.querySelectorAll('.card-count');
    console.log(`[RingsDB Extension] 找到 ${countElements.length} 个数量元素`);
    
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
                        console.log(`[RingsDB Extension] 合并卡牌: ${code} - ${name} (总数: ${cards[code].count})`);
                    } else {
                        cards[code] = { name, count };
                        console.log(`[RingsDB Extension] 新增卡牌: ${code} - ${name} x${count}`);
                    }
                }
            }
        }
    });
    
    // 3. 备用方法：如果主方法没找到卡牌
    if (Object.keys(cards).length === 0) {
        console.log('[RingsDB Extension] 使用备用提取方法...');
        extractCardsFallback(cards);
    }
    
    console.log('[RingsDB Extension] 解析完成，共', Object.keys(cards).length, '张卡牌');
    return cards;
}

// 备用卡牌提取方法
function extractCardsFallback(cards) {
    const cardSelectors = [
        '.decklist-content .row',
        '.deck-cards .card-item',
        '.card-row',
        '[data-code]'
    ];
    
    for (const selector of cardSelectors) {
        const elements = document.querySelectorAll(selector);
        
        if (elements.length > 0) {
            console.log(`[RingsDB Extension] 使用选择器 ${selector} 找到 ${elements.length} 个元素`);
            
            elements.forEach(element => {
                let code = element.dataset?.code;
                
                if (!code) {
                    const link = element.querySelector('a[href*="/card/"]');
                    if (link) {
                        const match = link.href.match(/\/card\/(\d+)/);
                        if (match) {
                            code = match[1].padStart(6, '0');
                        }
                    }
                }
                
                if (code && !cards[code]) {
                    const nameElement = element.querySelector('.card-name, .name, a[data-code]');
                    const name = nameElement?.textContent.trim() || '未知卡牌';
                    
                    const countElement = element.querySelector('.count, .qty, .card-count');
                    let count = 1;
                    if (countElement) {
                        const countMatch = countElement.textContent.match(/(\d+)/);
                        if (countMatch) {
                            count = parseInt(countMatch[1]);
                        }
                    }
                    
                    cards[code] = { name, count };
                    console.log(`[RingsDB Extension] 备用方法解析: ${code} - ${name} x${count}`);
                }
            });
            
            if (Object.keys(cards).length > 0) {
                break;
            }
        }
    }
}

// 获取牌库标题
function getDeckTitle() {
    const titleSelectors = [
        'h1',
        '.deck-title',
        '.decklist-title',
        '.panel-heading h1',
        '.page-header h1',
        '.container h1'
    ];
    
    for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
            const title = element.textContent.trim();
            // 过滤掉非标题内容
            if (!title.includes('收藏') && !title.includes('按钮') && !title.includes('扩展')) {
                return title;
            }
        }
    }
    
    return null;
}

// 显示消息提示
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        padding: 12px 16px;
        border-radius: 4px;
        color: white;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
    `;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    // 显示动画
    setTimeout(() => {
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateX(0)';
    }, 100);
    
    // 自动隐藏
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateX(100%)';
        setTimeout(() => {
            messageDiv.parentNode?.removeChild(messageDiv);
        }, 300);
    }, 3000);
}

// 添加CSS样式
function addCSS() {
    if (!document.getElementById('ringsdb-extension-styles')) {
        const style = document.createElement('style');
        style.id = 'ringsdb-extension-styles';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
}

// 初始化
addCSS();
initExtension();