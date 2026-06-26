// inject.js - RingsDB Extension Injector
// 注入到頁面上下文，與 RingsDB 的 app 物件互動

(function () {
    console.log('[RingsDB Extension] inject.js 開始加載（完全體融合版）...');

    const injectedPackCodesTracker = []; // 紀錄塞進 app.data.packs._data 的自訂卡包代碼
    const injectedPackIdsTracker = [];   // 紀錄塞進 app.user.data.owned_packs 的自訂卡包 ID
    const injectedCardsTracker = {};     // 精確紀錄哪些卡牌代碼的 packs 陣列被我們修改過

    var extensionCardCodes = [];

    // ===== 核心突破 1：在資料加載的最源頭注入 =====
    function hijackUserLoaded() {
        if (typeof app !== 'undefined' && app.user && app.user.loaded && typeof app.user.loaded.always === 'function') {
            if (!app.user.loaded.__always_hijacked) {
                const originalAlways = app.user.loaded.always;

                app.user.loaded.always = function (callback) {
                    const wrappedCallback = function () {
                        console.log('[RingsDB Extension] ⚡ 預先注入自訂卡包 ID 到使用者收藏中...');
                        
                        if (app.user && app.user.data && typeof app.user.data.owned_packs === 'string') {
                            let ownedArray = app.user.data.owned_packs.split(',').map(s => s.trim()).filter(Boolean);
                            injectedPackIdsTracker.forEach(id => {
                                if (!ownedArray.includes(String(id))) {
                                    ownedArray.push(String(id));
                                }
                            });
                            app.user.data.owned_packs = ownedArray.join(',');
                        }

                        if (typeof callback === 'function') {
                            callback.apply(this, arguments);
                        }

                        console.log('[RingsDB Extension] ⚡ 將自訂卡包擁有數強行寫入核心字典...');
                        if (app.data && app.data.owned_pack_counts) {
                            injectedPackCodesTracker.forEach(code => {
                                app.data.owned_pack_counts[code] = 1; 
                            });
                        }

                        syncCustomCardsOwnedState();
                    };

                    return originalAlways.call(this, wrappedCallback);
                };

                app.user.loaded.__always_hijacked = true;
                console.log('[RingsDB Extension] 🚀 成功深度劫持 app.user.loaded.always 方法！');
            }
        } else {
            setTimeout(hijackUserLoaded, 10);
        }
    }

    hijackUserLoaded();

    // 負責修正底層資料庫卡牌的 maxqty 與 owned 狀態
    function syncCustomCardsOwnedState() {
        if (app.data && app.data.cards && typeof app.data.cards.find === 'function') {
            app.data.cards.find().forEach(function(card) {
                if (card && card.code && extensionCardCodes.includes(String(card.code))) {
                    
                    let ownedCopies = 0;
                    if (app.data.owned_pack_counts && Array.isArray(card.packs)) {
                        card.packs.forEach(function(pr) {
                            ownedCopies += (app.data.owned_pack_counts[pr.pack_code] || 0) * (pr.quantity || 0);
                        });
                    }
                    if (ownedCopies === 0) ownedCopies = 3;

                    var max_qty = Math.min(3, card.deck_limit || 3, ownedCopies);
                    if (max_qty === 0) max_qty = 3;

                    app.data.cards.updateById(card.code, {
                        owned_copies: ownedCopies,
                        owned: true,
                        maxqty: max_qty
                    });
                }
            });
        }
    }

    function waitForApp(callback) {
        if (typeof app !== 'undefined' &&
            app.data &&
            app.data.cards &&
            app.data.packs &&
            app.ui) {
            callback();
        } else {
            setTimeout(() => waitForApp(callback), 100);
        }
    }

    waitForApp(function () {
        console.log('[RingsDB Extension] RingsDB app 已就緒！');

        if (app.ui && typeof app.ui.set_max_qty === 'function' && !app.ui.__set_max_qty_hijacked) {
            const originalSetMaxQty = app.ui.set_max_qty;

            app.ui.set_max_qty = function() {
                originalSetMaxQty.apply(this, arguments);
                syncCustomCardsOwnedState();
            };

            app.ui.__set_max_qty_hijacked = true;
        }

        // ===== 🛠️ 公開 API =====
        app.addCustomOwnedCard = function (cardCode) {
            if (!extensionCardCodes.includes(cardCode)) {
                extensionCardCodes.push(cardCode);
                return true;
            }
            return false;
        };

        app.addCustomOwnedCards = function (cardCodes) {
            var count = 0;
            cardCodes.forEach(function (code) {
                if (app.addCustomOwnedCard(code)) {
                    count++;
                }
            });
            return count;
        };

        console.log('[RingsDB Extension] inject.js 加載完成！');

        // ===== 核心：應用擴充卡牌到 RingsDB =====
        window.applyExpansionCards = function (expansionsData) {
            console.log('[RingsDB Extension] 開始動態注入自製卡包資料並繪製選單...', expansionsData);

            // 清理舊有的卡包 DOM 標籤
            try {
                if (app.data.packs && Array.isArray(app.data.packs._data)) {
                    app.data.packs._data = app.data.packs._data.filter(p => p && !injectedPackCodesTracker.includes(p.code));
                }
                injectedPackCodesTracker.forEach(code => {
                    $(`#set-selection-menu input[name="${code}"]`).closest('li').remove();
                });
            } catch (err) { }
            injectedPackCodesTracker.length = 0;
            injectedPackIdsTracker.length = 0;

            if (app.data.cards && Array.isArray(app.data.cards._data)) {
                app.data.cards._data.forEach(targetCard => {
                    if (targetCard && targetCard.code && injectedCardsTracker[targetCard.code]) {
                        const codesToRemove = injectedCardsTracker[targetCard.code];
                        if (Array.isArray(targetCard.packs)) {
                            targetCard.packs = targetCard.packs.filter(p => p && !codesToRemove.includes(p.pack_code) && !codesToRemove.includes(p.code));
                        }
                    }
                });
            }
            Object.keys(injectedCardsTracker).forEach(key => delete injectedCardsTracker[key]);

            extensionCardCodes = [];

            if (!expansionsData || expansionsData.length === 0) {
                if (app.ui.reset_list) app.ui.reset_list();
                return { success: true, cardCount: 0 };
            }

            let totalInjectedCardsCount = 0;
            const customCardsLookup = {};
            const customPacksMap = {};

            expansionsData.forEach(item => {
                const customPack = item.pack;
                const customCards = item.cards;
                if (!customPack.id) customPack.id = 501; 
                customPacksMap[customPack.code] = customPack;

                Object.keys(customCards).forEach(cardCode => {
                    customCardsLookup[String(cardCode)] = { payload: customCards[cardCode], pack: customPack };
                });
            });

            // ===== 🛠️ 核心修正：將擴充卡包塞入資料庫，並同步繪製到 Sets 選單 DOM =====
            try {
                if (app.data.packs && Array.isArray(app.data.packs._data)) {
                    Object.keys(customPacksMap).forEach(packCode => {
                        const customPack = customPacksMap[packCode];
                        app.data.packs._data.push(customPack);
                        injectedPackCodesTracker.push(customPack.code);
                        injectedPackIdsTracker.push(String(customPack.id));

                        // 🔥【重新加入】將自訂卡包渲染進右上角的 Sets 選擇下拉選單中
                        const $menu = $('#set-selection-menu');
                        if ($menu.length > 0) {
                            if ($menu.find(`input[name="${customPack.code}"]`).length === 0) {
                                const liHtml = `<li><a href=""><label><input type="checkbox" name="${customPack.code}" checked="checked">${customPack.name}</label></a></li>`;
                                $menu.append(liHtml);
                            }
                        }
                    });
                }
            } catch (err) { }

            if (app.data.cards && Array.isArray(app.data.cards._data)) {
                app.data.cards._data.forEach(rawCardInDB => {
                    if (!rawCardInDB || !rawCardInDB.code) return;

                    const match = customCardsLookup[String(rawCardInDB.code)];
                    if (match) {
                        const cardCode = String(rawCardInDB.code);
                        const customPack = match.pack;

                        if (Array.isArray(rawCardInDB.packs) && rawCardInDB.packs.length > 0) {
                            const basePackInfo = rawCardInDB.packs[0];
                            const newCustomPackElement = Object.assign(Object.create(Object.getPrototypeOf(basePackInfo)), basePackInfo);

                            newCustomPackElement.code = customPack.code;
                            newCustomPackElement.pack_code = customPack.code;
                            newCustomPackElement.pack_name = customPack.name;

                            rawCardInDB.packs.push(newCustomPackElement);
                            rawCardInDB.packs = [...rawCardInDB.packs];

                            if (!injectedCardsTracker[cardCode]) injectedCardsTracker[cardCode] = [];
                            injectedCardsTracker[cardCode].push(customPack.code);
                            extensionCardCodes.push(cardCode);
                            totalInjectedCardsCount++;
                        }
                    }
                });
            }

            // ===== ⚡ 完美不破壞鏈條的全套重繪 =====
            if (app.data && app.data.owned_pack_counts) {
                injectedPackCodesTracker.forEach(code => {
                    app.data.owned_pack_counts[code] = 1;
                });
                
                syncCustomCardsOwnedState();

                if (app.ui.set_max_qty) app.ui.set_max_qty();   
                if (app.ui.refresh_deck) app.ui.refresh_deck(); 
                
                if (app.ui.reset_list) {
                    app.ui.reset_list();
                } else if (app.ui.refresh_list) {
                    app.ui.refresh_list();
                }

                // 雙重保險，在非同步 DOM 完成後補正快取狀態
                setTimeout(function() {
                    if (app.ui.set_max_qty) app.ui.set_max_qty();
                    if (app.ui.refresh_deck) app.ui.refresh_deck();
                }, 50);
            }

            return { success: true, cardCount: totalInjectedCardsCount };
        };

        window.addEventListener('message', function (event) {
            if (event.source !== window) return;
            if (event.data.type === 'RINGSDB_APPLY_EXPANSIONS') {
                const expansionsData = event.data.expansionsData || [];
                const result = window.applyExpansionCards(expansionsData);
                window.postMessage({
                    type: 'RINGSDB_EXPANSIONS_APPLIED',
                    success: result.success,
                    count: result.cardCount
                }, '*');
            }
        });

        window.postMessage({ type: 'RINGSDB_INJECT_READY' }, '*');
    });
})();