'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // ==================================================
    // カードメーカー関連のコード (既存)
    // ==================================================

    const ruleDescriptions = new Map();

    function setupTooltips() {
        const tooltip = document.getElementById('main-tooltip');
        if (!tooltip) return;

        const showTooltip = (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (!target) return;

            const tooltipText = target.dataset.tooltip;
            if (!tooltipText) return;

            tooltip.textContent = tooltipText;
            tooltip.style.display = 'block';
            tooltip.style.visibility = 'visible';
            tooltip.style.opacity = '1';

            const targetRect = target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let top = targetRect.top - tooltipRect.height - 10; // 10px margin above
            let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

            // Prevent tooltip from going off-screen
            if (left < 5) {
                left = 5;
            }
            if (left + tooltipRect.width > window.innerWidth - 5) {
                left = window.innerWidth - tooltipRect.width - 5;
            }
            if (top < 5) { // If it goes off the top, move it below the element
                top = targetRect.bottom + 10;
            }

            tooltip.style.top = `${top}px`;
            tooltip.style.left = `${left}px`;
        };

        const hideTooltip = () => {
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'hidden';
            // We can use a transitionend event to set display to none, but this is simpler for now
            tooltip.style.display = 'none';
        };

        // Use event delegation on parent elements
        const listenableParents = [
            document.body // A fallback for any tooltip elements
        ];

        listenableParents.forEach(parent => {
            if (parent) {
                parent.addEventListener('mouseover', showTooltip);
                parent.addEventListener('mouseout', hideTooltip);
            }
        });
    }

    function parseRuleDescriptions() {
        const ruleguideTab = document.getElementById('ruleguide-tab');
        if (!ruleguideTab) return;

        ruleguideTab.querySelectorAll('dt').forEach(dt => {
            const dd = dt.nextElementSibling;
            if (dd && dd.tagName === 'DD') {
                const term = dt.textContent.trim();
                // Use innerText to get the visible text content, which is better for tooltips
                const description = dd.innerText.trim();
                
                // Handle composite keys like "ドレインⅠ/Ⅱ/Ⅲ"
                if (term.includes('Ⅰ') && term.includes('/')) {
                    const base = term.substring(0, term.indexOf('Ⅰ'));
                    const variants = term.substring(base.length).split('/');
                    variants.forEach(variant => {
                        ruleDescriptions.set(base + variant, description);
                    });
                } else {
                    ruleDescriptions.set(term, description);
                }

                // Handle numbered list keys like "1. ユニット" -> "ユニット"
                // Also handle "武器/防具" -> "武器", "防具"
                const cleanTerms = term.replace(/^\d+\.\s*/, '').split('/');
                cleanTerms.forEach(cleanTerm => {
                    const finalTerm = cleanTerm.trim();
                    if (!ruleDescriptions.has(finalTerm)) {
                        ruleDescriptions.set(finalTerm, description);
                    }
                });
            }
        });
    }

    // 状態管理オブジェクト
    const state = {
        cardName: '',
        cardRuby: '',
        cardNameSize: 48,
        atk: 2,
        hp: 2,
        leaderHp: 20, // 固定値
        showAtk: true,
        showHp: true,
        showLeaderHp: false,
        cardType: null,
        uploadedImage: null,
        imageScale: 1,
        imagePosX: 0,
        imagePosY: 0,
        allEffects: [],
        activeEffects: [], // MapからArrayに変更
        activeTemplateMap: new Map(),
        effectCost: 0,
        totalCost: 0,
        favoriteEffectIds: [],
        hasShownTriggerWarning: false,
    };

    // DOM要素のキャッシュ
    const elements = {
        cardNameInput: document.getElementById('card-name-input'),
        cardRubyInput: document.getElementById('card-ruby-input'),
        cardNameSizeGroup: document.getElementById('card-name-size-group'),
        imageUpload: document.getElementById('image-upload'),
        imageZoom: document.getElementById('image-zoom'),
        imagePosX: document.getElementById('image-pos-x'),
        imagePosY: document.getElementById('image-pos-y'),
        imageCenterButton: document.getElementById('image-center-button'),
        cardTypeButtonsContainer: document.getElementById('card-type-buttons'),
        atk: {
            decrement: document.getElementById('atk-decrement'),
            increment: document.getElementById('atk-increment'),
            value: document.getElementById('atk-value'),
        },
        hp: {
            decrement: document.getElementById('hp-decrement'),
            increment: document.getElementById('hp-increment'),
            value: document.getElementById('hp-value'),
        },
        leaderHp: {
            value: document.getElementById('leader-hp-value'),
        },
        canvas: document.getElementById('canvas'),
        previewSizeGroup: document.getElementById('preview-size-group'),
        saveButton: document.getElementById('save-button'),
        totalCost: document.getElementById('total-cost'),
        effectCostTotal: document.getElementById('effect-cost-total'),
        effectsMenu: document.getElementById('effects-menu'),
        effectSearchInput: document.getElementById('effect-search-input'),
        resetEffectsButton: document.getElementById('reset-effects-button'),
        expandCollapseEffectsButton: document.getElementById('expand-collapse-effects-button'),
        tocContent: document.getElementById('toc-content'),
        favoriteEffectsContent: document.getElementById('favorite-effects-content'),
        selectedEffectsContainer: document.getElementById('selected-effects-container'),
    };

    const ctx = elements.canvas.getContext('2d');

    function showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000); // Matches CSS animation duration
    }

    const cardTypeData = {
        "ユニット": { cost: 0, color: "#ff5555" },
        "スキル":   { cost: -1, color: "#5555ff" },
        "トラップ": { cost: 0, color: "#800080" },
        "建物":     { cost: 1, color: "#32cd32" },
        "武器":     { cost: 0, color: "#ff9900" },
        "防具":     { cost: 1, color: "#00ced1" },
        "リーダー": { cost: 0, color: "#333333" },
    };

    const cardTypeSummaries = {
        "ユニット": "攻撃と防御の要となる、場に出して戦うカード。",
        "スキル": "使い切りで即座に効果を発動するカード。",
        "トラップ": "条件を満たすと相手のターン中でも割り込んで発動できるカード。",
        "建物": "場に残り続け、お互いに毎ターン効果を発動できるカード。",
        "武器": "リーダーが装備し、自身のATKで攻撃できるようになるカード。",
        "防具": "リーダーが装備し、受けるダメージを肩代わりするカード。",
        "リーダー": "ゲームの主役となる、プレイヤー自身を表す特別なカード。"
    };

    const categoryRestrictions = {
        "【01】召喚条件系": ["ユニット", "建物", "武器", "防具"],
        "【02】使用条件系": ["スキル", "リーダー", "トラップ"],
        "【03】基礎効果系A": ["ユニット", "武器", "防具"],
        "【04】基礎効果系B": ["ユニット", "スキル", "トラップ", "建物", "武器", "防具"],
        "【05】発動条件系": ["ユニット", "武器", "防具"],
        "【13】トラップ専用": ["トラップ"],
    };

    // --- 描画関数 ---
    const render = () => {
        const borderWidth = 10;
        const bottomBarHeight = 70;
        ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

        // 1. 画像を描画
        if (state.uploadedImage && state.uploadedImage.complete) {
            ctx.save();
            ctx.rect(borderWidth, borderWidth, elements.canvas.width - borderWidth * 2, elements.canvas.height - borderWidth - bottomBarHeight);
            ctx.clip();
            const w = state.uploadedImage.width * state.imageScale;
            const h = state.uploadedImage.height * state.imageScale;
            const x = state.imagePosX + (elements.canvas.width / 2) - (w / 2);
            const y = state.imagePosY + (elements.canvas.height - bottomBarHeight) / 2 - (h / 2);
            ctx.drawImage(state.uploadedImage, x, y, w, h);
            ctx.restore();
        }

        // 2. 縁を描画
        if (state.cardType && cardTypeData[state.cardType]) {
            ctx.fillStyle = cardTypeData[state.cardType].color;
            ctx.fillRect(0, 0, elements.canvas.width, borderWidth); // Top
            ctx.fillRect(0, 0, borderWidth, elements.canvas.height); // Left
            ctx.fillRect(elements.canvas.width - borderWidth, 0, borderWidth, elements.canvas.height); // Right
        }

        // 3. テキスト要素の描画
        const setTextStyleWithShadow = () => {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.strokeStyle = 'black';
            ctx.fillStyle = 'white';
        };

        setTextStyleWithShadow();
        const cardNameX = 25;
        const topMargin = 15;

        // Draw Ruby
        if (state.cardRuby) {
            const rubySize = state.cardNameSize * 0.4;

            // Temporarily set card name font to calculate its width
            ctx.font = `900 ${state.cardNameSize}px "Noto Sans JP", serif`;
            const cardNameWidth = ctx.measureText(state.cardName).width;

            // Set font for ruby
            ctx.font = `700 ${rubySize}px "Noto Sans JP", serif`;
            ctx.lineWidth = Math.max(1, rubySize / 8);
            ctx.textBaseline = 'top';

            const rubyWidth = ctx.measureText(state.cardRuby).width;
            const rubyChars = state.cardRuby.split('');
            
            let letterSpacing = 0;
            // Adjust spacing only if ruby is shorter than the name and has more than one character
            if (cardNameWidth > rubyWidth && rubyChars.length > 1) {
                letterSpacing = (cardNameWidth - rubyWidth) / (rubyChars.length - 1);
            }

            // Draw ruby character by character with adjusted spacing
            let currentX = cardNameX;
            rubyChars.forEach(char => {
                ctx.strokeText(char, currentX, topMargin);
                ctx.fillText(char, currentX, topMargin);
                currentX += ctx.measureText(char).width + letterSpacing;
            });
        }

        // Draw Card Name
        const cardNameY = topMargin + (state.cardRuby ? state.cardNameSize * 0.4 + 2 : 0);
        ctx.font = `900 ${state.cardNameSize}px "Noto Sans JP", serif`;
        ctx.lineWidth = Math.max(2, state.cardNameSize / 8);
        ctx.textBaseline = 'top';
        ctx.strokeText(state.cardName, cardNameX, cardNameY);
        ctx.fillText(state.cardName, cardNameX, cardNameY);
        ctx.textBaseline = 'alphabetic';

        const cardNameBottom = cardNameY + state.cardNameSize; // Approximate bottom of the card name text
        const costStarY = cardNameBottom + 25 + 5; // Position stars with a fixed margin below the name
        drawCostStars(setTextStyleWithShadow, costStarY);
        drawEffects();
        drawBottomBar();

        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    };

    const drawCostStars = (applyStyle, startY) => {
        applyStyle();
        ctx.font = '400 38px "Noto Sans JP", serif';
        ctx.lineWidth = 6;
        const starsCount = Math.max(0, state.totalCost);
        for (let i = 0; i < starsCount; i++) {
            if (i < 4) ctx.fillStyle = 'yellow';
            else if (i < 8) ctx.fillStyle = 'orange';
            else ctx.fillStyle = 'red';
            ctx.strokeText('★', 27 + i * 50, startY);
            ctx.fillText('★', 27 + i * 50, startY);
        }
    };

    const drawBottomBar = () => {
        const barHeight = 70;
        const yPos = elements.canvas.height - barHeight;
        const textY = yPos + barHeight / 2;

        if (state.cardType && cardTypeData[state.cardType]) {
            ctx.fillStyle = cardTypeData[state.cardType].color;
            ctx.fillRect(0, yPos, elements.canvas.width, barHeight);
        }

        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';

        if (state.cardType) {
            ctx.font = "bold 28px Noto Sans JP";
            const textMetrics = ctx.measureText(state.cardType);
            const textX = (elements.canvas.width - textMetrics.width) / 2;
            ctx.fillText(state.cardType, textX, textY);
        }

        ctx.font = '900 40px "Noto Sans JP", serif';
        if (state.showAtk) {
            ctx.fillText('ATK ', 30, textY);
            ctx.font = '900 64px "Noto Sans JP", serif';
            ctx.fillText(state.atk, 115, textY);
        }
        if (state.showHp) {
            ctx.font = '900 40px "Noto Sans JP", serif';
            ctx.fillText('HP', 495, textY);
            ctx.font = '900 64px "Noto Sans JP", serif';
            ctx.fillText(state.hp, 560, textY);
        }
        if (state.showLeaderHp) {
            ctx.font = '900 40px "Noto Sans JP", serif';
            ctx.fillText('HP', 465, textY);
            ctx.font = '900 64px "Noto Sans JP", serif';
            ctx.fillText(state.leaderHp, 530, textY);
        }
        ctx.textBaseline = 'alphabetic';
    };
    
    const drawEffects = () => {
        const effectTexts = state.activeEffects.map(e => e.name);
        if (effectTexts.length === 0) return;
        const textBlockHeight = effectTexts.length * 30 + 20;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        drawRoundedRect(ctx, 60, 610, 510, textBlockHeight, 10);
        ctx.fillStyle = 'white';
        ctx.font = '700 19px Noto Sans JP';
        effectTexts.forEach((text, i) => { ctx.fillText(text, 80, 645 + i * 30); });
    };

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y); ctx.arcTo(x + width, y, x + width, y + radius, radius); ctx.lineTo(x + width, y + height - radius); ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius); ctx.lineTo(x + radius, y + height); ctx.arcTo(x, y + height, x, y + height - radius, radius); ctx.lineTo(x, y + radius); ctx.arcTo(x, y, x + radius, y, radius); ctx.closePath(); ctx.fill();
    }

    const validateAndNotify = (isSaving = false) => {
        const applicableTypes = ['ユニット', '武器', '防具'];
        if (!state.cardType || !applicableTypes.includes(state.cardType)) {
            if (state.hasShownTriggerWarning) {
                state.hasShownTriggerWarning = false;
            }
            return;
        }

        const activeCategories = state.activeEffects.map(e => e.category);
        const nonBasicCategories = ['【01】召喚条件系', '【03】基礎効果系A', '【04】基礎効果系B'];
        const hasAdvancedEffect = activeCategories.some(c => c && !nonBasicCategories.includes(c));
        const hasTriggerEffect = activeCategories.includes('【05】発動条件系');

        const needsWarning = hasAdvancedEffect && !hasTriggerEffect;

        if (needsWarning) {
            const message = '選択中の効果は、"【05】発動条件系"の下に記載する必要があります';
            if (isSaving) {
                showNotification(message, 'error');
            } else if (!state.hasShownTriggerWarning) {
                showNotification(message, 'error');
                state.hasShownTriggerWarning = true;
            }
        } else {
            if (state.hasShownTriggerWarning) {
                state.hasShownTriggerWarning = false;
            }
        }
    };

    // --- 更新・計算関数 ---
    const updateUIAvailability = () => {
        const activeCategories = new Set(Array.from(state.activeEffects.values()).map(e => e.category));

        // カードタイプの有効/無効を切り替え
        elements.cardTypeButtonsContainer.querySelectorAll('button').forEach(button => {
            const type = button.dataset.type;
            let isCompatible = true;
            for (const category of activeCategories) {
                const restrictions = categoryRestrictions[category];
                if (restrictions && !restrictions.includes(type)) {
                    isCompatible = false;
                    break;
                }
            }
            button.classList.toggle('disabled', !isCompatible);
        });

        // 効果カテゴリの有効/無効を切り替え
        elements.effectsMenu.querySelectorAll('.category-header').forEach(header => {
            const categoryName = header.textContent.trim();
            const restrictions = categoryRestrictions[categoryName];

            if (restrictions) {
                // This category has rules. Apply them.
                const isDisabled = state.cardType && !restrictions.includes(state.cardType);
                header.classList.toggle('disabled', isDisabled);
            } else {
                // This is a common category. It should always be enabled.
                header.classList.remove('disabled');
            }
        });
    };

    const updateAccordionHighlights = () => {
        elements.effectsMenu.querySelectorAll('.is-active-parent').forEach(el => el.classList.remove('is-active-parent'));
        for (const effect of state.activeEffects.values()) {
            const button = elements.effectsMenu.querySelector(`button[data-id="${effect.id}"]`);
            if (button) {
                const groupHeader = button.closest('.effect-group')?.querySelector('.effect-group-header');
                if (groupHeader) groupHeader.classList.add('is-active-parent');
                const categoryHeader = button.closest('.category-items')?.previousElementSibling;
                if (categoryHeader) categoryHeader.classList.add('is-active-parent');
            }
        }
    };

    const updateState = () => {
        const cardTypeCost = state.cardType ? cardTypeData[state.cardType].cost : 0;
        state.effectCost = 0;
        for (const effect of state.activeEffects) {
            state.effectCost += effect.cost;
        }
        state.totalCost = state.atk + state.hp + state.effectCost + cardTypeCost - 4;
        elements.effectCostTotal.textContent = state.effectCost;
        elements.totalCost.textContent = state.totalCost;

        if (state.cardType === 'リーダー' && state.totalCost <= 1) {
            elements.totalCost.style.color = 'red';
        } else {
            elements.totalCost.style.color = '';
        }

        updateAccordionHighlights();
        updateUIAvailability();
        render();
        renderSelectedEffects();

        // Update active state for all buttons
        const allButtons = document.querySelectorAll('#effects-menu button, #favorite-effects-content button');
        allButtons.forEach(btn => {
            const id = parseInt(btn.dataset.id, 10);
            if (!isNaN(id)) {
                btn.classList.toggle('active', state.activeEffects.some(e => e.id === id));
            }
        });
        updateFavoriteIcons();
        validateAndNotify();
    };

    // --- UI生成関数 ---
    const createCardTypeButtons = () => {
        Object.keys(cardTypeData).forEach(type => {
            const button = document.createElement('button');
            button.textContent = type;
            button.dataset.type = type;
            
            const description = cardTypeSummaries[type];
            if (description) {
                button.dataset.tooltip = description;
            }

            elements.cardTypeButtonsContainer.appendChild(button);
        });
    };

    const getTooltipDescription = (name) => {
        let description = ruleDescriptions.get(name);
        if (description) return description;

        // ユニオンのパターンに対応
        if (name.startsWith('ユニオン「')) {
            description = ruleDescriptions.get('ユニオン');
            if (description) return description;
        }

        // エクシードn：のパターンに対応
        if (name.match(/^エクシード\d+：$/)) {
            description = ruleDescriptions.get('エクシードn');
            if (description) return description;
        }

        // アビリティ：のパターンに対応
        if (name === 'アビリティ：') {
            description = ruleDescriptions.get('アビリティ');
            if (description) return description;
        }

        // スキルリンク：のパターンに対応
        if (name === 'スキルリンク：') {
            description = ruleDescriptions.get('スキルリンク');
            if (description) return description;
        }

        if (name.includes('毒状態にする')) return ruleDescriptions.get('毒');
        if (name.includes('麻痺状態にする')) return ruleDescriptions.get('麻痺');
        if (name.includes('封印状態にする')) return ruleDescriptions.get('封印');
        
        return null;
    };

    const createEffectButtons = () => {
        const categories = {};
        state.allEffects.forEach(effect => {
            const category = effect.category || '未分類';
            if (!categories[category]) categories[category] = [];
            categories[category].push(effect);
        });

        elements.effectsMenu.innerHTML = '';
        for (const category in categories) {
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'category-header';
            categoryHeader.textContent = category;
            elements.effectsMenu.appendChild(categoryHeader);

            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'category-items is-closed';
            categories[category].forEach(effect => {
                if (effect.isGroup && effect.variants.length > 1) {
                    const groupDiv = document.createElement('div');
                    groupDiv.className = 'effect-group';
                    const groupHeader = document.createElement('div');
                    groupHeader.className = 'effect-group-header';
                    groupHeader.textContent = effect.template;
                    groupHeader.dataset.template = effect.template;
                    
                    const variantsDiv = document.createElement('div');
                    variantsDiv.className = 'effect-group-variants is-closed';
                    effect.variants.forEach(variant => {
                        const button = document.createElement('button');
                        button.innerHTML = `<span class="effect-name">${variant.name}</span><span class="effect-cost-display">${variant.cost}</span><i class="favorite-icon">♥</i>`;
                        button.dataset.id = variant.id;
                        button.dataset.template = effect.template;
                        button.dataset.cost = variant.cost;
                        const description = getTooltipDescription(variant.name);
                        if (description) {
                            button.dataset.tooltip = description;
                        }
                        variantsDiv.appendChild(button);
                    });
                    groupDiv.appendChild(groupHeader);
                    groupDiv.appendChild(variantsDiv);
                    itemsContainer.appendChild(groupDiv);
                } else {
                    const effectToDisplay = (effect.isGroup && effect.variants.length === 1) ? effect.variants[0] : effect;
                    const button = document.createElement('button');
                    button.innerHTML = `<span class="effect-name">${effectToDisplay.name}</span><span class="effect-cost-display">${effectToDisplay.cost}</span><i class="favorite-icon">♥</i>`;
                    button.dataset.id = effectToDisplay.id;
                    button.dataset.cost = effectToDisplay.cost;
                    if (effect.isGroup) button.dataset.template = effect.template;
                    
                    const description = getTooltipDescription(effectToDisplay.name);
                    if (description) {
                        button.dataset.tooltip = description;
                    }
                    itemsContainer.appendChild(button);
                }
            });
            elements.effectsMenu.appendChild(itemsContainer);
        }

        // TOCの生成
        elements.tocContent.innerHTML = '';
        for (const category in categories) {
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = category;
            link.dataset.category = category;
            elements.tocContent.appendChild(link);
        }
    };

    const renderSelectedEffects = () => {
        elements.selectedEffectsContainer.innerHTML = '';
        state.activeEffects.forEach(effect => {
            const effectEl = document.createElement('div');
            effectEl.className = 'selected-effect-item';
            effectEl.draggable = true;
            effectEl.dataset.id = effect.id;
            effectEl.innerHTML = `
                <div class="move-buttons">
                    <button class="move-up-button">▲</button>
                    <button class="move-down-button">▼</button>
                </div>
                <span class="effect-name">${effect.name}</span>
                <span class="effect-cost-display">${effect.cost}</span>
                <button class="remove-effect-button">×</button>
            `;
            elements.selectedEffectsContainer.appendChild(effectEl);
        });
    };

    const setupHoverAccordion = () => {
        // Hover functionality disabled as per user request.
    };
    
    // --- イベントハンドラ ---
    let touchState = {
        lastPos: null,
        lastDist: null,
        isPanning: false,
        isPinching: false
    };

    function getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            touchState.isPanning = true;
            touchState.lastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            touchState.isPinching = true;
            touchState.isPanning = false; // Stop panning when pinching
            touchState.lastDist = getTouchDistance(e.touches);
        }
    }

    function handleTouchMove(e) {
        e.preventDefault();
        if (touchState.isPanning && e.touches.length === 1) {
            const dx = e.touches[0].clientX - touchState.lastPos.x;
            const dy = e.touches[0].clientY - touchState.lastPos.y;
            
            state.imagePosX += dx;
            state.imagePosY += dy;
            
            elements.imagePosX.value = state.imagePosX;
            elements.imagePosY.value = state.imagePosY;

            touchState.lastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            render();
        } else if (touchState.isPinching && e.touches.length === 2) {
            const newDist = getTouchDistance(e.touches);
            const scaleChange = newDist / touchState.lastDist;
            
            state.imageScale *= scaleChange;
            state.imageScale = Math.max(0.1, Math.min(state.imageScale, 10)); // Clamp scale
            elements.imageZoom.value = state.imageScale;

            touchState.lastDist = newDist;
            render();
        }
    }

    function handleTouchEnd(e) {
        e.preventDefault();
        if (e.touches.length < 2) {
            touchState.isPinching = false;
            touchState.lastDist = null;
        }
        if (e.touches.length < 1) {
            touchState.isPanning = false;
            touchState.lastPos = null;
        }
    }

    const getEffectLimit = (cost) => {
        const c = cost !== undefined ? cost : state.totalCost;
        if (c >= 1 && c <= 4) return 4;
        if (c >= 5 && c <= 8) return 5;
        if (c >= 9 && c <= 10) return 6;
        return Infinity;
    };

            const renderFavoriteEffects = () => {
        if (!elements.favoriteEffectsContent) return;
        elements.favoriteEffectsContent.innerHTML = '';
        const allOriginalEffects = state.allEffects.flatMap(e => e.isGroup ? e.variants : e);

        state.favoriteEffectIds.forEach(id => {
            const effect = allOriginalEffects.find(e => e.id === id);
            if (effect) {
                const button = document.createElement('button');
                button.innerHTML = `<span class="effect-name">${effect.name}</span><span class="effect-cost-display">${effect.cost}</span><i class="favorite-icon">♥</i>`;
                button.dataset.id = effect.id;
                button.dataset.cost = effect.cost;
                if (allOriginalEffects.find(e => e.id === id)?.template) {
                    button.dataset.template = allOriginalEffects.find(e => e.id === id).template;
                }
                const description = getTooltipDescription(effect.name);
                if (description) {
                    button.dataset.tooltip = description;
                }
                elements.favoriteEffectsContent.appendChild(button);
            }
        });
        // After rendering, update active state and favorite icons
        updateState(); 
    };

    const updateFavoriteIcons = () => {
        const allButtons = document.querySelectorAll('#effects-menu button, #favorite-effects-content button');
        allButtons.forEach(button => {
            const id = parseInt(button.dataset.id, 10);
            if (isNaN(id)) return;
            const icon = button.querySelector('.favorite-icon');
            if (icon) {
                icon.classList.toggle('is-favorite', state.favoriteEffectIds.includes(id));
            }
        });
    };

    const handleFavoriteClick = (id) => {
        if (state.favoriteEffectIds.includes(id)) {
            state.favoriteEffectIds = state.favoriteEffectIds.filter(favId => favId !== id);
        } else {
            state.favoriteEffectIds.push(id);
        }
        localStorage.setItem('yuakuri_favorite_effects', JSON.stringify(state.favoriteEffectIds));
        renderFavoriteEffects();
        updateFavoriteIcons();
    };

    const handleEffectButtonClick = (target) => {
        const id = parseInt(target.dataset.id, 10);
        const isAdding = !target.classList.contains('active');
        const template = target.dataset.template;
        const allOriginalEffects = state.allEffects.flatMap(e => e.isGroup ? e.variants : e);
        const effect = allOriginalEffects.find(e => e.id === id);
        if (!effect) return;

        if (isAdding) {
            if (state.cardType) {
                const restrictions = categoryRestrictions[effect.category];
                if (restrictions && !restrictions.includes(state.cardType)) {
                    showNotification(`選択中のカードタイプ「${state.cardType}」には、カテゴリ「${effect.category}」の効果は追加できません。`, 'error');
                    return;
                }
            }
            let costChange = effect.cost;
            let effectCountChange = 1;
            if (template) {
                const activeIdInGroup = state.activeTemplateMap.get(template);
                if (activeIdInGroup) {
                    const oldEffect = state.activeEffects.find(e => e.id === activeIdInGroup);
                    if (oldEffect) {
                        costChange -= oldEffect.cost;
                        effectCountChange = 0;
                    }
                }
            }
            const cardTypeCost = state.cardType ? cardTypeData[state.cardType].cost : 0;
            const potentialEffectCost = state.effectCost + costChange;
            const potentialTotalCost = state.atk + state.hp + potentialEffectCost + cardTypeCost - 4;
            const effectLimit = getEffectLimit(potentialTotalCost);
            const potentialEffectCount = state.activeEffects.length + effectCountChange;
            if (potentialEffectCount > effectLimit) {
                showNotification(`コストが${potentialTotalCost}になるため、効果を${potentialEffectCount}個つけることはできません。(上限: ${effectLimit}個)`, 'error');
                return;
            }
        }

        if (template) {
            const activeIdInGroup = state.activeTemplateMap.get(template);
            if (activeIdInGroup === id) {
                state.activeEffects = state.activeEffects.filter(e => e.id !== id);
                state.activeTemplateMap.delete(template);
            } else {
                if (activeIdInGroup) {
                    state.activeEffects = state.activeEffects.filter(e => e.id !== activeIdInGroup);
                }
                state.activeEffects.push({ ...effect });
                state.activeTemplateMap.set(template, id);
            }
        } else {
            if (state.activeEffects.some(e => e.id === id)) {
                state.activeEffects = state.activeEffects.filter(e => e.id !== id);
            } else {
                let effectToAdd = { ...effect };
                if (effect.isCustom) {
                    const newValue = prompt('新しい値を入力してください', effect.name);
                    if (newValue === null) return;
                    effectToAdd.name = newValue || effect.name;
                }
                state.activeEffects.push(effectToAdd);
            }
        }
        updateState();
    };

    const handleEffectSearch = (e) => {

                const searchTerm = elements.effectSearchInput.value.toLowerCase();

                elements.effectsMenu.querySelectorAll('.category-header').forEach(header => {

                    const itemsContainer = header.nextElementSibling;

                    let categoryHasVisibleItems = false;

        

                    // Filter individual buttons first

                    itemsContainer.querySelectorAll('button').forEach(button => {

                        const itemName = button.textContent.toLowerCase();

                        const isMatch = itemName.includes(searchTerm);

                        button.style.display = isMatch ? '' : 'none';

                    });

        

                    // Then, update visibility of group headers based on their children

                    itemsContainer.querySelectorAll('.effect-group').forEach(group => {

                        const hasVisibleChild = !!group.querySelector('button:not([style*="display: none"])');

                        const groupHeader = group.querySelector('.effect-group-header');

                        if (groupHeader) {

                            groupHeader.style.display = hasVisibleChild ? '' : 'none';

                            if(hasVisibleChild) categoryHasVisibleItems = true;

                        }

                    });

                    

                    // Check for non-grouped buttons at the category root

                    if (itemsContainer.querySelector(':scope > button:not([style*="display: none"])')) {

                        categoryHasVisibleItems = true;

                    }

        

                    header.style.display = categoryHasVisibleItems ? '' : 'none';

                    if (searchTerm && categoryHasVisibleItems) {

                        itemsContainer.classList.remove('is-closed');

                        header.classList.add('is-open');

                    }

                });

            };

        

                const setupEventListeners = () => {

        

                    elements.cardNameInput.addEventListener('input', e => { state.cardName = e.target.value; render(); });

        

                    elements.cardRubyInput.addEventListener('input', e => { state.cardRuby = e.target.value; render(); });

                

                elements.cardNameSizeGroup.addEventListener('click', e => {

                    if(e.target.tagName !== 'BUTTON') return;

                    state.cardNameSize = parseInt(e.target.dataset.size, 10);

                    elements.cardNameSizeGroup.querySelector('.active')?.classList.remove('active');

                    e.target.classList.add('active');

                    render();

                });

        

                elements.previewSizeGroup.addEventListener('click', e => {

                    if(e.target.tagName !== 'BUTTON') return;

                    const size = e.target.dataset.size;

                    elements.canvas.style.width = size + '%';

                    elements.previewSizeGroup.querySelector('.active')?.classList.remove('active');

                    e.target.classList.add('active');

                });

        

                elements.imageUpload.addEventListener('change', function () {

                    if (this.files && this.files[0]) {

                        const reader = new FileReader();

                        reader.onload = (e) => {

                            const img = new Image();

                            img.onload = () => {

                                state.uploadedImage = img;

                                const scale = Math.max(elements.canvas.width / img.width, (elements.canvas.height - 70) / img.height);

                                state.imageScale = scale;

                                state.imagePosX = 0;

                                state.imagePosY = 0;

                                elements.imageZoom.value = scale;

                                elements.imagePosX.value = 0;

                                elements.imagePosY.value = 0;

                                render();

                            };

                            img.src = e.target.result;

                        };

                        reader.readAsDataURL(this.files[0]);

                    }

                });

        

                elements.imageZoom.addEventListener('input', e => { state.imageScale = parseFloat(e.target.value); render(); });

                elements.imagePosX.addEventListener('input', e => { state.imagePosX = parseInt(e.target.value, 10); render(); });

                elements.imagePosY.addEventListener('input', e => { state.imagePosY = parseInt(e.target.value, 10); render(); });

        

                elements.canvas.addEventListener('touchstart', handleTouchStart, { passive: false });

                elements.canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

                elements.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

        

                elements.imageCenterButton.addEventListener('click', () => {

                    if (!state.uploadedImage) return;

                    const img = state.uploadedImage;

                    const scale = Math.max(elements.canvas.width / img.width, (elements.canvas.height - 70) / img.height);

                    state.imageScale = scale;

                    state.imagePosX = 0;

                    state.imagePosY = 0;

                    elements.imageZoom.value = scale;

                    elements.imagePosX.value = 0;

                    elements.imagePosY.value = 0;

                    render();

                });

        

                elements.cardTypeButtonsContainer.addEventListener('click', e => {

                    if (e.target.tagName !== 'BUTTON' || e.target.classList.contains('disabled')) return;

                    const type = e.target.dataset.type;

                    state.cardType = state.cardType === type ? null : type;

                    elements.cardTypeButtonsContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));

                    if (state.cardType) e.target.classList.add('active');

        

                    const setStatus = (show, value, name) => {

                        state[name] = value;

                        state[`show${name.charAt(0).toUpperCase() + name.slice(1)}`] = show;

                        elements[name].value.textContent = value;

        

                        const controlWrapper = elements[name].value.closest('.status-item');

                        if (controlWrapper) {

                            controlWrapper.style.display = show ? '' : 'none';

                        }

                    };

        

                    // まず全てのステータスを表示状態に戻す

                    setStatus(true, state.atk, 'atk');

                    setStatus(true, state.hp, 'hp');

        

                    state.showLeaderHp = (state.cardType === 'リーダー');

        

                    switch (state.cardType) {

                        case '防具':

                            setStatus(false, 2, 'atk');

                            break;

                        case '建物':

                        case 'スキル':

                        case 'トラップ':

                        case 'リーダー':

                            setStatus(false, 2, 'atk');

                            setStatus(false, 2, 'hp');

                            break;

                    }

        

                    updateState();

                });

        

                const setupStatusHandler = (name, min, max) => {

                    elements[name].increment.addEventListener('click', () => {

                        if (state[name] < max) state[name]++;

                        elements[name].value.textContent = state[name];

                        updateState();

                    });

                    elements[name].decrement.addEventListener('click', () => {

                        if (state[name] > min) state[name]--;

                        elements[name].value.textContent = state[name];

                        updateState();

                    });

                };

                setupStatusHandler('atk', 1, 9); setupStatusHandler('hp', 1, 9);

        

                        elements.effectsMenu.addEventListener('click', e => {

        

                            const target = e.target;

        

                            if (target.classList.contains('favorite-icon')) {

        

                                const button = target.closest('button');

        

                                const id = parseInt(button.dataset.id, 10);

        

                                handleFavoriteClick(id);

        

                                return;

        

                            }

        

                            if (target.classList.contains('category-header') || target.classList.contains('effect-group-header')) {

        

                                if (target.classList.contains('disabled')) return;

        

                                target.nextElementSibling.classList.toggle('is-closed');

        

                                target.classList.toggle('is-open');

        

                                return;

        

                            }

        

                            const button = target.closest('button');

        

                            if (button) {

        

                                handleEffectButtonClick(button);

        

                            }

        

                        });

        

                

        

                        elements.favoriteEffectsContent.addEventListener('click', e => {

        

                            const target = e.target;

        

                            if (target.classList.contains('favorite-icon')) {

        

                                const button = target.closest('button');

        

                                const id = parseInt(button.dataset.id, 10);

        

                                handleFavoriteClick(id);

        

                                return;

        

                            }

        

                            const button = target.closest('button');

        

                            if (button) {

        

                                handleEffectButtonClick(button);

        

                            }

        

                        });

        

                elements.effectSearchInput.addEventListener('input', handleEffectSearch);

        elements.selectedEffectsContainer.addEventListener('click', e => {
            const effectItem = e.target.closest('.selected-effect-item');
            if (!effectItem) return;

            const idToMove = parseInt(effectItem.dataset.id, 10);
            const currentIndex = state.activeEffects.findIndex(effect => effect.id === idToMove);

            if (e.target.classList.contains('remove-effect-button')) {
                const idToRemove = parseInt(effectItem.dataset.id, 10);
                state.activeEffects = state.activeEffects.filter(effect => effect.id !== idToRemove);
                // テンプレート効果の場合、activeTemplateMapからも削除
                for (const [template, id] of state.activeTemplateMap.entries()) {
                    if (id === idToRemove) {
                        state.activeTemplateMap.delete(template);
                        break;
                    }
                }
                updateState();
            } else if (e.target.classList.contains('move-up-button')) {
                if (currentIndex > 0) {
                    const newIndex = currentIndex - 1;
                    const [movedEffect] = state.activeEffects.splice(currentIndex, 1);
                    state.activeEffects.splice(newIndex, 0, movedEffect);
                    updateState();
                }
            } else if (e.target.classList.contains('move-down-button')) {
                if (currentIndex < state.activeEffects.length - 1) {
                    const newIndex = currentIndex + 1;
                    const [movedEffect] = state.activeEffects.splice(currentIndex, 1);
                    state.activeEffects.splice(newIndex, 0, movedEffect);
                    updateState();
                }
            }
        });

        let draggedId = null;

        elements.selectedEffectsContainer.addEventListener('dragstart', e => {
            draggedId = parseInt(e.target.dataset.id, 10);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedId);
            e.target.classList.add('dragging');
        });

        elements.selectedEffectsContainer.addEventListener('dragover', e => {
            e.preventDefault(); // Allow drop
            const draggingEl = document.querySelector('.dragging');
            if (!draggingEl) return;

            const afterElement = getDragAfterElement(elements.selectedEffectsContainer, e.clientY);
            const currentHoveredId = afterElement ? parseInt(afterElement.dataset.id, 10) : null;

            // Remove existing indicators
            elements.selectedEffectsContainer.querySelectorAll('.drag-indicator').forEach(indicator => indicator.remove());

            if (afterElement == null) {
                // Append to the end
                const indicator = document.createElement('div');
                indicator.classList.add('drag-indicator');
                elements.selectedEffectsContainer.appendChild(indicator);
            } else {
                // Insert before the afterElement
                const indicator = document.createElement('div');
                indicator.classList.add('drag-indicator');
                elements.selectedEffectsContainer.insertBefore(indicator, afterElement);
            }
        });

        elements.selectedEffectsContainer.addEventListener('dragleave', () => {
            elements.selectedEffectsContainer.querySelectorAll('.drag-indicator').forEach(indicator => indicator.remove());
        });

        elements.selectedEffectsContainer.addEventListener('drop', e => {
            e.preventDefault();
            elements.selectedEffectsContainer.querySelectorAll('.drag-indicator').forEach(indicator => indicator.remove());

            const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
            const draggedEffectIndex = state.activeEffects.findIndex(effect => effect.id === id);
            if (draggedEffectIndex === -1) return;

            const draggedEffect = state.activeEffects[draggedEffectIndex];
            state.activeEffects.splice(draggedEffectIndex, 1); // Remove from old position

            const afterElement = getDragAfterElement(elements.selectedEffectsContainer, e.clientY);
            const dropIndex = afterElement ? state.activeEffects.findIndex(effect => effect.id === parseInt(afterElement.dataset.id, 10)) : state.activeEffects.length;

            state.activeEffects.splice(dropIndex, 0, draggedEffect); // Insert into new position
            updateState();
        });

        elements.selectedEffectsContainer.addEventListener('dragend', e => {
            e.target.classList.remove('dragging');
            elements.selectedEffectsContainer.querySelectorAll('.drag-indicator').forEach(indicator => indicator.remove());
            draggedId = null;
        });

        function getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll('.selected-effect-item:not(.dragging)')];

            return draggableElements.find(child => {
                const box = child.getBoundingClientRect();
                return y <= box.top + box.height / 2; // ドロップ位置が要素の上半分にある場合
            });
        }

        elements.resetEffectsButton.addEventListener('click', () => {
            state.activeEffects = [];
            state.activeTemplateMap.clear();
            elements.effectsMenu.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            updateState();
        });

        elements.expandCollapseEffectsButton.addEventListener('click', e => {
            const button = e.target;
            const shouldExpand = elements.effectsMenu.querySelector('.is-closed');
    
            if (shouldExpand) {
                elements.effectsMenu.querySelectorAll('.is-closed').forEach(el => el.classList.remove('is-closed'));
                elements.effectsMenu.querySelectorAll('.category-header, .effect-group-header').forEach(el => el.classList.add('is-open'));
                button.textContent = 'すべて閉じる';
            } else {
                elements.effectsMenu.querySelectorAll('.category-items, .effect-group-variants').forEach(el => el.classList.add('is-closed'));
                elements.effectsMenu.querySelectorAll('.category-header, .effect-group-header').forEach(el => el.classList.remove('is-open'));
                button.textContent = 'すべて展開';
            }
        });

        elements.saveButton.addEventListener('click', () => {
            validateAndNotify(true);
            if (!state.cardType) {
                showNotification('先にカードタイプを選択してください。', 'error');
                return;
            }
            if (state.totalCost > 10) {
                showNotification('合計コストが11以上のカードは保存できません。', 'error');
                return;
            }
            if (state.totalCost <= 0) {
                showNotification('合計コストが0以下のカードは保存できません。', 'error');
                return;
            }
            const link = document.createElement('a');
            link.href = elements.canvas.toDataURL('image/png');

            const filenameParts = [state.cardType];
            filenameParts.push(`${state.totalCost}コスト`);

            if (state.showAtk) {
                filenameParts.push(`ATK${state.atk}`);
            }
            if (state.showHp) {
                filenameParts.push(`HP${state.hp}`);
            }
            filenameParts.push(state.cardName || 'card');

            const filename = filenameParts.join('_');

            link.download = `${filename}.png`;
            link.click();
        });

        elements.tocContent.addEventListener('click', e => {
            e.preventDefault();
            if (e.target.tagName !== 'A') return;

            const category = e.target.dataset.category;
            const header = Array.from(elements.effectsMenu.querySelectorAll('.category-header')).find(h => h.textContent === category);

            if (header) {
                header.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        // Add to Deck Button
        const addToDeckBtn = document.getElementById('add-to-deck-button');
        if (addToDeckBtn) {
            addToDeckBtn.addEventListener('click', () => {
                if (!state.cardType || !state.cardName) {
                    showNotification('カードタイプとカード名を設定してください。', 'error');
                    return;
                }

                // Generate filename like in the save button
                const filenameParts = [state.cardType];
                if (state.totalCost) filenameParts.push(`${state.totalCost}コスト`);
                if (state.showAtk) filenameParts.push(`ATK${state.atk}`);
                if (state.showHp) filenameParts.push(`HP${state.hp}`);
                filenameParts.push(state.cardName || 'card');
                const filename = `${filenameParts.join('_')}.png`;

                // Create a card object from the current state
                const cardData = {
                    name: state.cardName,
                    type: state.cardType,
                    cost: state.totalCost,
                    atk: state.showAtk ? state.atk : 0,
                    hp: state.showHp ? state.hp : 0,
                    imageUrl: elements.canvas.toDataURL('image/png'),
                    fileName: filename // Use the generated filename
                };

                // Add to deck builder's card pool if not already present
                const existingCardIndex = deckBuilderState.allCards.findIndex(c => c.name === cardData.name);
                if (existingCardIndex !== -1) {
                    // Update existing card to ensure it has the latest image and filename
                    deckBuilderState.allCards[existingCardIndex] = cardData;
                } else {
                    deckBuilderState.allCards.push(cardData);
                }
                renderCardPool();

                // Add to current deck
                addCardToDeck(cardData.name);

                showNotification(`「${cardData.name}」をデッキに追加しました。`, 'success');

                // Switch to deck builder tab
                document.getElementById('show-deck-builder').click();
            });
        }

        // Collapsible sections
        const setupCollapsible = (header, content) => {
            if (header && content) {
                header.addEventListener('click', () => {
                    header.classList.toggle('is-closed');
                    content.classList.toggle('is-closed');
                });
            }
        };
        setupCollapsible(document.querySelector('#effects-toc-section h3'), document.getElementById('toc-content'));
        setupCollapsible(document.querySelector('#favorite-effects-section h3'), document.getElementById('favorite-effects-content'));
    };

    // --- 初期化関数 ---
    const groupSimilarEffects = (effects) => {
        const effectGroups = new Map();
        const noGroupKeywords = ['2回攻撃'];
        const romanMap = { 'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5 };

        // 新しいグループ化パターンを定義
        const patterns = [
            {
                regex: /^(ユニオン「X\(カード名or〇〇族\)×)(\d+)(」)$/,
                template: 'ユニオン「X(カード名or〇〇族)×○」'
            },
            {
                regex: /^(相手ユニット1体に)(\d+)(ダメージ)$/,
                template: '相手ユニット1体に○ダメージ'
            },
            {
                regex: /^(山札からX族のカードを)(\d+)(枚手札に加える)$/,
                template: '山札からX族のカードを○枚手札に加える'
            },
            {
                regex: /^(山札から「X\(カード名\)」を)(\d+)(枚召喚する)$/,
                template: '山札から「X(カード名)」を○枚召喚する'
            },
            {
                regex: /^(墓地から「X\(カード名\)」を)(\d+)(枚召喚する)$/,
                template: '墓地から「X(カード名)」を○枚召喚する'
            },
            {
                regex: /^(自分または相手の墓地のカードを)(1枚|合計2枚)(ロストさせる)$/,
                template: '自分または相手の墓地のカードを○枚ロストさせる',
                customTemplate: (match) => `自分または相手の墓地のカードを○枚ロストさせる` // match[2]を○に置き換える
            },
            // 特例パターン1: 自分の山札が残り0枚なら(召喚|使用)できる
            {
                regex: /^(自分の山札が残り)(0枚)(なら)(召喚できる|使用できる)$/,
                template: '自分の山札が残り○枚なら(召喚|使用)できる',
                customTemplate: (match) => `自分の山札が残り○枚なら${match[4]}`
            },
            // 特例パターン2: 自分の山札が残りn枚以下なら(召喚|使用)できる
            {
                regex: /^(自分の山札が残り)(\d+)(枚以下なら)(召喚できる|使用できる)$/,
                template: '自分の山札が残り○枚以下なら(召喚|使用)できる',
                customTemplate: (match) => `自分の山札が残り○枚以下なら${match[4]}`
            }
        ];

        effects.forEach(effect => {
            // isCustom の効果もグループ化の対象に含める
            if (noGroupKeywords.includes(effect.name)) {
                effectGroups.set(effect.name, effect);
                return;
            }

            let template = null;

            // 既存のドレイン処理
            const romanMatch = effect.name.match(/^(ドレイン)(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ)$/);
            if (romanMatch) {
                template = `${romanMatch[1]}○`;
                effect.value = romanMap[romanMatch[2]];
            } else {
                // 新しいパターンをチェック
                for (const p of patterns) {
                    const match = effect.name.match(p.regex);
                    if (match) {
                        if (p.customTemplate) {
                            template = p.customTemplate(match);
                        } else {
                            template = match[1] + '○' + match[3];
                        }
                        break;
                    }
                }

                // 既存の数値グループ化処理 (新しいパターンに一致しない場合のみ)
                if (!template) {
                    const match = effect.name.match(/(\d+)/); // Find first number
                    if (match) {
                        const numStr = match[0];
                        const numIndex = effect.name.indexOf(numStr);
                        template = `${effect.name.substring(0, numIndex)}○${effect.name.substring(numIndex + numStr.length)}`;
                    }
                }
            }

            if (template) {
                if (!effectGroups.has(template)) {
                    effectGroups.set(template, {
                        isGroup: true,
                        template: template,
                        category: effect.category,
                        variants: []
                    });
                }
                effectGroups.get(template).variants.push(effect);
            } else {
                effectGroups.set(effect.name, effect);
            }
        });

        // グループ内のバリアントをソート
        effectGroups.forEach(group => {
            if (group.isGroup) {
                group.variants.sort((a, b) => {
                    // 数値部分を抽出して比較
                    const getNum = (name) => {
                        const match = name.match(/(\d+)/);
                        return match ? parseInt(match[1], 10) : 0;
                    };
                    return getNum(a.name) - getNum(b.name);
                });
            }
        });

        return Array.from(effectGroups.values());
    };

    const init = async () => {
        state.favoriteEffectIds = JSON.parse(localStorage.getItem('yuakuri_favorite_effects')) || [];
        parseRuleDescriptions(); // Parse rules from the DOM first

        const initialPreviewSize = elements.previewSizeGroup.querySelector('.active').dataset.size;
        elements.canvas.style.width = initialPreviewSize + '%';
        createCardTypeButtons();
        setupEventListeners();

        try {
            const response = await fetch('assets/data.csv');
            const csvText = await response.text();
            const jsonData = csvText.trim().split('\n').map(line => line.split(','));

            const parsedEffects = jsonData.map((row, index) => ({
                id: index,
                name: row[0],
                cost: parseInt(row[1], 10) || 0,
                category: row[2],
                isCustom: row[4] === 'X'
            })).filter(e => e.name && e.name.trim());

            state.allEffects = groupSimilarEffects(parsedEffects);

            createEffectButtons();
            setupHoverAccordion();
            
            setupTooltips(); // Setup tooltips after all buttons are created

        } catch (error) {
            console.error('Failed to load assets:', error);
        }
        updateState();
        renderFavoriteEffects();
    };

    const updateCanvas = () => {
        render();
        requestAnimationFrame(updateCanvas);
    }

    init();
    requestAnimationFrame(updateCanvas);

    // ==================================================
    // タブスイッチャー関連のコード
    // ==================================================
    const showCardMakerBtn = document.getElementById('show-card-maker');
    const showDeckBuilderBtn = document.getElementById('show-deck-builder');
    const showRuleguideBtn = document.getElementById('show-ruleguide');
    const cardMakerTab = document.getElementById('card-maker-tab');
    const deckBuilderTab = document.getElementById('deck-builder-tab');
    const ruleguideTab = document.getElementById('ruleguide-tab');

    if (showCardMakerBtn) {
        showCardMakerBtn.addEventListener('click', () => {
            showCardMakerBtn.classList.add('active');
            showDeckBuilderBtn.classList.remove('active');
            showRuleguideBtn.classList.remove('active');
            
            cardMakerTab.style.display = 'block';
            deckBuilderTab.style.display = 'none';
            ruleguideTab.style.display = 'none';
        });
    }

    if (showDeckBuilderBtn) {
        showDeckBuilderBtn.addEventListener('click', () => {
            showCardMakerBtn.classList.remove('active');
            showDeckBuilderBtn.classList.add('active');
            showRuleguideBtn.classList.remove('active');

            cardMakerTab.style.display = 'none';
            deckBuilderTab.style.display = 'block';
            ruleguideTab.style.display = 'none';
        });
    }

    if (showRuleguideBtn) {
        showRuleguideBtn.addEventListener('click', () => {
            showCardMakerBtn.classList.remove('active');
            showDeckBuilderBtn.classList.remove('active');
            showRuleguideBtn.classList.add('active');

            cardMakerTab.style.display = 'none';
            deckBuilderTab.style.display = 'none';
            ruleguideTab.style.display = 'block';
        });
    }

    // ==================================================
    // デッキビルダー関連のコード
    // ==================================================
    const deckCardUploadSingle = document.getElementById('deck-card-upload-single');

    const cardPool = document.getElementById('deck-card-pool');
    const deckSelector = document.getElementById('deck-selector');
    const newDeckBtn = document.getElementById('new-deck-btn');
    const saveDeckBtn = document.getElementById('save-deck-btn');
    const deleteDeckBtn = document.getElementById('delete-deck-btn');
    const exportDeckBtn = document.getElementById('export-deck-btn');
    const deckNameInput = document.getElementById('deck-name-input');
    const leaderSlot = document.getElementById('deck-leader-slot');
    const mainDeckList = document.getElementById('deck-main-list');
    const deckCardCount = document.getElementById('deck-card-count');

    // --- State ---
    const deckBuilderState = {
        allCards: [], // All uploaded cards
        savedDecks: {},
        currentDeck: {
            name: '新規デッキ',
            leader: null,
            main: new Map(), // Using a Map to easily handle counts
        }
    };

    const SAVED_DECKS_KEY = 'yuakuri_saved_decks';
    const CURRENT_DECK_KEY = 'yuakuri_currentDeck';

    // --- Functions ---

    /**
     * Updates the disabled state of the save button based on deck validity.
     */
    const updateSaveButtonState = () => {
        if (!saveDeckBtn) return;
        const deck = deckBuilderState.currentDeck;
        const mainDeckCount = Array.from(deck.main.values()).reduce((sum, count) => sum + count, 0);
        
        // The save button is enabled only when a leader is selected and the deck has exactly 30 cards.
        const isReadyToSave = deck.leader && mainDeckCount === 30;
        
        saveDeckBtn.disabled = !isReadyToSave;
    };

    /**
     * Saves the current deck to sessionStorage.
     */
    const saveCurrentDeckToSession = () => {
        const deckToSave = {
            ...deckBuilderState.currentDeck,
            main: Array.from(deckBuilderState.currentDeck.main.entries())
        };
        sessionStorage.setItem(CURRENT_DECK_KEY, JSON.stringify(deckToSave));
    };


    /**
     * Handles card image folder upload
     */
    /**
     * Processes an array of File objects into card data.
     * @param {FileList} files - The files to process.
     * @returns {Promise<Array>} A promise that resolves to an array of card objects.
     */
    const processFilesToCards = (files) => {
        const cardPromises = Array.from(files).map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const fileName = file.name.replace(/\.png|\.jpg|\.jpeg|\.gif/i, '');
                    const parts = fileName.split('_');
                    const type = parts[0] || '不明';
                    let cost = 0, atk = 0, hp = 0;

                    const nameParts = parts.filter((part, index) => {
                        if (index === 0) return false;
                        if (part.endsWith('コスト')) {
                            cost = parseInt(part, 10) || 0;
                            return false;
                        }
                        if (part.startsWith('ATK')) {
                            atk = parseInt(part.substring(3), 10) || 0;
                            return false;
                        }
                        if (part.startsWith('HP')) {
                            hp = parseInt(part.substring(2), 10) || 0;
                            return false;
                        }
                        return true;
                    });
                    const name = nameParts.join(' ') || '名称不明';

                    resolve({ name, type, cost, atk, hp, imageUrl: event.target.result, fileName: file.name });
                };
                reader.readAsDataURL(file);
            });
        });
        return Promise.all(cardPromises);
    };


    /**
     * Handles single/multiple card image file upload, adding to or updating the card pool.
     */
    const handleFilesUpload = async (e) => {
        const files = e.target.files;
        if (!files.length) return;

        showNotification(`読込中... ${files.length}枚のカード`);
        const newCards = await processFilesToCards(files);

        newCards.forEach(newCard => {
            const existingCardIndex = deckBuilderState.allCards.findIndex(c => c.name === newCard.name);
            if (existingCardIndex !== -1) {
                // Update existing card
                deckBuilderState.allCards[existingCardIndex] = newCard;
            } else {
                // Add new card
                deckBuilderState.allCards.push(newCard);
            }
        });

        renderCardPool();
        renderCurrentDeck(); // Re-render deck to show new images
        showNotification(`${files.length}枚のカードを読み込み/更新しました。`, 'success');
    };

    /**
     * Renders all uploaded cards into the card pool area
     */
    const renderCardPool = () => {
        if (!cardPool) return;
        cardPool.innerHTML = '';
        deckBuilderState.allCards.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)).forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'deck-card-item';
            if (card.type === 'リーダー') {
                cardEl.classList.add('is-leader-candidate');
            }
            cardEl.dataset.cardName = card.name;
            cardEl.innerHTML = `<img src="${card.imageUrl}" alt="${card.name}" title="${card.name}">`;
            cardPool.appendChild(cardEl);
        });
    };

    // --- Event Listeners ---

    if (deckCardUploadSingle) {
        deckCardUploadSingle.addEventListener('change', handleFilesUpload);
    }

    /**
     * Finds a card object from the allCards array by its name.
     */
    const getCardByName = (name) => deckBuilderState.allCards.find(c => c.name === name);

    /**
     * Renders the current deck state to the UI
     */
    const renderCurrentDeck = () => {
        const deck = deckBuilderState.currentDeck;
        deckNameInput.value = deck.name;

        // Render leader
        leaderSlot.innerHTML = '';
        if (deck.leader) {
            const card = getCardByName(deck.leader);
            const cardEl = document.createElement('div');
            cardEl.className = 'deck-list-item-builder';
            const imageUrl = card ? card.imageUrl : ''; // Placeholder can be added via CSS
            cardEl.innerHTML = `<img src="${imageUrl}" alt="${deck.leader}" class="${!card ? 'image-missing' : ''}"> <span class="card-name">${deck.leader}</span>`;
            leaderSlot.appendChild(cardEl);
        }

        // Render main deck
        mainDeckList.innerHTML = '';
        let count = 0;
        const sortedMain = new Map([...deck.main.entries()].sort());
        for (const [name, num] of sortedMain) {
            const card = getCardByName(name);
            const itemEl = document.createElement('div');
            itemEl.className = 'deck-list-item-builder';
            const imageUrl = card ? card.imageUrl : ''; // Placeholder can be added via CSS

            itemEl.innerHTML = `
                <img src="${imageUrl}" alt="${name}" class="${!card ? 'image-missing' : ''}">
                <span class="card-name">${name}</span>
                <div class="card-controls">
                    <button data-card-name="${name}" class="deck-remove-one">-</button>
                    <span>${num}</span>
                    <button data-card-name="${name}" class="deck-add-one">+</button>
                </div>
            `;
            mainDeckList.appendChild(itemEl);
            count += num;
        }
        deckCardCount.textContent = count;
        updateSaveButtonState();
    };

    /**
     * Adds a card to the current deck.
     */
    const addCardToDeck = (cardName) => {
        const card = getCardByName(cardName);
        if (!card) return;

        const deck = deckBuilderState.currentDeck.main;
        const currentCount = Array.from(deck.values()).reduce((sum, count) => sum + count, 0);
        if (currentCount >= 30) {
            showNotification('デッキは30枚までです。', 'error');
            return;
        }

        const count = deck.get(cardName) || 0;
        if (count < 3) { // Max 3 copies of a card
            deck.set(cardName, count + 1);
            renderCurrentDeck();
            saveCurrentDeckToSession();
        } else {
            showNotification(`「${cardName}」は3枚までしか入れられません。`, 'error');
        }
    };

    /**
     * Removes one instance of a card from the deck.
     */
    const removeCardFromDeck = (cardName) => {
        const deck = deckBuilderState.currentDeck.main;
        const count = deck.get(cardName);
        if (count > 1) {
            deck.set(cardName, count - 1);
        } else {
            deck.delete(cardName);
        }
        renderCurrentDeck();
        saveCurrentDeckToSession();
    };

    /**
     * Sets the leader for the current deck.
     */
    const setLeader = (cardName) => {
        const card = getCardByName(cardName);
        if (card && card.type === 'リーダー') {
            deckBuilderState.currentDeck.leader = cardName;
            renderCurrentDeck();
            saveCurrentDeckToSession();
        } else {
            showNotification('リーダー以外のカードはリーダーに設定できません。', 'error');
        }
    };

    /**
     * Loads all decks from localStorage and populates the deck selector.
     */
    const loadDecks = () => {
        const decks = JSON.parse(localStorage.getItem(SAVED_DECKS_KEY) || '{}');
        deckBuilderState.savedDecks = decks;
        deckSelector.innerHTML = '';
        for (const deckName in decks) {
            const option = document.createElement('option');
            option.value = deckName;
            option.textContent = deckName;
            deckSelector.appendChild(option);
        }

        // Try to restore the current deck from session storage
        const sessionDeckData = sessionStorage.getItem(CURRENT_DECK_KEY);
        if (sessionDeckData) {
            const parsedDeck = JSON.parse(sessionDeckData);
            deckBuilderState.currentDeck = {
                ...parsedDeck,
                main: new Map(parsedDeck.main)
            };
            // Ensure the deck selector reflects the loaded deck if it's a saved one
            if (deckBuilderState.savedDecks[parsedDeck.name]) {
                deckSelector.value = parsedDeck.name;
            }
            renderCurrentDeck();
        } else {
            // If no session data, load the first saved deck or a new one
            const deckNames = Object.keys(decks);
            if (deckNames.length > 0) {
                loadDeck(deckNames[0]);
            } else {
                loadDeck('新規デッキ');
            }
        }
    };

    /**
     * Loads a specific deck into the editor.
     */
    const loadDeck = (deckName) => {
        if (deckName === '新規デッキ') {
            deckBuilderState.currentDeck = {
                name: '新規デッキ',
                leader: null,
                main: new Map(),
            };
        } else {
            const deckData = deckBuilderState.savedDecks[deckName];
            if (!deckData) return;
            deckBuilderState.currentDeck = {
                name: deckName,
                leader: deckData.leader,
                main: new Map(deckData.main),
            };
        }
        deckSelector.value = deckName;
        renderCurrentDeck();
        saveCurrentDeckToSession();
    };

    /**
     * Saves the current deck to localStorage.
     */
    const saveCurrentDeck = () => {
        const deckName = deckNameInput.value.trim();
        if (!deckName) {
            showNotification('デッキ名を入力してください。', 'error');
            return;
        }

        const deck = deckBuilderState.currentDeck;
        const mainDeckCount = Array.from(deck.main.values()).reduce((sum, count) => sum + count, 0);

        if (!deck.leader) {
            showNotification('リーダーを選択してください。', 'error');
            return;
        }
        if (mainDeckCount !== 30) {
            showNotification(`メインデッキは30枚である必要があります。現在の枚数: ${mainDeckCount}枚`, 'error');
            return;
        }

        deckBuilderState.savedDecks[deckName] = {
            leader: deck.leader,
            main: Array.from(deck.main.entries()),
        };
        deck.name = deckName; // Update the name of the current deck

        localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(deckBuilderState.savedDecks));
        saveCurrentDeckToSession(); // Also update session storage with the new name
        showNotification(`デッキ「${deckName}」を保存しました。`, 'success');
        loadDecks(); // Reload to update the selector
        deckSelector.value = deckName; // Re-select the saved deck
    };

    /**
     * Deletes a deck.
     */
    const deleteCurrentDeck = () => {
        const deckName = deckSelector.value;
        if (!deckName || deckName === '新規デッキ') return;

        if (confirm(`デッキ「${deckName}」を本当に削除しますか？`)) {
            delete deckBuilderState.savedDecks[deckName];
            localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(deckBuilderState.savedDecks));
            showNotification(`デッキ「${deckName}」を削除しました。`, 'info');

            // If the deleted deck was the one being edited, clear the session.
            if (deckBuilderState.currentDeck.name === deckName) {
                sessionStorage.removeItem(CURRENT_DECK_KEY);
            }

            loadDecks();
        }
    };

    // --- Event Listeners (Deck Builder) ---
    const uploadButton = document.getElementById('upload-button');
    if (uploadButton) {
        uploadButton.addEventListener('click', () => {
            document.getElementById('deck-card-upload-single').click();
        });
    }

    cardPool.addEventListener('click', (e) => {
        const cardItem = e.target.closest('.deck-card-item');
        if (!cardItem) return;
        const cardName = cardItem.dataset.cardName;
        const card = getCardByName(cardName);

        if (card.type === 'リーダー') {
            setLeader(cardName);
        } else {
            addCardToDeck(cardName);
        }
    });

    mainDeckList.addEventListener('click', (e) => {
        const target = e.target;
        const cardName = target.dataset.cardName;
        if (!cardName) return;

        if (target.classList.contains('deck-add-one')) {
            addCardToDeck(cardName);
        } else if (target.classList.contains('deck-remove-one')) {
            removeCardFromDeck(cardName);
        }
    });

    newDeckBtn.addEventListener('click', () => loadDeck('新規デッキ'));
    saveDeckBtn.addEventListener('click', saveCurrentDeck);
    deleteDeckBtn.addEventListener('click', deleteCurrentDeck);
    deckSelector.addEventListener('change', () => loadDeck(deckSelector.value));

    /**
     * Exports the current deck as a JSON file.
     */
    const exportDeck = async () => {
        const deck = deckBuilderState.currentDeck;
        if (!deck.leader) {
            showNotification('リーダーが選択されていません。', 'error');
            return;
        }

        // Image data validation
        const requiredCardNames = new Set([deck.leader, ...deck.main.keys()]);
        const missingCards = [];
        for (const cardName of requiredCardNames) {
            const card = getCardByName(cardName);
            if (!card || !card.imageUrl) {
                missingCards.push(cardName);
            }
        }

        if (missingCards.length > 0) {
            showNotification(`画像データがないカードがあります: ${missingCards.join(', ')}`, 'error');
            alert('デッキに必要なカード画像が不足しています。ファイル選択画面を開きますので、該当する画像ファイルを読み込んでください。');
            document.getElementById('deck-card-upload-single').click();
            return;
        }

        showNotification('ZIPファイルを生成中...');

        const zip = new JSZip();

        // 1. Add deck.json
        const deckData = {
            leader: deck.leader,
            main: Array.from(deck.main.entries()),
        };
        zip.file('deck.json', JSON.stringify(deckData, null, 2));

        // 2. Add card images to the root
        for (const cardName of requiredCardNames) {
            const card = getCardByName(cardName);
            if (card && card.imageUrl && card.fileName) {
                const base64Data = card.imageUrl.split(',')[1];
                zip.file(card.fileName, base64Data, { base64: true });
            } else {
                console.warn(`Card "${cardName}" could not be added to the zip because it's missing image data or a filename.`);
            }
        }

        // 3. Generate and download the zip file
        try {
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${deck.name || 'deck'}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showNotification(`デッキ「${deck.name}」をZIPファイルとしてエクスポートしました。`, 'success');
        } catch (error) {
            console.error('Error generating ZIP:', error);
            showNotification('ZIPファイルの生成に失敗しました。', 'error');
        }
    };

    exportDeckBtn.addEventListener('click', exportDeck);

    // Initial Load
    loadDecks();

    // ==================================================
    // カードテンプレート保存機能
    // ==================================================
    const cardTemplateSelector = document.getElementById('card-template-selector');
    const saveCardTemplateBtn = document.getElementById('save-card-template-btn');
    const loadCardTemplateBtn = document.getElementById('load-card-template-btn');
    const deleteCardTemplateBtn = document.getElementById('delete-card-template-btn');
    const CARD_TEMPLATES_KEY = 'yuakuri_card_templates';

    const getCardStateForSave = () => {
        return {
            cardName: state.cardName,
            cardRuby: state.cardRuby,
            cardNameSize: state.cardNameSize,
            atk: state.atk,
            hp: state.hp,
            cardType: state.cardType,
            imageScale: state.imageScale,
            imagePosX: state.imagePosX,
            imagePosY: state.imagePosY,
            activeEffectIds: state.activeEffects.map(effect => effect.id)
        };
    };

    const applyCardState = (savedState) => {
        // Reset current state partially
        state.activeEffects = [];
        state.activeTemplateMap.clear();

        // Apply saved state
        state.cardName = savedState.cardName || '';
        state.cardRuby = savedState.cardRuby || '';
        state.cardNameSize = savedState.cardNameSize || 64;
        state.atk = savedState.atk || 2;
        state.hp = savedState.hp || 2;
        state.cardType = savedState.cardType || null;
        state.imageScale = savedState.imageScale || 1;
        state.imagePosX = savedState.imagePosX || 0;
        state.imagePosY = savedState.imagePosY || 0;
        
        // Apply effects
        const allOriginalEffects = state.allEffects.flatMap(e => e.isGroup ? e.variants : e);
        if (savedState.activeEffectIds) {
            savedState.activeEffectIds.forEach(id => {
                const effect = allOriginalEffects.find(e => e.id === id);
                if (effect) {
                    state.activeEffects.push({ ...effect });
                    // テンプレートを持つ効果の場合、activeTemplateMapも更新
                    if (effect.template) { // effectオブジェクト自体にtemplateプロパティがあるか確認
                        state.activeTemplateMap.set(effect.template, id);
                    }
                }
            });
        }

        // Update UI elements
        elements.cardNameInput.value = state.cardName;
        elements.cardRubyInput.value = state.cardRuby;
        elements.cardNameSizeGroup.querySelector('.active')?.classList.remove('active');
        elements.cardNameSizeGroup.querySelector(`[data-size="${state.cardNameSize}"]`)?.classList.add('active');
        elements.atk.value.textContent = state.atk;
        elements.hp.value.textContent = state.hp;
        elements.imageZoom.value = state.imageScale;
        elements.imagePosX.value = state.imagePosX;
        elements.imagePosY.value = state.imagePosY;

        elements.cardTypeButtonsContainer.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === state.cardType);
        });

        const setStatus = (show, value, name) => {
            state[name] = value;
            state[`show${name.charAt(0).toUpperCase() + name.slice(1)}`] = show;
            elements[name].value.textContent = value;
            const controlWrapper = elements[name].value.closest('.status-item');
            if (controlWrapper) {
                controlWrapper.style.display = show ? '' : 'none';
            }
        };

        setStatus(true, state.atk, 'atk');
        setStatus(true, state.hp, 'hp');
        state.showLeaderHp = (state.cardType === 'リーダー');
        switch (state.cardType) {
            case '防具':
                setStatus(false, 2, 'atk');
                break;
            case '建物':
            case 'スキル':
            case 'トラップ':
            case 'リーダー':
                setStatus(false, 2, 'atk');
                setStatus(false, 2, 'hp');
                break;
        }
        
        elements.effectsMenu.querySelectorAll('button').forEach(btn => {
            const id = parseInt(btn.dataset.id, 10);
            btn.classList.toggle('active', state.activeEffects.some(e => e.id === id));
        });

        updateState();
        showNotification(`「${savedState.cardName || '無題のカード'}」を読み込みました。`, 'success');
    };

    const loadCardTemplates = () => {
        const templates = JSON.parse(localStorage.getItem(CARD_TEMPLATES_KEY) || '{}');
        cardTemplateSelector.innerHTML = '';
        for (const name in templates) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            cardTemplateSelector.appendChild(option);
        }
        return templates;
    };

    saveCardTemplateBtn.addEventListener('click', () => {
        const name = prompt('保存するカード名を入力してください:', state.cardName || '');
        if (!name) return;

        const templates = loadCardTemplates();
        templates[name] = getCardStateForSave();
        localStorage.setItem(CARD_TEMPLATES_KEY, JSON.stringify(templates));
        loadCardTemplates();
        cardTemplateSelector.value = name;
        showNotification(`「${name}」を保存しました。`, 'success');
    });

    loadCardTemplateBtn.addEventListener('click', () => {
        const name = cardTemplateSelector.value;
        if (!name) {
            showNotification('読み込むカードを選択してください。', 'error');
            return;
        }
        const templates = JSON.parse(localStorage.getItem(CARD_TEMPLATES_KEY) || '{}');
        const savedState = templates[name];
        if (savedState) {
            applyCardState(savedState);
        }
    });

    deleteCardTemplateBtn.addEventListener('click', () => {
        const name = cardTemplateSelector.value;
        if (!name) {
            showNotification('削除するカードを選択してください。', 'error');
            return;
        }
        if (confirm(`「${name}」を本当に削除しますか？`)) {
            const templates = loadCardTemplates();
            delete templates[name];
            localStorage.setItem(CARD_TEMPLATES_KEY, JSON.stringify(templates));
            loadCardTemplates();
            showNotification(`「${name}」を削除しました。`, 'info');
        }
    });

    // Initial load
    loadCardTemplates();

    // ==================================================
    // ルールガイド・アコーディオン
    // ==================================================
    const accordionHeaders = document.querySelectorAll('#ruleguide-tab .accordion-header');
    if (accordionHeaders.length > 0) {
        accordionHeaders.forEach(header => {
            header.addEventListener('click', function () {
                this.classList.toggle('active');
                const content = this.nextElementSibling;
                if (content.style.maxHeight) {
                    content.style.maxHeight = null;
                } else {
                    content.style.maxHeight = content.scrollHeight + "px";
                }
            });
        });
    }
});