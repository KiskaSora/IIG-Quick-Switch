/**
 * IIG Quick Switch
 * Маленький плавающий виджет для быстрого переключения:
 *  - активного стиля (settings.styles / activeStyleId)
 *  - активного профиля подключения (settings.connectionPresets — «Пресеты подключения»
 * в расширении SillyImages (inline_image_gen), без открытия его большой панели настроек.
 *
 * Ничего не патчит и не требует SillyImages как зависимость на уровне manifest —
 * просто читает/пишет тот же extensionSettings['inline_image_gen'], что и SillyImages.
 */
(function initIigQuickSwitch() {
    'use strict';

    const MODULE_NAME = 'inline_image_gen'; // ключ настроек SillyImages — НЕ трогать
    const QS = 'iig_quickswitch';           // наш собственный неймспейс (позиция кнопки и т.п.)

    // ── Настраиваемое: какую FA-иконку показывать на плавающей кнопке ──
    // Ненавязчивая по умолчанию: fa-palette (ассоциируется со «стилями»).
    // Другие спокойные варианты на выбор: fa-wand-magic-sparkles, fa-swatchbook, fa-brush, fa-sliders.
    const FAB_ICON_CLASS = 'fa-solid fa-palette';

    function ctx() { return SillyTavern.getContext(); }

    function getIigSettings() {
        const c = ctx();
        return c.extensionSettings ? c.extensionSettings[MODULE_NAME] : null;
    }

    function saveSettings() {
        try { ctx().saveSettingsDebounced(); } catch (e) { console.warn('[IIG-QS] save failed', e); }
    }

    function clone(v) {
        try { return structuredClone(v); } catch (e) { return JSON.parse(JSON.stringify(v)); }
    }

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = t == null ? '' : String(t);
        return d.innerHTML;
    }

    function toast(msg, type) {
        try {
            if (window.toastr && typeof window.toastr[type] === 'function') {
                window.toastr[type](msg, 'IIG Quick Switch', { timeOut: 1800 });
                return;
            }
        } catch (e) { /* ignore */ }
        console.log('[IIG-QS]', msg);
    }

    // ── Стили ──
    function getStyles(settings) {
        return Array.isArray(settings.styles) ? settings.styles : [];
    }

    function setActiveStyle(settings, styleId) {
        settings.activeStyleId = styleId || '';
        saveSettings();
        syncMainStylePanel(settings.activeStyleId);
    }

    // Если родная панель настроек SillyImages сейчас открыта в DOM, подсвечиваем
    // в ней активный стиль напрямую (публичного API у SillyImages для этого нет,
    // так что просто подкручиваем классы/иконку в её разметке — id/классы стабильны:
    // #iig_style_presets > .iig-style-chip[.iig-style-chip-active] > .iig-style-chip-name > i.fa-check/fa-palette).
    function syncMainStylePanel(activeId) {
        try {
            const container = document.getElementById('iig_style_presets');
            if (!container) return;
            container.querySelectorAll('.iig-style-chip').forEach((chip) => {
                const id = chip.dataset.styleId || '';
                const isActive = id === (activeId || '');
                chip.classList.toggle('iig-style-chip-active', isActive);
                const icon = chip.querySelector('.iig-style-chip-name i');
                if (icon) {
                    icon.classList.toggle('fa-check', isActive);
                    icon.classList.toggle('fa-palette', !isActive);
                }
            });
        } catch (e) { /* родная панель могла измениться — просто не синкаем */ }
    }

    // ── Пресеты подключения (settings.connectionPresets — то самое «Пресеты подключения»
    // под «Настройки API» в SillyImages: тип API, эндпоинт, ключ, модель и т.п.) ──
    const PRESET_KEYS = [
        'apiType', 'endpoint', 'apiKey', 'model',
        'naisteraModel', 'naisteraAspectRatio', 'aspectRatio', 'imageSize', 'size', 'quality',
        'customRequestFormat', 'customFullUrl',
    ];

    function getConnPresets(settings) {
        return Array.isArray(settings.connectionPresets) ? settings.connectionPresets : [];
    }

    function applyConnectionPreset(settings, preset) {
        if (!preset) return false;
        for (const key of PRESET_KEYS) {
            if (preset[key] !== undefined) settings[key] = clone(preset[key]);
        }
        settings.activePresetId = preset.id;
        saveSettings();
        syncMainPresetPanel(settings);
        return true;
    }

    // Если родная панель настроек SillyImages открыта — подтягиваем туда же поля
    // подключения и текущий выбранный пресет (те же id полей, что использует сама SillyImages).
    function syncMainPresetPanel(settings) {
        try {
            const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
            setVal('iig_api_type', settings.apiType);
            setVal('iig_endpoint', settings.endpoint);
            setVal('iig_api_key', settings.apiKey);
            setVal('iig_custom_request_format', settings.customRequestFormat);
            setVal('iig_custom_full_url', settings.customFullUrl);
            setVal('iig_naistera_model', settings.naisteraModel);
            setVal('iig_naistera_aspect_ratio', settings.naisteraAspectRatio);
            setVal('iig_aspect_ratio', settings.aspectRatio);
            setVal('iig_image_size', settings.imageSize);
            setVal('iig_size', settings.size);
            setVal('iig_quality', settings.quality);

            const modelSel = document.getElementById('iig_model');
            if (modelSel) {
                modelSel.innerHTML = settings.model
                    ? `<option value="${esc(settings.model)}" selected>${esc(settings.model)}</option>`
                    : '<option value="">-- Выберите модель --</option>';
            }

            const presetSel = document.getElementById('iig_preset_select');
            if (presetSel && presetSel.value !== (settings.activePresetId || '')) {
                presetSel.value = settings.activePresetId || '';
            }
        } catch (e) { /* родная панель могла измениться — просто не синкаем */ }
    }

    // ── Пресеты блоков (ExtBlocks — отдельные блоки внутри ТЕКУЩЕГО активного Set'а,
    // то самое «Preset blocks:» / #ExtBlocks-blocks-global-list в настройках ExtBlocks) ──
    // Публичного API у ExtBlocks нет, поэтому вкл/выкл блока делаем "по-честному": находим
    // его нативный чекбокс .disable_ExtBlocks в уже отрисованной строке блока (по id блока)
    // и диспатчим событие change — так отрабатывает вся его внутренняя логика (BlockService.saveBlock,
    // removeBlockInject и т.д.), а не просто переписывается settings.
    const EXTBLOCKS_MODULE = 'ExtBlocks';
    const EXTBLOCKS_GLOBAL_LIST_ID = 'ExtBlocks-blocks-global-list';

    function getExtBlocksSettings() {
        const c = ctx();
        return c.extensionSettings ? (c.extensionSettings[EXTBLOCKS_MODULE] || null) : null;
    }

    // Блоки ТЕКУЩЕГО активного Set'а (именно они видны в «Preset blocks:» у ExtBlocks).
    function getActiveSetBlocks(ebSettings) {
        if (!ebSettings || !Array.isArray(ebSettings.sets)) return [];
        const idx = Number.isInteger(ebSettings.active_set_idx) ? ebSettings.active_set_idx : 0;
        const activeSet = ebSettings.sets[idx];
        return activeSet && Array.isArray(activeSet.global_blocks) ? activeSet.global_blocks : [];
    }

    function blockLabel(block, block_type) {
        const typeIcon = { generated: 'G', accumulation: 'A', rewrite: 'R', script: 'S' }[block_type] || '';
        return typeIcon ? `${typeIcon} · ${block.name || 'Блок'}` : (block.name || 'Блок');
    }

    // Наше собственное хранилище (какие именно блоки закреплены для быстрого доступа).
    // Живёт в extensionSettings[QS], сохраняется вместе с обычными настройками ST.
    function getQsStore() {
        const c = ctx();
        if (!c.extensionSettings) return null;
        let store = c.extensionSettings[QS];
        if (!store || typeof store !== 'object') {
            store = {};
            c.extensionSettings[QS] = store;
        }
        if (!Array.isArray(store.pinnedExtBlocks)) {
            store.pinnedExtBlocks = [];
        }
        if (!Array.isArray(store.pinnedStyles)) {
            store.pinnedStyles = [];
        }
        return store;
    }

    function getPinnedStyleIds() {
        const store = getQsStore();
        return store ? store.pinnedStyles : [];
    }

    function togglePinStyle(styleId) {
        const store = getQsStore();
        if (!store || !styleId) return;
        const idx = store.pinnedStyles.indexOf(styleId);
        if (idx >= 0) store.pinnedStyles.splice(idx, 1);
        else store.pinnedStyles.push(styleId);
        saveSettings();
    }

    function getPinnedBlockIds() {
        const store = getQsStore();
        return store ? store.pinnedExtBlocks : [];
    }

    function togglePinBlock(blockId) {
        const store = getQsStore();
        if (!store || !blockId) return;
        const idx = store.pinnedExtBlocks.indexOf(blockId);
        if (idx >= 0) store.pinnedExtBlocks.splice(idx, 1);
        else store.pinnedExtBlocks.push(blockId);
        saveSettings();
    }

    // Вкл/выкл конкретный блок через его же нативный чекбокс + событие change
    // (тот самый переключатель-«глазок»/toggle в строке блока в настройках ExtBlocks).
    function toggleExtBlock(block) {
        const row = document.getElementById(block.id);
        const checkbox = row ? row.querySelector('.disable_ExtBlocks') : null;
        if (!checkbox) {
            toast('Панель ExtBlocks ещё не готова — открой вкладку расширений один раз и попробуй снова.', 'error');
            return false;
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    // ── Позиция плавающей кнопки (сохраняем в localStorage — это UI-настройка устройства) ──
    const POS_KEY = 'iig_qs_fab_pos_v1';

    function loadPos() {
        try {
            const raw = localStorage.getItem(POS_KEY);
            if (!raw) return null;
            const p = JSON.parse(raw);
            if (typeof p.right === 'number' && typeof p.bottom === 'number') return p;
        } catch (e) { /* ignore */ }
        return null;
    }

    function savePos(right, bottom) {
        try { localStorage.setItem(POS_KEY, JSON.stringify({ right, bottom })); } catch (e) { /* ignore */ }
    }

    // ── UI ──
    let fab = null;
    let panel = null;
    let panelOpen = false;
    let manageExtBlocksOpen = false; // локальный вид панели: список чипов ↔ список чекбоксов выбора
    let manageStylesOpen = false;    // то же самое, но для секции «Стиль»

    function closePanel() {
        if (panel) panel.remove();
        panel = null;
        panelOpen = false;
        manageExtBlocksOpen = false; // при следующем открытии всегда стартуем с чипов
        manageStylesOpen = false;
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        document.removeEventListener('keydown', onDocKeyDown, true);
    }

    function onDocPointerDown(e) {
        if (!panel) return;
        if (panel.contains(e.target) || (fab && fab.contains(e.target))) return;
        closePanel();
    }

    function onDocKeyDown(e) {
        if (e.key === 'Escape') closePanel();
    }

    function renderPanelBody() {
        const settings = getIigSettings();
        if (!settings) {
            return `<div class="iigqs-empty">SillyImages ещё не инициализировал настройки.<br>Открой один раз его панель настроек и попробуй снова.</div>`;
        }

        const presets = getConnPresets(settings);

        let connHtml = '';
        if (presets.length) {
            connHtml = `
                <div class="iigqs-section-title"><i class="fa-fw fa-solid fa-plug"></i> Пресет подключения</div>
                <select class="iigqs-select" id="iigqs-preset-select">
                    <option value="">— выбрать пресет —</option>
                    ${presets.map(p => `<option value="${esc(p.id)}" ${settings.activePresetId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
                </select>
            `;
        } else {
            connHtml = `
                <div class="iigqs-section-title"><i class="fa-fw fa-solid fa-plug"></i> Пресет подключения</div>
                <div class="iigqs-hint">Пресетов подключения нет — создай их в настройках SillyImages («Настройки API» → «Пресеты подключения»), чтобы переключать отсюда в один тап.</div>
            `;
        }

        return `
            ${renderStylesSection(settings)}
            ${connHtml}
            ${renderExtBlocksSection()}
        `;
    }

    // ── Секция «Стиль»: чипы с только выбранными стилями (+ всегда «Без стиля»)
    // + переключатель в режим «отметить нужные», как и у пресетов блоков. ──
    function renderStylesSection(settings) {
        const styles = getStyles(settings);
        const header = (extraTitle) => `
            <div class="iigqs-section-title iigqs-section-title-row">
                <span class="iigqs-section-title-label"><i class="fa-fw fa-solid fa-palette"></i> Стиль${extraTitle || ''}</span>
                ${styles.length ? `
                    <button type="button" class="iigqs-manage-toggle" id="iigqs-styles-manage-toggle"
                        title="${manageStylesOpen ? 'Готово' : 'Выбрать, какие стили показывать'}">
                        <i class="fa-fw fa-solid ${manageStylesOpen ? 'fa-check' : 'fa-gear'}"></i>
                    </button>
                ` : ''}
            </div>
        `;

        if (!styles.length) {
            return `${header()}<div class="iigqs-hint">Стилей пока нет — добавь их в настройках SillyImages («Стили»), и они появятся здесь.</div>`;
        }

        if (manageStylesOpen) {
            const pinned = getPinnedStyleIds();
            const quickActions = styles.length > 1 ? `
                <div class="iigqs-manage-quickactions">
                    <button type="button" class="iigqs-manage-quickbtn" id="iigqs-styles-pin-all">Отметить все</button>
                    <button type="button" class="iigqs-manage-quickbtn" id="iigqs-styles-pin-none">Снять всё</button>
                </div>
            ` : '';
            const listHtml = `${quickActions}<div class="iigqs-manage-list">`
                + styles.map(s => `
                    <label class="iigqs-manage-item">
                        <input type="checkbox" class="iigqs-style-pin" data-style-id="${esc(s.id)}" ${pinned.includes(s.id) ? 'checked' : ''}>
                        <span>${esc(s.name || 'Стиль')}</span>
                    </label>
                `).join('')
                + `</div>`;
            return `${header(' — выбор')}${listHtml}`;
        }

        const pinnedIds = getPinnedStyleIds();
        const pinnedStyles = styles.filter((s) => pinnedIds.includes(s.id));

        let body;
        if (!pinnedStyles.length) {
            body = `<div class="iigqs-hint">Ни один стиль ещё не выбран для быстрого доступа — нажми ⚙ и отметь нужные («Без стиля» доступен всегда).</div>`;
        } else {
            body = `<div class="iigqs-chips">`
                + `<button type="button" class="iigqs-chip ${!settings.activeStyleId ? 'iigqs-active' : ''}" data-style-id="">Без стиля</button>`
                + pinnedStyles.map(s => `<button type="button" class="iigqs-chip ${settings.activeStyleId === s.id ? 'iigqs-active' : ''}" data-style-id="${esc(s.id)}">${esc(s.name || 'Стиль')}</button>`).join('')
                + `</div>`;
        }

        return `${header()}${body}`;
    }

    // ── Секция «Пресеты блоков» (ExtBlocks): чипы с только выбранными блоками текущего
    // активного набора + переключатель в режим «отметить нужные» (не все сразу, а по выбору). ──
    function renderExtBlocksSection() {
        const ebSettings = getExtBlocksSettings();
        const blocks = getActiveSetBlocks(ebSettings);
        const header = (extraTitle) => `
            <div class="iigqs-section-title iigqs-section-title-row">
                <span class="iigqs-section-title-label"><i class="fa-fw fa-solid fa-cubes"></i> Пресеты блоков${extraTitle || ''}</span>
                ${blocks.length ? `
                    <button type="button" class="iigqs-manage-toggle" id="iigqs-extblocks-manage-toggle"
                        title="${manageExtBlocksOpen ? 'Готово' : 'Выбрать, какие блоки показывать'}">
                        <i class="fa-fw fa-solid ${manageExtBlocksOpen ? 'fa-check' : 'fa-gear'}"></i>
                    </button>
                ` : ''}
            </div>
        `;

        if (!ebSettings) {
            return `${header()}<div class="iigqs-hint">Расширение ExtBlocks не найдено или ещё не загрузилось.</div>`;
        }
        if (!blocks.length) {
            return `${header()}<div class="iigqs-hint">В текущем наборе ExtBlocks пока нет блоков («Preset blocks:» в его настройках).</div>`;
        }

        blocks.forEach((b) => { if (!b.id) b.id = ''; }); // блоки без id ещё не рендерились в ExtBlocks — пропустим их

        if (manageExtBlocksOpen) {
            const pinned = getPinnedBlockIds();
            const selectableBlocks = blocks.filter(b => b.id);
            const quickActions = selectableBlocks.length > 1 ? `
                <div class="iigqs-manage-quickactions">
                    <button type="button" class="iigqs-manage-quickbtn" id="iigqs-extblocks-pin-all">Отметить все</button>
                    <button type="button" class="iigqs-manage-quickbtn" id="iigqs-extblocks-pin-none">Снять всё</button>
                </div>
            ` : '';
            const listHtml = `${quickActions}<div class="iigqs-manage-list">`
                + selectableBlocks.map(b => `
                    <label class="iigqs-manage-item">
                        <input type="checkbox" class="iigqs-extblock-pin" data-block-id="${esc(b.id)}" ${pinned.includes(b.id) ? 'checked' : ''}>
                        <span>${esc(blockLabel(b, b.block_type))}</span>
                    </label>
                `).join('')
                + `</div>`;
            return `${header(' — выбор')}${listHtml}`;
        }

        const pinnedIds = getPinnedBlockIds();
        const pinnedBlocks = blocks.filter((b) => b.id && pinnedIds.includes(b.id));

        let body;
        if (!pinnedBlocks.length) {
            body = `<div class="iigqs-hint">Ни один блок ещё не выбран для быстрого доступа — нажми ⚙ и отметь нужные.</div>`;
        } else {
            body = `<div class="iigqs-chips">`
                + pinnedBlocks.map(b => `<button type="button" class="iigqs-chip ${!b.disabled ? 'iigqs-active' : ''}" data-extblock-id="${esc(b.id)}">${esc(b.name || 'Блок')}</button>`).join('')
                + `</div>`;
        }

        return `${header()}${body}`;
    }

    function positionPanelNearFab() {
        if (!panel || !fab) return;
        const fr = fab.getBoundingClientRect();
        // На мобильных window.innerHeight часто больше реально видимой области
        // (не учитывает адресную строку/системные кнопки) — visualViewport точнее.
        const vv = window.visualViewport;
        const vw = vv ? vv.width : window.innerWidth;
        const vh = vv ? vv.height : window.innerHeight;
        panel.style.visibility = 'hidden';
        panel.style.display = 'flex';
        const pr = panel.getBoundingClientRect();

        let left = fr.left + fr.width / 2 - pr.width / 2;
        left = Math.max(8, Math.min(left, vw - pr.width - 8));

        // Открываем вверх, если снизу не помещается, иначе вниз.
        let top;
        if (fr.top - pr.height - 10 > 8) {
            top = fr.top - pr.height - 10;
        } else {
            top = Math.min(fr.bottom + 10, vh - pr.height - 8);
        }
        top = Math.max(8, top);

        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.visibility = 'visible';
    }

    function attachPanelListeners() {
        if (!panel) return;

        // Чипы стиля (стили IIG/SillyImages) — data-style-id
        panel.querySelectorAll('.iigqs-chip[data-style-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const settings = getIigSettings();
                if (!settings) return;
                setActiveStyle(settings, btn.dataset.styleId);
                const label = btn.textContent;
                closePanel();
                toast(`Стиль: ${label}`, 'success');
            });
        });

        // Шестерёнка — переключение вида «чипы» ↔ «выбор стилей для чипов»
        const stylesManageToggle = panel.querySelector('#iigqs-styles-manage-toggle');
        if (stylesManageToggle) {
            stylesManageToggle.addEventListener('click', () => {
                manageStylesOpen = !manageStylesOpen;
                refreshPanel();
            });
        }

        // Чекбоксы выбора, какие стили закрепить в быстром доступе
        panel.querySelectorAll('.iigqs-style-pin').forEach(cb => {
            cb.addEventListener('change', () => {
                togglePinStyle(cb.dataset.styleId);
            });
        });

        // «Отметить все» / «Снять всё» в режиме выбора стилей
        const stylesPinAllBtn = panel.querySelector('#iigqs-styles-pin-all');
        if (stylesPinAllBtn) {
            stylesPinAllBtn.addEventListener('click', () => {
                const settings = getIigSettings();
                const store = getQsStore();
                if (!settings || !store) return;
                store.pinnedStyles = getStyles(settings).map(s => s.id);
                saveSettings();
                refreshPanel();
            });
        }
        const stylesPinNoneBtn = panel.querySelector('#iigqs-styles-pin-none');
        if (stylesPinNoneBtn) {
            stylesPinNoneBtn.addEventListener('click', () => {
                const store = getQsStore();
                if (!store) return;
                store.pinnedStyles = [];
                saveSettings();
                refreshPanel();
            });
        }

        const sel = panel.querySelector('#iigqs-preset-select');
        if (sel) {
            sel.addEventListener('change', () => {
                const settings = getIigSettings();
                if (!settings) return;
                const id = sel.value;
                if (!id) return;
                const preset = getConnPresets(settings).find(p => p.id === id);
                if (!preset) { toast('Пресет не найден', 'error'); return; }
                applyConnectionPreset(settings, preset);
                closePanel();
                toast(`Подключение: ${preset.name}`, 'success');
            });
        }

        // Чипы блоков ExtBlocks — data-extblock-id. Тап = вкл/выкл этот конкретный блок,
        // панель НЕ закрывается (обычно переключают несколько блоков подряд).
        panel.querySelectorAll('.iigqs-chip[data-extblock-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.extblockId;
                const ebSettings = getExtBlocksSettings();
                const block = getActiveSetBlocks(ebSettings).find((b) => b.id === id);
                if (!block) { toast('Блок не найден в текущем наборе', 'error'); return; }
                const ok = toggleExtBlock(block);
                if (ok) {
                    toast(`${block.name}: ${block.disabled ? 'выключен' : 'включён'}`, 'success');
                    refreshPanel();
                }
            });
        });

        // Шестерёнка — переключение вида «чипы» ↔ «выбор блоков для чипов»
        const manageToggle = panel.querySelector('#iigqs-extblocks-manage-toggle');
        if (manageToggle) {
            manageToggle.addEventListener('click', () => {
                manageExtBlocksOpen = !manageExtBlocksOpen;
                refreshPanel();
            });
        }

        // Чекбоксы выбора, какие блоки ExtBlocks закрепить в быстром доступе
        panel.querySelectorAll('.iigqs-extblock-pin').forEach(cb => {
            cb.addEventListener('change', () => {
                togglePinBlock(cb.dataset.blockId);
            });
        });

        // «Отметить все» / «Снять всё» в режиме выбора блоков
        const pinAllBtn = panel.querySelector('#iigqs-extblocks-pin-all');
        if (pinAllBtn) {
            pinAllBtn.addEventListener('click', () => {
                const ebSettings = getExtBlocksSettings();
                const store = getQsStore();
                if (!store) return;
                store.pinnedExtBlocks = getActiveSetBlocks(ebSettings).filter(b => b.id).map(b => b.id);
                saveSettings();
                refreshPanel();
            });
        }
        const pinNoneBtn = panel.querySelector('#iigqs-extblocks-pin-none');
        if (pinNoneBtn) {
            pinNoneBtn.addEventListener('click', () => {
                const store = getQsStore();
                if (!store) return;
                store.pinnedExtBlocks = [];
                saveSettings();
                refreshPanel();
            });
        }

        setTimeout(() => {
            document.addEventListener('pointerdown', onDocPointerDown, true);
            document.addEventListener('keydown', onDocKeyDown, true);
        }, 0);
    }

    // Перерисовывает содержимое уже открытой панели на месте (без закрытия) —
    // нужно для переключения «чипы ↔ выбор пресетов».
    function refreshPanel() {
        if (!panel) return;
        panel.innerHTML = renderPanelBody();
        attachPanelListeners();
        positionPanelNearFab();
    }

    function openPanel() {
        if (panelOpen) { closePanel(); return; }
        panel = document.createElement('div');
        panel.className = 'iigqs-panel';
        panel.innerHTML = renderPanelBody();
        document.body.appendChild(panel);
        panelOpen = true;
        positionPanelNearFab();
        attachPanelListeners();
    }

    // ── Плавающая кнопка: перетаскивание + тап ──
    function injectFab() {
        if (document.getElementById('iigqs-fab')) return;

        fab = document.createElement('div');
        fab.id = 'iigqs-fab';
        fab.className = 'iigqs-fab';
        fab.title = 'IIG: быстрый стиль / подключение';
        fab.innerHTML = `<i class="fa-fw ${FAB_ICON_CLASS}"></i>`;

        const pos = loadPos() || { right: 16, bottom: 90 };
        fab.style.right = `${pos.right}px`;
        fab.style.bottom = `${pos.bottom}px`;

        document.body.appendChild(fab);

        let dragging = false;
        let moved = false;
        let startClientX = 0, startClientY = 0;
        let startRight = 0, startBottom = 0;

        fab.addEventListener('pointerdown', (e) => {
            dragging = true;
            moved = false;
            startClientX = e.clientX;
            startClientY = e.clientY;
            const cs = getComputedStyle(fab);
            startRight = parseFloat(cs.right) || 0;
            startBottom = parseFloat(cs.bottom) || 0;
            fab.setPointerCapture(e.pointerId);
        });

        fab.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startClientX;
            const dy = e.clientY - startClientY;
            if (!moved && Math.hypot(dx, dy) > 6) moved = true;
            if (!moved) return;

            let newRight = startRight - dx;
            let newBottom = startBottom - dy;
            const size = fab.offsetWidth || 44;
            newRight = Math.max(4, Math.min(newRight, window.innerWidth - size - 4));
            newBottom = Math.max(4, Math.min(newBottom, window.innerHeight - size - 4));

            fab.style.right = `${newRight}px`;
            fab.style.bottom = `${newBottom}px`;
            if (panelOpen) closePanel();
        });

        fab.addEventListener('pointerup', (e) => {
            if (!dragging) return;
            dragging = false;
            try { fab.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (moved) {
                const right = parseFloat(getComputedStyle(fab).right) || 0;
                const bottom = parseFloat(getComputedStyle(fab).bottom) || 0;
                savePos(right, bottom);
            } else {
                openPanel();
            }
        });

        fab.addEventListener('pointercancel', () => { dragging = false; });
    }

    // ── Инициализация ──
    function boot() {
        try { injectFab(); } catch (e) { console.error('[IIG-QS] init failed', e); }
    }

    const c = ctx();
    if (c && c.eventSource && c.event_types && c.event_types.APP_READY) {
        c.eventSource.on(c.event_types.APP_READY, () => setTimeout(boot, 400));
    } else {
        // Фолбэк, если событие недоступно по какой-то причине.
        setTimeout(boot, 1500);
    }
    // На случай, если APP_READY уже прошёл до загрузки скрипта (расширение включено позже).
    setTimeout(boot, 3000);
})();
