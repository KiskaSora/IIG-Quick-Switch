/**
 * IIG Quick Switch
 * Плавающая кнопка-виджет для быстрого переключения (без открытия большой
 * панели настроек):
 *  - активного стиля (settings.styles / activeStyleId)
 *  - активного профиля подключения (settings.connectionProfiles /
 *    activeConnectionProfileId — «Профиль» под «Настройки API»: тип API,
 *    эндпоинт, ключ, модель и все параметры, специфичные для конкретного
 *    провайдера)
 *  - отдельных блоков ExtBlocks (если это расширение тоже установлено рядом)
 *
 * Ничего не патчит и не требует основное расширение как зависимость на
 * уровне manifest — просто читает/пишет тот же extensionSettings['inline_image_gen'].
 *
 * CONNECTION_FIELDS — объединение полей подключения из двух исходных форков
 * этого виджета (xai-, a1111- и naistera-polling-провайдеры из одного,
 * electronhub-/novelai-/override*-провайдеры из другого), так что виджет
 * работает независимо от того, какой именно набор провайдеров сейчас
 * настроен. Поля, которых нет в текущих настройках, просто игнорируются
 * (см. applyConnectionProfile) — это безопасный суперсет, а не замена.
 */
(function initIigQuickSwitch() {
    'use strict';

    const MODULE_NAME = 'inline_image_gen'; // ключ настроек IIG (и SillyImages) — НЕ трогать
    const QS = 'iig_quickswitch';      // наш собственный неймспейс (позиция кнопки, закреплённые чипы)

    // ── Настраиваемое: какую FA-иконку показывать на плавающей кнопке ──
    // Лапка 🐾. Другие спокойные варианты:
    // fa-solid fa-wand-magic-sparkles, fa-solid fa-cat, fa-solid fa-sliders.
    const FAB_ICON_CLASS = 'fa-solid fa-paw';

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

    // ── Стили (settings.styles / activeStyleId — структура в IIG не изменилась
    // по сравнению со SillyImages: { id, name, value, ... }) ──
    function getStyles(settings) {
        return Array.isArray(settings.styles) ? settings.styles : [];
    }

    function setActiveStyle(settings, styleId) {
        settings.activeStyleId = styleId || '';
        saveSettings();
        syncMainStylePanel(settings.activeStyleId);
    }

    // Если родная панель настроек IIG сейчас открыта в DOM — подсвечиваем
    // в ней активный стиль напрямую. У IIG другая разметка списка стилей,
    // чем была у SillyImages (нет chip-ов, вместо них список .iig-style-item
    // с data-ps-id и индикатором fa-circle / fa-circle-check внутри
    // .iig-style-item-indicator), поэтому синк переписан под неё.
    function syncMainStylePanel(activeId) {
        try {
            const container = document.getElementById('iig_style_presets');
            if (!container) return;
            container.querySelectorAll('.iig-style-item[data-ps-id]').forEach((itemEl) => {
                const id = itemEl.dataset.psId || '';
                const isActive = id === (activeId || '');
                itemEl.classList.toggle('iig-style-item-active', isActive);
                const icon = itemEl.querySelector('.iig-style-item-indicator i');
                if (icon) {
                    icon.classList.toggle('fa-circle-check', isActive);
                    icon.classList.toggle('fa-circle', !isActive);
                }
            });
        } catch (e) { /* родная панель могла измениться — просто не синкаем */ }
    }

    // ── Профиль подключения (settings.connectionProfiles — «Профиль» под
    // «Настройки API» в основном расширении: тип API, эндпоинт, ключ, модель
    // и все параметры, специфичные для конкретного провайдера).
    // Список — объединение полей из двух исходных форков этого виджета:
    // xai*/a1111*/naisteraCharacterDescriptionsMode/naisteraPolling* — из одного,
    // electronhub*/novelai*/override* — из другого. Лишние поля молчаливо
    // игнорируются, если их нет в текущих настройках (см. applyConnectionProfile —
    // пишет только те ключи, что реально есть в профиле), так что держать их здесь
    // безопасно даже если у тебя сейчас нет части этих провайдеров. ──
    const CONNECTION_FIELDS = [
        'apiType', 'endpoint', 'rawEndpoint', 'apiKey', 'model',
        'size', 'quality',
        'aspectRatio', 'overrideAspectRatio', 'imageSize', 'overrideImageSize',
        'xaiAspectRatio', 'xaiResolution', 'xaiQuality',
        'sendCharAvatar', 'sendUserAvatar', 'optionalAvatarSending', 'useActiveUserPersonaAvatar', 'userAvatarFile',
        'naisteraAspectRatio', 'naisteraModel', 'naisteraCharacterDescriptionsMode',
        'naisteraSendCharAvatar', 'naisteraSendUserAvatar',
        'naisteraVideoTest', 'naisteraVideoEveryN',
        'naisteraPolling', 'naisteraPollIntervalMs', 'naisteraPollTimeoutMs',
        'electronhubStyle', 'electronhubNegativePrompt', 'electronhubGuidanceScale', 'electronhubSteps', 'electronhubEnableReferences',
        'novelaiModel', 'novelaiCustomModel', 'novelaiSampler', 'novelaiScheduler', 'novelaiSteps', 'novelaiScale', 'novelaiSize',
        'novelaiNegativePrompt', 'novelaiAnlasGuard', 'novelaiDecrisper', 'novelaiVarietyBoost', 'novelaiSm', 'novelaiSmDyn',
        'novelaiEnableReferences', 'novelaiReferenceType', 'novelaiReferenceStrength', 'novelaiReferenceFidelity',
        'a1111Width', 'a1111Height', 'a1111Steps', 'a1111CfgScale', 'a1111Sampler', 'a1111Scheduler',
        'a1111Vae', 'a1111HrUpscaler', 'a1111HrScale', 'a1111DenoisingStrength', 'a1111HrSecondPassSteps',
        'a1111ClipSkip', 'a1111RestoreFaces', 'a1111EnableHr', 'a1111AdetailerFace', 'a1111Resolution',
        'a1111PromptPrefix', 'a1111NegativePrompt', 'a1111Seed',
    ];

    // ── Размер / соотношение сторон — у каждого apiType свой параметр (или два)
    // в родной панели (src/ui/apiSection.js), поэтому набор контролов зависит
    // от settings.apiType. У aigate отдельного контрола размера в родной панели
    // нет — для него секция скрывается. Список опций и подписи продублированы
    // из apiSection.js / i18n/ru-ru.json, чтобы 1:1 совпадать с родной панелью. ──
    const AUTO_OPTION = { value: 'auto', label: 'Авто / из промпта' };

    function getSizeControls(settings) {
        const apiType = settings.apiType;

        if (apiType === 'openai' || apiType === 'electronhub') {
            return [{
                field: 'size',
                options: [
                    AUTO_OPTION,
                    { value: '1024x1024', label: '1024x1024 (Квадрат)' },
                    { value: '1792x1024', label: '1792x1024 (Альбомная)' },
                    { value: '1024x1792', label: '1024x1792 (Портретная)' },
                    { value: '512x512', label: '512x512 (Маленький)' },
                ],
            }];
        }

        if (apiType === 'naistera') {
            return [{
                field: 'naisteraAspectRatio',
                options: [
                    AUTO_OPTION,
                    { value: '1:1', label: '1:1' },
                    { value: '16:9', label: '16:9' },
                    { value: '9:16', label: '9:16' },
                    { value: '3:2', label: '3:2' },
                    { value: '2:3', label: '2:3' },
                ],
            }];
        }

        if (apiType === 'novelai') {
            return [{
                field: 'novelaiSize',
                // Совпадает 1:1 с NOVELAI_SIZES из settings.js основного расширения.
                options: [
                    { value: 'Portrait', label: 'Portrait (832×1216)' },
                    { value: 'Landscape', label: 'Landscape (1216×832)' },
                    { value: 'Square', label: 'Square (1024×1024)' },
                ],
            }];
        }

        if (apiType === 'gemini' || apiType === 'openrouter' || apiType === 'void') {
            return [
                {
                    field: 'aspectRatio',
                    label: 'Соотношение сторон',
                    options: [
                        AUTO_OPTION,
                        { value: '1:1', label: '1:1 (Квадрат)' },
                        { value: '2:3', label: '2:3 (Портрет)' },
                        { value: '3:2', label: '3:2 (Альбом)' },
                        { value: '3:4', label: '3:4 (Портрет)' },
                        { value: '4:3', label: '4:3 (Альбом)' },
                        { value: '4:5', label: '4:5 (Портрет)' },
                        { value: '5:4', label: '5:4 (Альбом)' },
                        { value: '9:16', label: '9:16 (Вертикальный)' },
                        { value: '16:9', label: '16:9 (Широкий)' },
                        { value: '21:9', label: '21:9 (Ультраширокий)' },
                    ],
                },
                {
                    field: 'imageSize',
                    label: 'Разрешение',
                    options: [
                        AUTO_OPTION,
                        { value: '1K', label: '1K (по умолчанию)' },
                        { value: '2K', label: '2K' },
                        { value: '4K', label: '4K' },
                    ],
                },
            ];
        }

        // aigate и любые незнакомые apiType — своего контрола размера нет.
        return [];
    }

    function applySizeField(settings, field, value) {
        settings[field] = value;
        saveSettings();
        syncMainPresetPanel(settings);
    }

    function getConnectionProfiles(settings) {
        return Array.isArray(settings.connectionProfiles) ? settings.connectionProfiles : [];
    }

    function applyConnectionProfile(settings, profile) {
        if (!profile) return false;
        for (const key of CONNECTION_FIELDS) {
            if (profile[key] !== undefined) settings[key] = clone(profile[key]);
        }
        settings.activeConnectionProfileId = profile.id;
        saveSettings();
        syncMainPresetPanel(settings);
        return true;
    }

    // Если родная панель настроек IIG открыта — подтягиваем туда же поля
    // подключения и текущий выбранный профиль (те же id полей, что использует само
    // IIG в src/ui/apiSection.js). В отличие от SillyImages, здесь iig_model —
    // текстовое поле, а не <select> с одной опцией, так что просто пишем .value.
    function syncMainPresetPanel(settings) {
        try {
            const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
            const setChecked = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.checked = !!val; };

            setVal('iig_api_type', settings.apiType);
            setVal('iig_endpoint', settings.endpoint);
            setChecked('iig_raw_endpoint', settings.rawEndpoint);
            setVal('iig_api_key', settings.apiKey);
            setVal('iig_model', settings.model);
            // На случай, если модель в текущей панели — выпадающий список
            // подгруженных моделей (#iig_model_select), а не текстовый input
            // (так было в SillyImages/IIG): выставляем value, если там уже
            // есть такая опция. Если элемента нет — просто ничего не делает.
            const modelSel = document.getElementById('iig_model_select');
            if (modelSel && settings.model !== undefined) {
                const hasOption = Array.from(modelSel.options || []).some((o) => o.value === settings.model);
                if (hasOption) modelSel.value = settings.model;
            }
            setVal('iig_naistera_model', settings.naisteraModel);
            setVal('iig_naistera_aspect_ratio', settings.naisteraAspectRatio);
            setVal('iig_aspect_ratio', settings.aspectRatio);
            setVal('iig_image_size', settings.imageSize);
            setVal('iig_size', settings.size);
            setVal('iig_quality', settings.quality);
            setVal('iig_novelai_size', settings.novelaiSize);

            const profileSel = document.getElementById('iig_profile_select');
            if (profileSel && profileSel.value !== (settings.activeConnectionProfileId || '')) {
                profileSel.value = settings.activeConnectionProfileId || '';
            }
        } catch (e) { /* родная панель могла измениться — просто не синкаем */ }
    }

    // ── Пресеты блоков (ExtBlocks — отдельное расширение, никак не связанное с IIG;
    // логика полностью повторяет оригинал — отдельные блоки внутри ТЕКУЩЕГО активного Set'а,
    // то самое «Preset blocks:» / #ExtBlocks-blocks-global-list в его настройках) ──
    // Публичного API у ExtBlocks нет, поэтому вкл/выкл блока делаем "по-честному": находим
    // его нативный чекбокс .disable_ExtBlocks в уже отрисованной строке блока (по id блока)
    // и диспатчим событие change — так отрабатывает вся его внутренняя логика (BlockService.saveBlock,
    // removeBlockInject и т.д.), а не просто переписывается settings.
    const EXTBLOCKS_MODULE = 'ExtBlocks';

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

    // ── Connection Profile (ExtBlocks) — тот самый выпадающий список «Connection Profile:»
    // под API Preset в настройках ExtBlocks (НЕ путать с «Профилем подключения» IIG
    // выше в этой же панели — это разные сущности!). Список берётся из встроенного
    // в SillyTavern Connection Manager (extensionSettings.connectionManager.profiles) и
    // привязан к ТЕКУЩЕМУ активному API Preset ExtBlocks — у каждого из Big/Medium/Small
    // свой собственный connection_profile.
    const EXTBLOCKS_API_PRESET_NAMES = ['big', 'medium', 'small'];

    function getActiveApiPresetName(ebSettings) {
        return (ebSettings && EXTBLOCKS_API_PRESET_NAMES.includes(ebSettings.active_api_preset))
            ? ebSettings.active_api_preset
            : 'big';
    }

    function getConnectionManagerProfiles() {
        const c = ctx();
        const cm = c.extensionSettings ? c.extensionSettings.connectionManager : null;
        return cm && Array.isArray(cm.profiles) ? cm.profiles : [];
    }

    function getExtBlocksActiveConnectionProfileName(ebSettings) {
        const presetName = getActiveApiPresetName(ebSettings);
        const preset = ebSettings && ebSettings.api_presets ? ebSettings.api_presets[presetName] : null;
        return preset ? String(preset.connection_profile || '') : '';
    }

    function applyExtBlocksConnectionProfile(profileName) {
        const select = document.getElementById('ExtBlocks-proxy-connection-profile');
        if (!select) {
            toast('Панель ExtBlocks ещё не готова — открой вкладку расширений, разверни «API Settings» один раз и попробуй снова.', 'error');
            return false;
        }
        select.value = profileName;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    // Наше собственное хранилище (какие именно стили/блоки закреплены для быстрого доступа).
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
        if (!Array.isArray(store.pinnedExtBlocksProfiles)) {
            store.pinnedExtBlocksProfiles = [];
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

    function getPinnedExtBlocksProfileNames() {
        const store = getQsStore();
        return store ? store.pinnedExtBlocksProfiles : [];
    }

    function togglePinExtBlocksProfile(name) {
        const store = getQsStore();
        if (!store || !name) return;
        const idx = store.pinnedExtBlocksProfiles.indexOf(name);
        if (idx >= 0) store.pinnedExtBlocksProfiles.splice(idx, 1);
        else store.pinnedExtBlocksProfiles.push(name);
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
            if (typeof p.right === 'number' && typeof p.top === 'number') return p;
        } catch (e) { /* ignore */ }
        return null;
    }

    function savePos(right, top) {
        try { localStorage.setItem(POS_KEY, JSON.stringify({ right, top })); } catch (e) { /* ignore */ }
    }

    // ── UI ──
    let fab = null;
    let panel = null;
    let panelOpen = false;
    let manageExtBlocksOpen = false; // локальный вид панели: список чипов ↔ список чекбоксов выбора
    let manageStylesOpen = false;    // то же самое, но для секции «Стиль»
    let manageExtProfilesOpen = false; // то же самое, но для секции «Connection Profile (ExtBlocks)»

    function closePanel() {
        if (panel) panel.remove();
        panel = null;
        panelOpen = false;
        manageExtBlocksOpen = false; // при следующем открытии всегда стартуем с чипов
        manageStylesOpen = false;
        manageExtProfilesOpen = false;
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
            return `<div class="iigqs-empty">IIG ещё не инициализировал настройки.<br>Открой один раз его панель настроек и попробуй снова.</div>`;
        }

        const profiles = getConnectionProfiles(settings);

        let connHtml = '';
        if (profiles.length) {
            connHtml = `
                <div class="iigqs-section-title"><i class="fa-fw fa-solid fa-plug"></i> Профиль подключения</div>
                <select class="iigqs-select" id="iigqs-profile-select">
                    <option value="">— выбрать профиль —</option>
                    ${profiles.map(p => `<option value="${esc(p.id)}" ${settings.activeConnectionProfileId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
                </select>
            `;
        } else {
            connHtml = `
                <div class="iigqs-section-title"><i class="fa-fw fa-solid fa-plug"></i> Профиль подключения</div>
                <div class="iigqs-hint">Профилей подключения нет — создай их в настройках IIG («Настройки API» → «Профиль»), чтобы переключать отсюда в один тап.</div>
            `;
        }

        return `
            ${renderStylesSection(settings)}
            ${connHtml}
            ${renderSizeSection(settings)}
            ${renderExtBlocksProfileSection()}
            ${renderExtBlocksSection()}
        `;
    }

    // ── Секция «Размер»: один или два выпадающих списка (зависит от apiType,
    // см. getSizeControls) — сразу все варианты текущего провайдера, выбор
    // в списке применяет значение сразу же, без открытия большой панели. ──
    function renderSizeSection(settings) {
        const header = `<div class="iigqs-section-title"><i class="fa-fw fa-solid fa-expand"></i> Размер</div>`;
        const controls = getSizeControls(settings);

        if (!controls.length) {
            return `${header}<div class="iigqs-hint">У текущего типа API (${esc(settings.apiType || '?')}) нет отдельного параметра размера в панели IIG.</div>`;
        }

        return `
            ${header}
            <div class="iigqs-size-controls">
                ${controls.map(c => `
                    ${c.label ? `<div class="iigqs-select-label">${esc(c.label)}</div>` : ''}
                    <select class="iigqs-select" data-size-field="${esc(c.field)}">
                        ${c.options.map(o => `<option value="${esc(o.value)}" ${settings[c.field] === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                    </select>
                `).join('')}
            </div>
        `;
    }

    // ── Секция «Стиль»: чипы с только выбранными стилями (+ всегда «Без стиля»)
    // + переключатель в режим «отметить нужные». ──
    function renderStylesSection(settings) {
        const styles = getStyles(settings);
        const header = (extraTitle) => `
            <div class="iigqs-section-title iigqs-section-title-row">
                <span class="iigqs-section-title-label"><i class="fa-fw fa-solid fa-paw"></i> Стиль${extraTitle || ''}</span>
                ${styles.length ? `
                    <button type="button" class="iigqs-manage-toggle" id="iigqs-styles-manage-toggle"
                        title="${manageStylesOpen ? 'Готово' : 'Выбрать, какие стили показывать'}">
                        <i class="fa-fw fa-solid ${manageStylesOpen ? 'fa-check' : 'fa-gear'}"></i>
                    </button>
                ` : ''}
            </div>
        `;

        if (!styles.length) {
            return `${header()}<div class="iigqs-hint">Стилей пока нет — добавь их в настройках IIG («Стили»), и они появятся здесь.</div>`;
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

    // ── Секция «Connection Profile (ExtBlocks)»: чипы с только выбранными профилями
    // подключения из Connection Manager + переключатель в режим «отметить нужные»
    // (профилей в Connection Manager обычно много, показывать сразу все — захламляет). ──
    function renderExtBlocksProfileSection() {
        const ebSettings = getExtBlocksSettings();
        const profiles = getConnectionManagerProfiles();
        const header = (extraTitle) => `
            <div class="iigqs-section-title iigqs-section-title-row">
                <span class="iigqs-section-title-label"><i class="fa-fw fa-solid fa-link"></i> Connection Profile (ExtBlocks)${extraTitle || ''}</span>
                ${profiles.length ? `
                    <button type="button" class="iigqs-manage-toggle" id="iigqs-extprofiles-manage-toggle"
                        title="${manageExtProfilesOpen ? 'Готово' : 'Выбрать, какие профили показывать'}">
                        <i class="fa-fw fa-solid ${manageExtProfilesOpen ? 'fa-check' : 'fa-gear'}"></i>
                    </button>
                ` : ''}
            </div>
        `;

        if (!ebSettings) {
            return `${header()}<div class="iigqs-hint">Расширение ExtBlocks не найдено или ещё не загрузилось.</div>`;
        }
        if (!profiles.length) {
            return `${header()}<div class="iigqs-hint">В Connection Manager SillyTavern пока нет ни одного профиля.</div>`;
        }

        if (manageExtProfilesOpen) {
            const pinned = getPinnedExtBlocksProfileNames();
            const quickActions = profiles.length > 1 ? `
                <div class="iigqs-manage-quickactions">
                    <button type="button" class="iigqs-manage-quickbtn" id="iigqs-extprofiles-pin-all">Отметить все</button>
                    <button type="button" class="iigqs-manage-quickbtn" id="iigqs-extprofiles-pin-none">Снять всё</button>
                </div>
            ` : '';
            const listHtml = `${quickActions}<div class="iigqs-manage-list">`
                + profiles.map(p => `
                    <label class="iigqs-manage-item">
                        <input type="checkbox" class="iigqs-extprofile-pin" data-profile-name="${esc(p.name)}" ${pinned.includes(p.name) ? 'checked' : ''}>
                        <span>${esc(p.name || 'Профиль')}</span>
                    </label>
                `).join('')
                + `</div>`;
            return `${header(' — выбор')}${listHtml}`;
        }

        const pinnedNames = getPinnedExtBlocksProfileNames();
        const pinnedProfiles = profiles.filter((p) => pinnedNames.includes(p.name));
        const activeName = getExtBlocksActiveConnectionProfileName(ebSettings);

        let body;
        if (!pinnedProfiles.length) {
            body = `<div class="iigqs-hint">Ни один профиль ещё не выбран для быстрого доступа — нажми ⚙ и отметь нужные.</div>`;
        } else {
            body = `<div class="iigqs-chips">`
                + pinnedProfiles.map(p => `<button type="button" class="iigqs-chip ${activeName === p.name ? 'iigqs-active' : ''}" data-conn-profile-name="${esc(p.name)}">${esc(p.name || 'Профиль')}</button>`).join('')
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

        // Чипы стиля (стили IIG) — data-style-id
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

        const sel = panel.querySelector('#iigqs-profile-select');
        if (sel) {
            sel.addEventListener('change', () => {
                const settings = getIigSettings();
                if (!settings) return;
                const id = sel.value;
                if (!id) return;
                const profile = getConnectionProfiles(settings).find(p => p.id === id);
                if (!profile) { toast('Профиль не найден', 'error'); return; }
                applyConnectionProfile(settings, profile);
                closePanel();
                toast(`Подключение: ${profile.name}`, 'success');
            });
        }

        // Списки «Размер» — data-size-field. Выбор применяет значение сразу же;
        // панель не закрывается, т.к. у некоторых провайдеров тут два списка подряд
        // (соотношение сторон + разрешение) и удобно выставить оба один за другим.
        panel.querySelectorAll('select[data-size-field]').forEach(sel => {
            sel.addEventListener('change', () => {
                const settings = getIigSettings();
                if (!settings) return;
                const field = sel.dataset.sizeField;
                applySizeField(settings, field, sel.value);
                const opt = sel.options[sel.selectedIndex];
                toast(`Размер: ${opt ? opt.text : sel.value}`, 'success');
            });
        });

        // Чипы Connection Profile (ExtBlocks) — data-conn-profile-name. Тап = переключить
        // профиль текущего активного API Preset через нативный select ExtBlocks
        // (см. applyExtBlocksConnectionProfile).
        panel.querySelectorAll('.iigqs-chip[data-conn-profile-name]').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.connProfileName;
                const ok = applyExtBlocksConnectionProfile(name);
                if (ok) {
                    closePanel();
                    toast(`Connection Profile: ${name}`, 'success');
                }
            });
        });

        // Шестерёнка — переключение вида «чипы» ↔ «выбор профилей подключения для чипов»
        const extProfilesManageToggle = panel.querySelector('#iigqs-extprofiles-manage-toggle');
        if (extProfilesManageToggle) {
            extProfilesManageToggle.addEventListener('click', () => {
                manageExtProfilesOpen = !manageExtProfilesOpen;
                refreshPanel();
            });
        }

        // Чекбоксы выбора, какие профили подключения закрепить в быстром доступе
        panel.querySelectorAll('.iigqs-extprofile-pin').forEach(cb => {
            cb.addEventListener('change', () => {
                togglePinExtBlocksProfile(cb.dataset.profileName);
            });
        });

        // «Отметить все» / «Снять всё» в режиме выбора профилей подключения
        const extProfilesPinAllBtn = panel.querySelector('#iigqs-extprofiles-pin-all');
        if (extProfilesPinAllBtn) {
            extProfilesPinAllBtn.addEventListener('click', () => {
                const store = getQsStore();
                if (!store) return;
                store.pinnedExtBlocksProfiles = getConnectionManagerProfiles().map(p => p.name);
                saveSettings();
                refreshPanel();
            });
        }
        const extProfilesPinNoneBtn = panel.querySelector('#iigqs-extprofiles-pin-none');
        if (extProfilesPinNoneBtn) {
            extProfilesPinNoneBtn.addEventListener('click', () => {
                const store = getQsStore();
                if (!store) return;
                store.pinnedExtBlocksProfiles = [];
                saveSettings();
                refreshPanel();
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

        // top-anchored; clamp saved pos to current viewport (like Asta)
        const vv = window.visualViewport;
        const vw = vv ? vv.width : window.innerWidth;
        const vh = vv ? vv.height : window.innerHeight;
        const saved = loadPos();
        const pos = (saved && saved.right >= 0 && saved.top >= 0 && saved.right < vw - 10 && saved.top < vh - 10)
            ? saved
            : { right: 15, top: 120 };
        fab.style.right = `${pos.right}px`;
        fab.style.top = `${pos.top}px`;

        document.body.appendChild(fab);

        let dragging = false;
        let moved = false;
        let startClientX = 0, startClientY = 0;
        let startRight = 0, startTop = 0;

        fab.addEventListener('pointerdown', (e) => {
            dragging = true;
            moved = false;
            startClientX = e.clientX;
            startClientY = e.clientY;
            const cs = getComputedStyle(fab);
            startRight = parseFloat(cs.right) || 0;
            startTop = parseFloat(cs.top) || 0;
            fab.setPointerCapture(e.pointerId);
        });

        fab.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startClientX;
            const dy = e.clientY - startClientY;
            if (!moved && Math.hypot(dx, dy) > 6) moved = true;
            if (!moved) return;

            let newRight = startRight - dx;
            let newTop = startTop + dy;
            const size = fab.offsetWidth || 44;
            const cvw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
            const cvh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            newRight = Math.max(4, Math.min(newRight, cvw - size - 4));
            newTop = Math.max(4, Math.min(newTop, cvh - size - 4));

            fab.style.right = `${newRight}px`;
            fab.style.top = `${newTop}px`;
            if (panelOpen) closePanel();
        });

        fab.addEventListener('pointerup', (e) => {
            if (!dragging) return;
            dragging = false;
            try { fab.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (moved) {
                const right = parseFloat(getComputedStyle(fab).right) || 0;
                const top = parseFloat(getComputedStyle(fab).top) || 0;
                savePos(right, top);
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
