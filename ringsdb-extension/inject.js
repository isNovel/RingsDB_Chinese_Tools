// inject.js - RingsDB Extension Injector
// 注入到页面上下文，与 RingsDB 的 app 对象交互

(function() {
    console.log('[RingsDB Extension] inject.js 开始加载...');
    
    function waitForApp(callback) {
        if (typeof app !== 'undefined' && 
            app.data && 
            app.data.cards &&
            app.smart_filter && 
            app.ui) {
            callback();
        } else {
            setTimeout(() => waitForApp(callback), 100);
        }
    }

    waitForApp(function() {
        console.log('[RingsDB Extension] RingsDB app 已就绪！');
        
        // ===== LocalStorage 管理功能 =====
        function loadCustomOwnedCards() {
            var stored = localStorage.getItem('ringsdb_custom_owned_cards');
            if (stored) {
                try {
                    var ownedCodes = JSON.parse(stored);
                    console.log('[RingsDB Extension] 从 localStorage 加载:', ownedCodes.length, '张卡牌');
                    return ownedCodes;
                } catch(e) {
                    console.error('[RingsDB Extension] 加载失败:', e);
                }
            }
            return [];
        }
        
        function saveCustomOwnedCards(codes) {
            localStorage.setItem('ringsdb_custom_owned_cards', JSON.stringify(codes));
            console.log('[RingsDB Extension] 保存到 localStorage:', codes.length, '张卡牌');
        }
        
        // 初始化时载入自订 owned 卡片列表
        var customOwnedCards = loadCustomOwnedCards();
        
        // ===== 公开 API =====
        app.addCustomOwnedCard = function(cardCode) {
            if (!customOwnedCards.includes(cardCode)) {
                customOwnedCards.push(cardCode);
                saveCustomOwnedCards(customOwnedCards);
                app.ui.refresh_list();
                console.log('[RingsDB Extension] 添加卡牌:', cardCode);
                return true;
            }
            return false;
        };
        
        app.removeCustomOwnedCard = function(cardCode) {
            var index = customOwnedCards.indexOf(cardCode);
            if (index > -1) {
                customOwnedCards.splice(index, 1);
                saveCustomOwnedCards(customOwnedCards);
                app.ui.refresh_list();
                console.log('[RingsDB Extension] 移除卡牌:', cardCode);
                return true;
            }
            return false;
        };
        
        app.listCustomOwnedCards = function() {
            console.log('[RingsDB Extension] 自定义卡牌列表 (' + customOwnedCards.length + '):');
            
            if (customOwnedCards.length === 0) {
                console.log('  (none)');
            } else {
                customOwnedCards.forEach(function(code) {
                    var card = app.data.cards.findById(code);
                    if (card) {
                        console.log('  - ' + code + ': ' + card.name + ' (' + card.pack_name + ')');
                    } else {
                        console.log('  - ' + code + ': (card not found)');
                    }
                });
            }
            
            return customOwnedCards;
        };
        
        app.addCustomOwnedCards = function(cardCodes) {
            var count = 0;
            cardCodes.forEach(function(code) {
                if (app.addCustomOwnedCard(code)) {
                    count++;
                }
            });
            console.log('[RingsDB Extension] 批量添加:', count, '张新卡牌');
            app.ui.refresh_list();
            return count;
        };
        
        app.clearCustomOwnedCards = function() {
            var count = customOwnedCards.length;
            customOwnedCards = [];
            localStorage.removeItem('ringsdb_custom_owned_cards');
            app.ui.refresh_list();
            console.log('[RingsDB Extension] 清除所有自定义卡牌，共', count, '张');
        };
        
        // ===== 修改查询逻辑 =====
        const originalGetQuery = app.smart_filter.get_query;
        
        app.smart_filter.get_query = function(filters) {
            // 呼叫原始函数获得基本查询
            var baseQuery = originalGetQuery.call(this, filters);
            
            // 如果没有筛选条件，直接返回原查询
            if (Object.keys(baseQuery).length === 0) {
                return baseQuery;
            }
            
            // 如果没有自订的 owned 卡片，直接返回原查询
            if (customOwnedCards.length === 0) {
                return baseQuery;
            }
            
            // 如果没有 pack_code 筛选，直接返回原查询
            if (!baseQuery.pack_code || !baseQuery.pack_code.$in) {
                return baseQuery;
            }
            
            // 检查 pack_code.$in 是否为数组且不包含正则表达式
            // 如果是正则表达式（来自 smart filter 搜索），跳过修改
            if (!Array.isArray(baseQuery.pack_code.$in) || 
                baseQuery.pack_code.$in.length === 0 ||
                baseQuery.pack_code.$in[0] instanceof RegExp) {
                return baseQuery;
            }
            
            // 深度复制 pack_code 条件
            var packCodeCondition = {
                $in: baseQuery.pack_code.$in.slice()
            };
            
            // 构建新查询
            var modifiedQuery = {};
            
            // 复制所有非 pack_code 的条件
            for (var key in baseQuery) {
                if (key !== 'pack_code') {
                    modifiedQuery[key] = baseQuery[key];
                }
            }
            
            // 添加 OR 条件：
            // (pack_code 在允许列表中) OR (code 在自订列表中)
            modifiedQuery.$or = [
                { pack_code: packCodeCondition },
                { code: { $in: customOwnedCards.slice() } }
            ];
            
            return modifiedQuery;
        };
        
        console.log('[RingsDB Extension] inject.js 加载完成！');
        console.log('[RingsDB Extension] 可用命令:');
        console.log('  app.addCustomOwnedCard("22081")');
        console.log('  app.addCustomOwnedCards(["22081","22082"])');
        console.log('  app.removeCustomOwnedCard("22081")');
        console.log('  app.listCustomOwnedCards()');
        console.log('  app.clearCustomOwnedCards()');
        
        // ===== 扩展卡牌管理功能 =====
        
        // 应用扩展卡牌到 RingsDB
        window.applyExpansionCards = function(expansionCards) {
            // 先清除所有现有的卡牌
            app.clearCustomOwnedCards();
            
            if (expansionCards.length > 0) {
                console.log('[RingsDB Extension] 应用', expansionCards.length, '张卡牌');
                app.addCustomOwnedCards(expansionCards);
                return true;
            } else {
                console.log('[RingsDB Extension] 没有卡牌需要应用');
                return true;
            }
        };
        
        // 监听来自 content script 的消息
        window.addEventListener('message', function(event) {
            // 只接受来自同一页面的消息
            if (event.source !== window) return;
            
            if (event.data.type === 'RINGSDB_APPLY_EXPANSIONS') {
                console.log('[RingsDB Extension] 收到应用扩展请求');
                const cardCodes = event.data.cardCodes || [];
                
                console.log('[RingsDB Extension] 卡牌数量:', cardCodes.length);
                
                // 应用卡牌（包括清除操作）
                const success = window.applyExpansionCards(cardCodes);
                
                // 发送成功消息回 content script
                window.postMessage({
                    type: 'RINGSDB_EXPANSIONS_APPLIED',
                    success: success,
                    count: cardCodes.length
                }, '*');
            }
        });
        
        // 通知 content script 已就绪
        window.postMessage({
            type: 'RINGSDB_INJECT_READY'
        }, '*');
        
        // 页面载入完成后，如果有自订 owned 卡片，刷新列表
        if (customOwnedCards.length > 0) {
            $(document).on('start.app', function() {
                setTimeout(function() {
                    console.log('[RingsDB Extension] 刷新列表，包含', customOwnedCards.length, '张自定义卡牌');
                    app.ui.refresh_list();
                }, 1000);
            });
        }
    });
})();