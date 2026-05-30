// renderer.js – полная финальная версия
let data = { folders: [], collections: [], environments: [] };
let activeCollectionId = null;
let activeCollection = null;
let searchQuery = '';
let searchExpandedFolders = new Set();
let currentStepForSend = null;
let fullHistory = [];
let sidebarWidth = 260;
let generatedJsonString = '';

// ================== DOM Elements ==================
const treeContainer = document.getElementById('treeContainer');
const searchInput = document.getElementById('searchInput');
const emptyStateEl = document.getElementById('emptyState');
const collectionEditorEl = document.getElementById('collectionEditor');
const collectionNameInput = document.getElementById('collectionNameInput');
const stepsContainer = document.getElementById('stepsContainer');
const dataFileInput = document.getElementById('dataFileInput');
const selectedFileName = document.getElementById('selectedFileName');
const delayInput = document.getElementById('delayInput');
const progressEl = document.getElementById('progress');
const runnerResultsBody = document.querySelector('#runnerResultsTable tbody');
const historyTableBody = document.querySelector('#historyTable tbody');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeNameEl = document.getElementById('themeName');
const tabBtns = document.querySelectorAll('.tab-btn');
const runnerTab = document.getElementById('runnerTab');
const historyTab = document.getElementById('historyTab');
const historyFilter = document.getElementById('historyCollectionFilter');
const detailModal = document.getElementById('detailModal');
const detailContent = document.getElementById('detailContent');
const detailModalTitle = document.getElementById('detailModalTitle');
const closeDetailModalBtn = document.getElementById('closeDetailModalBtn');
const sendRequestModal = document.getElementById('sendRequestModal');
const testDataInput = document.getElementById('testDataInput');
const sendSingleBtn = document.getElementById('sendSingleBtn');
const closeSendModalBtn = document.getElementById('closeSendModalBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const newRootCollectionBtn = document.getElementById('newRootCollectionBtn');
const addStepBtn = document.getElementById('addStepBtn');
const runCollectionBtn = document.getElementById('runCollectionBtn');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const clearHistoryFilterBtn = document.getElementById('clearHistoryFilterBtn');
const jsonGeneratorBtn = document.getElementById('jsonGeneratorBtn');
const importCurlBtn = document.getElementById('importCurlBtn');
const inputModal = document.getElementById('inputModal');
const inputModalField = document.getElementById('inputModalField');
const inputModalTitle = document.getElementById('inputModalTitle');
const inputModalOkBtn = document.getElementById('inputModalOkBtn');
const inputModalCancelBtn = document.getElementById('inputModalCancelBtn');
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

// Environments & Right Panel
const environmentSelect = document.getElementById('environmentSelect');
const manageEnvBtnGlobal = document.getElementById('manageEnvBtnGlobal');
const envManagerModal = document.getElementById('envManagerModal');
const envListContainer = document.getElementById('envListContainer');
const newEnvNameInput = document.getElementById('newEnvNameInput');
const createEnvBtn = document.getElementById('createEnvBtn');
const closeEnvManagerBtn = document.getElementById('closeEnvManagerBtn');
const rightPanel = document.getElementById('rightPanel');
const envVarsContainer = document.getElementById('envVarsContainer');
const closeRightPanelBtn = document.getElementById('closeRightPanelBtn');
const toggleRightPanelBtn = document.getElementById('toggleRightPanelBtn');

// Global History & Clear Filters
const globalHistoryBtn = document.getElementById('globalHistoryBtn');
const globalHistoryModal = document.getElementById('globalHistoryModal');
const globalHistoryTableBody = document.querySelector('#globalHistoryTable tbody');
const globalHistoryFilter = document.getElementById('globalHistoryFilter');
const refreshGlobalHistoryBtn = document.getElementById('refreshGlobalHistoryBtn');
const clearGlobalHistoryBtn = document.getElementById('clearGlobalHistoryBtn');
const clearGlobalHistoryFilterBtn = document.getElementById('clearGlobalHistoryFilterBtn');
const closeGlobalHistoryBtn = document.getElementById('closeGlobalHistoryBtn');
const clearHistoryModal = document.getElementById('clearHistoryModal');
const clearHistoryTimeFilter = document.getElementById('clearHistoryTimeFilter');
const clearHistoryTypeFilter = document.getElementById('clearHistoryTypeFilter');
const clearHistoryMethodFilter = document.getElementById('clearHistoryMethodFilter');
const clearHistoryStatusFilter = document.getElementById('clearHistoryStatusFilter');
const clearHistoryPreview = document.getElementById('clearHistoryPreview');
const closeClearHistoryModalBtn = document.getElementById('closeClearHistoryModalBtn');
const applyClearHistoryBtn = document.getElementById('applyClearHistoryBtn');

// JSON Generator & cURL
const jsonModal = document.getElementById('jsonModal');
const fieldsContainer = document.getElementById('fieldsContainer');
const addFieldBtn = document.getElementById('addFieldBtn');
const generateJsonBtn = document.getElementById('generateJsonBtn');
const saveJsonBtn = document.getElementById('saveJsonBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const jsonPreview = document.getElementById('jsonPreview');
const curlModal = document.getElementById('curlModal');
const curlInput = document.getElementById('curlInput');
const closeCurlModalBtn = document.getElementById('closeCurlModalBtn');
const parseCurlBtn = document.getElementById('parseCurlBtn');

// Import Dropdown
const globalImportBtn = document.getElementById('globalImportBtn');
const importDropdownMenu = document.getElementById('importDropdownMenu');
const importFilesBtn = document.getElementById('importFilesBtn');
const importFolderBtn = document.getElementById('importFolderBtn');

// ================== CodeMirror ==================
const activeEditors = new Map();

function createCodeMirrorEditor(textarea, initialValue = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-wrapper';
    if (typeof CodeMirror === 'undefined') {
        textarea.style.display = '';
        wrapper.appendChild(textarea);
        return { wrapper, editor: null };
    }
    const currentTheme = localStorage.getItem('ab-runner-theme') || 'dark';
    const editor = CodeMirror(wrapper, {
        value: initialValue,
        mode: { name: 'javascript', json: true, statementIndent: 2 },
        theme: 'default',
        lineNumbers: true,
        lineWrapping: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        styleActiveLine: true,
        tabSize: 2,
        indentUnit: 2,
        indentWithTabs: false,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        extraKeys: { 'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment', 'Ctrl-F': 'findPersistent', 'Cmd-F': 'findPersistent' }
    });
    editor.on('change', () => {
        textarea.value = editor.getValue();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    editor.setSize('100%', '180px');
    textarea.style.display = 'none';
    wrapper.appendChild(textarea);
    wrapper.classList.add('theme-' + currentTheme);
    return { wrapper, editor };
}

function destroyAllEditors() {
    activeEditors.forEach(({ editor }) => {
        if (editor && typeof editor.toTextArea === 'function') {
            const wrapper = editor.getWrapperElement();
            if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        }
    });
    activeEditors.clear();
}

function updateEditorsTheme() {
    const currentTheme = localStorage.getItem('ab-runner-theme') || 'dark';
    activeEditors.forEach(({ editor, wrapper }) => {
        if (!editor) return;
        editor.setOption('theme', 'default');
        wrapper.classList.remove('theme-dark', 'theme-light', 'theme-red-white', 'theme-red-black');
        wrapper.classList.add('theme-' + currentTheme);
        editor.refresh();
    });
}

// ================== JSON Formatter ==================
function formatJSON(text) {
    if (!text || !text.trim()) return '';
    let result = '', indent = 0, inString = false, stringChar = '', inLineComment = false, inBlockComment = false, inWord = false;
    const indentStr = '  ';
    const addNewline = () => { result += '\n' + indentStr.repeat(indent); inWord = false; };
    const addChar = (c) => { result += c; };
    const isWordChar = (c) => /[a-zA-Z0-9_]/.test(c);
    const endsWithWhitespace = () => !result || /[\s]$/.test(result);
    const trimTrailing = () => { result = result.replace(/[ \t]*\n([ \t]*\n)*/g, '\n').replace(/[ \t]+$/, ''); };

    for (let i = 0; i < text.length; i++) {
        const c = text[i], next = text[i + 1];
        if (inLineComment) { addChar(c); if (c === '\n') { inLineComment = false; result += indentStr.repeat(indent); } i++; continue; }
        if (inBlockComment) { addChar(c); if (c === '*' && next === '/') { addChar('/'); inBlockComment = false; i += 2; } else i++; continue; }
        if (inString) { addChar(c); if (c === '\\' && i + 1 < text.length) { addChar(text[++i]); i++; continue; } if (c === stringChar) { inString = false; inWord = false; } i++; continue; }
        if (/\s/.test(c)) { if (inWord) inWord = false; i++; continue; }
        if ((c === '"' || c === "'") && !inString) { if (!endsWithWhitespace() && !inWord && result && !/[{:,\[]$/.test(result)) result += ' '; addChar(c); inString = true; stringChar = c; inWord = false; i++; continue; }
        if (c === '/' && next === '/') { if (result && !result.endsWith('\n') && !/\s$/.test(result)) result += ' '; addChar('/'); addChar('/'); inLineComment = true; inWord = false; i += 2; continue; }
        if (c === '/' && next === '*') { if (result && !result.endsWith('\n') && !/\s$/.test(result)) result += ' '; addChar('/'); addChar('*'); inBlockComment = true; inWord = false; i += 2; continue; }
        if (c === '{' || c === '[') { if (inWord) { result += ' '; inWord = false; } addChar(c); indent++; let j = i + 1, hasContent = false; while (j < text.length) { const ch = text[j]; if (/\s/.test(ch)) { j++; continue; } if ((ch === '}' && c === '{') || (ch === ']' && c === '[')) break; if (ch === '/' && (text[j+1] === '/' || text[j+1] === '*')) { j += 2; while(j < text.length && !((text[j] === '/' && text[j-1] === '/') || (text[j] === '*' && text[j+1] === '/'))) j++; continue; } hasContent = true; break; } if (hasContent) addNewline(); inWord = false; i++; continue; }
        if (c === '}' || c === ']') { indent--; if (inWord) inWord = false; const trimmed = result.trimEnd(); const last = trimmed[trimmed.length - 1]; if (last !== '{' && last !== '[') { trimTrailing(); addNewline(); } else trimTrailing(); addChar(c); i++; continue; }
        if (c === ',') { if (inWord) inWord = false; addChar(c); let j = i + 1; while(j < text.length) { const ch = text[j]; if (/\s/.test(ch)) { j++; continue; } if (ch === '/' && (text[j+1] === '/' || text[j+1] === '*')) { j += 2; while(j < text.length && text[j] !== '\n') j++; continue; } break; } if (text[j] !== '}' && text[j] !== ']') addNewline(); inWord = false; i++; continue; }
        if (c === ':') { if (inWord) inWord = false; result = result.replace(/[\s]+$/, ''); addChar(c); result += ' '; inWord = false; i++; continue; }
        if (isWordChar(c)) { if (!inWord && !endsWithWhitespace() && result && !/[{:,\[]$/.test(result)) result += ' '; addChar(c); inWord = true; i++; continue; }
        if (inWord) inWord = false; if (!endsWithWhitespace() && result && !/[{:,\[]$/.test(result)) result += ' '; addChar(c); i++;
    }
    return result.trim();
}

function formatCurrentEditor(editorId) {
    const info = activeEditors.get(editorId);
    if (!info || !info.editor) { toast('Редактор не найден', 'error'); return; }
    const text = info.editor.getValue();
    if (!text.trim()) { toast('Нечего форматировать', 'warning'); return; }
    try { info.editor.setValue(formatJSON(text)); toast('JSON отформатирован', 'success'); }
    catch (e) { toast('Ошибка форматирования: ' + e.message, 'error'); }
}

// ================== Utilities ==================
function escapeHtml(t) { return typeof t !== 'string' ? (t == null ? '' : String(t)) : t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function txt(tag, text, cls) { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
function debounce(fn, d) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; }
function toast(msg, type = 'info', dur = 3000) {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    const el = document.createElement('div'); el.className = `toast toast-${type}`; el.textContent = msg; c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, dur);
}
function confirmDialog(title, msg) {
    return new Promise(res => {
        const d = document.createElement('div'); d.className = 'confirm-dialog';
        d.innerHTML = `<div class="confirm-dialog-content"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(msg)}</p><div class="confirm-dialog-actions"><button class="secondary cancel-btn">Отмена</button><button class="danger ok-btn">OK</button></div></div>`;
        document.body.appendChild(d);
        const cleanup = (r) => { d.classList.remove('show'); setTimeout(() => d.remove(), 200); res(r); };
        d.querySelector('.ok-btn').onclick = () => cleanup(true);
        d.querySelector('.cancel-btn').onclick = () => cleanup(false);
        d.onclick = (e) => { if (e.target === d) cleanup(false); };
        requestAnimationFrame(() => d.classList.add('show'));
    });
}
function showInputModal(title, def) {
    return new Promise(res => {
        inputModalTitle.textContent = title; inputModalField.value = def || '';
        inputModalField.style.display = 'block'; inputModal.classList.add('active'); inputModalField.focus();
        const cleanup = () => { inputModal.classList.remove('active'); inputModalOkBtn.removeEventListener('click', onOk); inputModalCancelBtn.removeEventListener('click', onCancel); inputModalField.removeEventListener('keydown', onKey); };
        const onOk = () => { cleanup(); res(inputModalField.value.trim()); };
        const onCancel = () => { cleanup(); res(null); };
        const onKey = e => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); };
        inputModalOkBtn.addEventListener('click', onOk); inputModalCancelBtn.addEventListener('click', onCancel); inputModalField.addEventListener('keydown', onKey);
    });
}

const debouncedSave = debounce(async () => { try { await saveData(); } catch (e) { toast('Ошибка сохранения: ' + e.message, 'error'); } }, 500);

// ================== Sidebar & Resize ==================
let isResizing = false, startX, startWidth;
resizer.addEventListener('mousedown', e => { if (sidebar.style.display === 'none') return; isResizing = true; startX = e.clientX; startWidth = sidebar.offsetWidth; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; });
document.addEventListener('mousemove', e => { if (!isResizing) return; const w = Math.max(200, Math.min(Math.floor(window.innerWidth * 0.4), startWidth + (e.clientX - startX))); sidebar.style.width = w + 'px'; sidebarWidth = w; });
document.addEventListener('mouseup', () => { if (isResizing) { isResizing = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; } });
toggleSidebarBtn.addEventListener('click', () => {
    if (sidebar.style.display === 'none') { sidebar.style.display = ''; resizer.classList.remove('hidden'); sidebar.style.width = sidebarWidth + 'px'; sidebarToggleBtn.style.display = 'none'; toggleSidebarBtn.textContent = 'Скрыть панель'; toggleSidebarBtn.classList.remove('show'); }
    else { sidebar.style.display = 'none'; resizer.classList.add('hidden'); sidebarToggleBtn.style.display = 'block'; toggleSidebarBtn.textContent = 'Показать панель'; toggleSidebarBtn.classList.add('show'); }
});
sidebarToggleBtn.addEventListener('click', () => { sidebar.style.display = ''; resizer.classList.remove('hidden'); sidebar.style.width = sidebarWidth + 'px'; sidebarToggleBtn.style.display = 'none'; toggleSidebarBtn.textContent = '☰ Скрыть панель'; });

// ================== Modals (No Overlay Close) ==================
function setupModalClose() {
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', e => { if (e.target === m) { /* Overlay disabled */ } });
    });
}
document.addEventListener('DOMContentLoaded', setupModalClose);
closeDetailModalBtn.addEventListener('click', () => { detailModal.classList.remove('active'); detailModal.style.zIndex = ''; });
closeSendModalBtn.addEventListener('click', () => { sendRequestModal.classList.remove('active'); currentStepForSend = null; });
if (closeEnvManagerBtn) closeEnvManagerBtn.addEventListener('click', () => envManagerModal.classList.remove('active'));
if (closeRightPanelBtn) closeRightPanelBtn.addEventListener('click', () => rightPanel.classList.add('hidden'));
if (closeGlobalHistoryBtn) closeGlobalHistoryBtn.addEventListener('click', () => { globalHistoryModal.classList.remove('active'); globalHistoryModal.style.zIndex = ''; });
if (closeClearHistoryModalBtn) closeClearHistoryModalBtn.addEventListener('click', () => clearHistoryModal.classList.remove('active'));
if (closeModalBtn) closeModalBtn.addEventListener('click', () => jsonModal.classList.remove('active'));
if (closeCurlModalBtn) closeCurlModalBtn.addEventListener('click', () => curlModal.classList.remove('active'));

// ================== Search ==================
function getTrigrams(s) { const str = '  ' + s.toLowerCase() + ' '; const t = []; for (let i = 0; i < str.length - 2; i++) t.push(str.substring(i, i + 3)); return t; }
function trigramSimilarity(a, b) { if (!a || !b) return 0; const ta = getTrigrams(a), tb = getTrigrams(b); if (!ta.length || !tb.length) return 0; const sa = new Set(ta); let i = 0; for (const x of tb) if (sa.has(x)) i++; return i / (ta.length + tb.length - i); }
function getSearchText(col) { const p = [col.name || '']; if (col.steps) col.steps.forEach(s => p.push(s.name || '', s.method || '', s.url || '')); return p.join(' ').toLowerCase(); }
function collectionRelevance(col, q) { const t = getSearchText(col); if (!q) return 1; if (t.includes(q)) return 1 + q.length / t.length; return trigramSimilarity(q, t); }
const SEARCH_THRESHOLD = 0.15;
function matchesCollection(col) { return !searchQuery || collectionRelevance(col, searchQuery) > SEARCH_THRESHOLD; }
searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLowerCase(); renderTree(); });

function prepareSearchState() {
    searchExpandedFolders.clear();
    if (!searchQuery) return;
    const folders = data.folders || [];
    data.collections.forEach(col => {
        if (matchesCollection(col)) {
            let fid = col.folderId;
            while (fid) { searchExpandedFolders.add(fid); const f = folders.find(x => x.id === fid); fid = f ? f.parentId : null; }
        }
    });
    folders.forEach(f => {
        if (f.name && f.name.toLowerCase().includes(searchQuery)) {
            let fid = f.id;
            while (fid) { searchExpandedFolders.add(fid); const pf = folders.find(x => x.id === fid); fid = pf ? pf.parentId : null; }
        }
    });
}
function isFolderVisibleInSearch(fid) { return !searchQuery || searchExpandedFolders.has(fid); }

// ================== Environments ==================
function getActiveEnvironment() {
    if (!data.activeEnvironmentId || !data.environments) return {};
    const env = data.environments.find(e => e.id === data.activeEnvironmentId);
    if (!env) return {};
    const res = {};
    env.variables.forEach(v => { if (v.enabled !== false && v.key) res[v.key] = v.value; });
    return res;
}
function updateEnvironmentSelector() {
    if (!data.environments) data.environments = [];
    environmentSelect.innerHTML = '<option value="">No Environment</option>';
    data.environments.forEach(env => { const o = document.createElement('option'); o.value = env.id; o.textContent = env.name; environmentSelect.appendChild(o); });
    if (data.activeEnvironmentId && data.environments.some(e => e.id === data.activeEnvironmentId)) environmentSelect.value = data.activeEnvironmentId;
}
environmentSelect.addEventListener('change', () => {
    data.activeEnvironmentId = environmentSelect.value || null; saveData(); renderRightPanel();
    toast(`Окружение: ${environmentSelect.options[environmentSelect.selectedIndex].text}`, 'info', 1500);
});

// Right Panel
if (toggleRightPanelBtn) toggleRightPanelBtn.addEventListener('click', () => rightPanel.classList.toggle('hidden'));
function renderRightPanel() {
    if (!envVarsContainer) return;
    envVarsContainer.innerHTML = '';
    const envId = data.activeEnvironmentId;
    if (!envId || !data.environments) { envVarsContainer.innerHTML = '<div class="empty-env-msg">Выберите окружение слева</div>'; return; }
    const env = data.environments.find(e => e.id === envId);
    if (!env) { envVarsContainer.innerHTML = '<div class="empty-env-msg">Окружение не найдено</div>'; return; }
    env.variables.forEach((v, idx) => {
        const row = document.createElement('div'); row.className = 'env-var-row';
        const kIn = document.createElement('input'); kIn.placeholder = 'Ключ'; kIn.value = v.key || '';
        kIn.addEventListener('input', debounce(() => { env.variables[idx].key = kIn.value.trim(); saveData(); }, 300));
        const vIn = document.createElement('input'); vIn.placeholder = 'Значение'; vIn.value = v.value || '';
        vIn.addEventListener('input', debounce(() => { env.variables[idx].value = vIn.value; saveData(); }, 300));
        const rm = document.createElement('button'); rm.className = 'env-var-remove'; rm.textContent = '✕';
        rm.onclick = () => { env.variables.splice(idx, 1); saveData(); renderRightPanel(); };
        row.append(kIn, vIn, rm); envVarsContainer.appendChild(row);
    });
    const add = document.createElement('button'); add.className = 'add-env-var-btn'; add.textContent = '+ Добавить переменную';
    add.onclick = () => { env.variables.push({ key: '', value: '', enabled: true }); saveData(); renderRightPanel(); };
    envVarsContainer.appendChild(add);
}

// Env Manager Modal
if (manageEnvBtnGlobal) manageEnvBtnGlobal.addEventListener('click', () => { renderEnvList(); envManagerModal.classList.add('active'); });
if (createEnvBtn) createEnvBtn.addEventListener('click', () => {
    const name = newEnvNameInput.value.trim();
    if (!name) { toast('Введите название', 'warning'); return; }
    const newEnv = { id: generateUniqueId(), name, variables: [{ key: '', value: '', enabled: true }] };
    data.environments.push(newEnv);
    data.activeEnvironmentId = newEnv.id;
    saveData().then(() => {
        newEnvNameInput.value = '';
        renderEnvList();
        updateEnvironmentSelector();
        renderRightPanel();
        envManagerModal.classList.remove('active');
        rightPanel.classList.remove('hidden');
        toast(`Создано: ${name}`, 'success');
    });
});

function renderEnvList() {
    if (!envListContainer) return;
    envListContainer.innerHTML = '';
    const envs = data.environments || [];
    if (!envs.length) { envListContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">Нет окружений</div>'; return; }
    envs.forEach(env => {
        const div = document.createElement('div'); div.className = 'env-manager-item';
        const hdr = document.createElement('div'); hdr.className = 'env-manager-header';
        const ttl = document.createElement('span'); ttl.textContent = env.name; ttl.style.fontWeight = '600';
        const acts = document.createElement('div');
        const selectBtn = document.createElement('button');
        selectBtn.className = 'secondary';
        selectBtn.style.cssText = 'font-size:12px;padding:4px 8px;';
        selectBtn.textContent = '✏️ Редактировать';
        selectBtn.onclick = () => {
            data.activeEnvironmentId = env.id;
            environmentSelect.value = env.id;
            saveData().then(() => {
                renderRightPanel();
                updateEnvironmentSelector();
                envManagerModal.classList.remove('active');
                rightPanel.classList.remove('hidden');
                toast(`Выбрано: ${env.name}`, 'success');
            });
        };
        const del = document.createElement('button');
        del.className = 'danger';
        del.style.cssText = 'font-size:12px;padding:4px 8px;';
        del.textContent = 'Удалить';
        del.onclick = async () => {
            if (await confirmDialog('Удалить окружение', `Удалить "${env.name}"?`)) {
                data.environments = data.environments.filter(e => e.id !== env.id);
                if (data.activeEnvironmentId === env.id) { data.activeEnvironmentId = null; environmentSelect.value = ''; }
                saveData().then(() => { renderEnvList(); updateEnvironmentSelector(); renderRightPanel(); });
            }
        };
        acts.append(selectBtn, del); hdr.append(ttl, acts);
        div.appendChild(hdr); envListContainer.appendChild(div);
    });
}

// ================== Placeholders ==================
function cleanString(str) { return typeof str !== 'string' ? str : str.replace(/^\uFEFF/, '').replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, ''); }
function replacePlaceholders(template, item, environment = {}, options = {}) {
    if (!template || typeof template !== 'string') return template;
    const cleaned = cleanString(template);
    const { toJson = false } = options;
    const env = environment && typeof environment === 'object' ? environment : {};
    const dataItem = item && typeof item === 'object' ? item : {};
    let res = cleaned.replace(/\{\{([^{}]+)\}\}/g, (m, k) => {
        const key = k.trim();
        if (key in env) { const v = env[key]; if (v == null) return ''; if (typeof v === 'object') return toJson ? JSON.stringify(v) : String(v); return String(v); }
        return m;
    });
    res = res.replace(/\{([^{}]+)\}(?!\})/g, (m, path) => {
        const keys = path.split('.'); let val = dataItem, found = true;
        for (const k of keys) { if (val == null || typeof val !== 'object') { found = false; break; } if (k in val) val = val[k]; else { found = false; break; } }
        if (found && val !== undefined) { if (val == null) return ''; if (typeof val === 'object') return toJson ? JSON.stringify(val) : String(val); return String(val); }
        return m;
    });
    return res;
}

// ================== Postman Import ==================
async function processPostmanFiles(files) {
    let cols = 0, folds = 0;
    files.forEach(fObj => {
        if (!fObj || !fObj.data) return;
        let json = fObj.data;
        const cleanKeys = obj => { if (!obj || typeof obj !== 'object') return obj; const n = {}; for (const k in obj) if (obj.hasOwnProperty(k)) n[k.trim()] = cleanKeys(obj[k]); return n; };
        if (Object.keys(json).some(k => k !== k.trim())) json = cleanKeys(json);

        if (json.info && json.info.schema && json.item) {
            const rootName = json.info.name || 'Imported Collection';
            let root = data.folders.find(f => f.name === rootName && f.parentId === null);
            let rootId;
            if (root) rootId = root.id;
            else { const nf = { id: generateUniqueId(), name: rootName, parentId: null, collapsed: true }; data.folders.push(nf); rootId = nf.id; folds++; }
            parsePostmanItems(json.item, rootId);
            cols += countPostmanRequests(json.item);
            if (json.variable?.length) {
                const envN = `${rootName} (Env)`;
                if (!data.environments.some(e => e.name === envN)) data.environments.push({ id: generateUniqueId(), name: envN, variables: json.variable.map(v => ({ key: v.key, value: v.value, enabled: true })) });
            }
        } else if (json.values && json.name) {
            data.environments.push({
                id: generateUniqueId(),
                name: typeof json.name === 'string' ? json.name.trim() : json.name,
                variables: json.values.map(v => ({
                    key: typeof v.key === 'string' ? v.key.trim() : (v.key || ''),
                    value: typeof v.value === 'string' ? v.value.trim() : (v.value || ''),
                    enabled: v.enabled !== false
                }))
            });
            toast(`Окружение "${json.name}" импортировано`, 'success');
        } else toast(`Файл "${fObj.fileName}" не распознан`, 'error');
    });
    saveData(); renderTree(); updateEnvironmentSelector();
    if (cols || folds) toast(`Импорт: ${folds} папок, ${cols} запросов`, 'success');
}

function parsePostmanItems(items, pId) {
    if (!Array.isArray(items)) return;
    items.forEach(it => {
        if (it.item && Array.isArray(it.item)) {
            const nf = { id: generateUniqueId(), name: it.name || 'Folder', parentId: pId, collapsed: true };
            data.folders.push(nf); parsePostmanItems(it.item, nf.id);
        } else if (it.request) {
            const req = it.request;
            const step = { name: it.name || '', method: (typeof req.method === 'string' ? req.method : 'GET').toUpperCase(), url: '', auth: '', body: '', contentType: 'application/json', customHeaders: [] };
            if (typeof req.url === 'string') step.url = req.url; else if (req.url?.raw) step.url = req.url.raw;
            if (Array.isArray(req.header)) req.header.forEach(h => { if (h.disabled) return; const kl = h.key.toLowerCase(); if (kl === 'authorization') step.auth = h.value; else if (kl === 'content-type') step.contentType = h.value; else step.customHeaders.push({ key: h.key, value: h.value, enabled: true }); });
            if (req.body) {
                if (req.body.mode === 'raw' && req.body.raw) step.body = req.body.raw;
                else if (req.body.mode === 'urlencoded' && Array.isArray(req.body.urlencoded)) { const o = {}; req.body.urlencoded.forEach(u => { if (!u.disabled) o[u.key] = u.value; }); step.body = JSON.stringify(o, null, 2); }
                else if (req.body.mode === 'formdata' && Array.isArray(req.body.formdata)) { const o = {}; req.body.formdata.forEach(u => { if (!u.disabled && u.type === 'text') o[u.key] = u.value; }); step.body = JSON.stringify(o, null, 2); }
            }
            data.collections.push({ id: generateUniqueId(), name: step.name || 'Request', steps: [step], folderId: pId });
        }
    });
}
function countPostmanRequests(items) { let c = 0; if (!Array.isArray(items)) return 0; items.forEach(i => { if (i.item) c += countPostmanRequests(i.item); else if (i.request) c++; }); return c; }

// ================== Import Dropdown ==================
if (globalImportBtn) {
    globalImportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        importDropdownMenu.classList.toggle('show');
    });
}
document.addEventListener('click', (e) => {
    if (importDropdownMenu && !importDropdownMenu.contains(e.target) && e.target !== globalImportBtn) {
        importDropdownMenu.classList.remove('show');
    }
});
if (importFilesBtn) {
    importFilesBtn.addEventListener('click', async () => {
        importDropdownMenu.classList.remove('show');
        const files = await window.api.openPostmanDialog();
        if (files && files.length > 0) await processPostmanFiles(files);
    });
}
if (importFolderBtn) {
    importFolderBtn.addEventListener('click', async () => {
        importDropdownMenu.classList.remove('show');
        const files = await window.api.openPostmanFolderDialog();
        if (files && files.length > 0) await processPostmanFiles(files);
    });
}

// ================== Tree Rendering ==================
function renderFolderChildren(folderId, container, level) {
    const folders = data.folders || [], collections = data.collections || [];
    folders.filter(f => f.parentId === folderId).forEach(folder => {
        if (!isFolderVisibleInSearch(folder.id)) return;
        const isExp = searchQuery && searchExpandedFolders.has(folder.id);
        const isCol = isExp ? false : folder.collapsed;
        const div = document.createElement('div'); div.className = 'folder-item' + (isCol ? ' collapsed' : ''); div.dataset.folderId = folder.id; div.draggable = true; div.style.paddingLeft = (level * 16) + 'px';
        const nm = txt('span', '📁 ' + (folder.name || 'Без названия'), 'folder-name');
        const acts = document.createElement('div'); acts.className = 'folder-actions';
        const addB = document.createElement('button'); addB.className = 'folder-add-collection-btn'; addB.title = 'Добавить коллекцию'; addB.textContent = '+';
        const delB = document.createElement('button'); delB.className = 'delete-folder-btn'; delB.textContent = '✕';
        acts.append(addB, delB); div.append(nm, acts);
        const child = document.createElement('div'); child.className = 'folder-children' + (isCol ? ' collapsed' : ''); child.dataset.folderId = folder.id;
        container.append(div, child);
        renderFolderContents(folder.id, child, level + 1);

        div.addEventListener('click', e => {
            if (e.target.classList.contains('delete-folder-btn') || e.target.classList.contains('folder-add-collection-btn')) return;
            if (searchQuery && searchExpandedFolders.has(folder.id)) return;
            folder.collapsed = !folder.collapsed; saveData().then(() => renderTree());
        });
        div.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'folder:' + folder.id); e.dataTransfer.effectAllowed = 'move'; div.classList.add('dragging'); });
        div.addEventListener('dragend', () => div.classList.remove('dragging'));
        div.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); if (!e.dataTransfer.types.includes('text/plain')) return; div.classList.add('drag-over'); e.dataTransfer.dropEffect = 'move'; });
        div.addEventListener('dragleave', e => { if (!div.contains(e.relatedTarget)) div.classList.remove('drag-over'); });
        div.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); div.classList.remove('drag-over'); const d = e.dataTransfer.getData('text/plain'); if (d === 'folder:' + folder.id) return; handleDropOnFolder(d, folder.id); });
        child.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); if (!e.dataTransfer.types.includes('text/plain')) return; child.classList.add('drag-over'); div.classList.add('drag-over'); e.dataTransfer.dropEffect = 'move'; });
        child.addEventListener('dragleave', e => { if (!child.contains(e.relatedTarget)) { child.classList.remove('drag-over'); div.classList.remove('drag-over'); } });
        child.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); child.classList.remove('drag-over'); div.classList.remove('drag-over'); const d = e.dataTransfer.getData('text/plain'); if (d === 'folder:' + folder.id) return; handleDropOnFolder(d, folder.id); });

        delB.addEventListener('click', async e => {
            e.stopPropagation();
            if (await confirmDialog('Удалить папку', `Удалить "${folder.name}" и всё содержимое?`)) {
                const toDel = []; const collect = pid => { data.folders.filter(f => f.parentId === pid).forEach(f => { toDel.push(f.id); collect(f.id); }); }; collect(folder.id);
                const ids = [folder.id, ...toDel];
                data.collections = data.collections.filter(c => !ids.includes(c.folderId));
                data.folders = data.folders.filter(f => !ids.includes(f.id));
                if (activeCollectionId && !data.collections.find(c => c.id === activeCollectionId)) { activeCollectionId = null; activeCollection = null; showEmptyState(); }
                await saveData(); renderTree(); toast('Папка удалена', 'success');
            }
        });
        addB.addEventListener('click', async e => { e.stopPropagation(); const nc = { id: generateUniqueId(), name: 'Новая коллекция', steps: [], folderId: folder.id }; data.collections.push(nc); await saveData(); selectCollection(nc.id); renderTree(); });
    });
    collections.filter(c => c.folderId === folderId && matchesCollection(c)).forEach(col => renderCollectionItem(col, container, level + 1));
}
function handleDropOnFolder(d, target) { if (!d) return; if (d.startsWith('col:')) moveCollectionToFolder(d.slice(4), target); else if (d.startsWith('folder:')) { const fid = d.slice(7); if (fid !== target && !isDescendant(target, fid)) moveFolderToFolder(fid, target); } }
function isDescendant(fid, anc) { const f = data.folders.find(x => x.id === fid); if (!f) return false; if (f.parentId === anc) return true; if (!f.parentId) return false; return isDescendant(f.parentId, anc); }
function renderFolderContents(fid, c, l) { renderFolderChildren(fid, c, l); }
let treeListeners = false;
function renderTree() {
    prepareSearchState(); treeContainer.innerHTML = ''; renderFolderChildren(null, treeContainer, 0);
    if (!treeListeners) { treeListeners = true; treeContainer.addEventListener('dragover', e => { e.preventDefault(); treeContainer.classList.add('drag-over-root'); e.dataTransfer.dropEffect = 'move'; }); treeContainer.addEventListener('dragleave', e => { if (!treeContainer.contains(e.relatedTarget)) treeContainer.classList.remove('drag-over-root'); }); treeContainer.addEventListener('drop', e => { if (e.target === treeContainer) { e.preventDefault(); treeContainer.classList.remove('drag-over-root'); const d = e.dataTransfer.getData('text/plain'); if (d.startsWith('col:')) moveCollectionToFolder(d.slice(4), null); else if (d.startsWith('folder:')) moveFolderToFolder(d.slice(7), null); } }); }
}
function renderCollectionItem(col, container, lvl) {
    const div = document.createElement('div'); div.className = `collection-item${activeCollectionId === col.id ? ' active' : ''}`; div.dataset.collectionId = col.id; div.draggable = true; div.style.paddingLeft = (lvl * 16) + 'px';
    const nm = document.createElement('span'); nm.className = 'collection-name'; nm.title = 'Двойной клик для переименования';
    const badge = getCollectionMethodBadge(col); if (badge) { const b = document.createElement('span'); b.className = 'method-badge'; b.dataset.method = badge === 'MIX' ? '' : badge; b.textContent = badge; nm.append(b, document.createTextNode(' ')); }
    const icon = getCollectionIcon(col); if (icon) nm.appendChild(document.createTextNode(icon + ' '));
    nm.appendChild(document.createTextNode(col.name || 'Без названия'));
    const del = document.createElement('button'); del.className = 'delete-collection-btn'; del.textContent = '✕';
    div.append(nm, del);
    div.addEventListener('click', e => { if (e.target.classList.contains('delete-collection-btn')) return; selectCollection(col.id); });
    del.addEventListener('click', async e => { e.stopPropagation(); if (await confirmDialog('Удалить коллекцию', 'Удалить эту коллекцию?')) { data.collections = data.collections.filter(c => c.id !== col.id); if (activeCollectionId === col.id) { activeCollectionId = null; activeCollection = null; showEmptyState(); } saveData(); renderTree(); toast('Коллекция удалена', 'success'); } });
    nm.addEventListener('dblclick', async e => { e.stopPropagation(); const n = await showInputModal('Новое название', col.name); if (n) { col.name = n; await saveData(); renderTree(); if (activeCollectionId === col.id) collectionNameInput.value = col.name; toast('Переименовано', 'success'); } });
    div.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'col:' + col.id); e.dataTransfer.effectAllowed = 'move'; div.classList.add('dragging'); });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));
    container.appendChild(div);
}
async function moveCollectionToFolder(cid, fid) { const c = data.collections.find(x => x.id === cid); if (c) { c.folderId = fid; await saveData(); renderTree(); } }
async function moveFolderToFolder(fid, pid) { const f = data.folders.find(x => x.id === fid); if (f && fid !== pid) { f.parentId = pid; await saveData(); renderTree(); } }
function cleanupEmptyCollection(cid) { const c = data.collections.find(x => x.id === cid); if (!c) return; if (!c.steps?.length && (!c.name || c.name === 'Новая коллекция') && !c.results?.length) { data.collections = data.collections.filter(x => x.id !== cid); saveData(); } }
function selectCollection(id) { const prev = activeCollectionId; if (prev && prev !== id) cleanupEmptyCollection(prev); activeCollectionId = id; activeCollection = data.collections.find(c => c.id === id); if (!activeCollection) return; renderCollectionEditor(); renderTree(); }
function showEmptyState() { collectionEditorEl.style.display = 'none'; emptyStateEl.style.display = 'block'; }
function renderCollectionEditor() {
    emptyStateEl.style.display = 'none'; collectionEditorEl.style.display = 'block'; collectionNameInput.value = activeCollection.name || '';
    collectionNameInput.oninput = () => { activeCollection.name = collectionNameInput.value.trim() || 'Без названия'; debouncedSave(); renderTree(); };
    if (activeCollection.results) renderRunnerTable(activeCollection.results); else runnerResultsBody.innerHTML = '';
    tabBtns.forEach(b => b.classList.remove('active')); document.querySelector('[data-tab="runner"]').classList.add('active');
    runnerTab.style.display = 'block'; historyTab.style.display = 'none'; renderSteps();
}
function getCollectionIcon(c) { return (!c.steps || !c.steps.length) ? '' : '📄'; }
function getCollectionMethodBadge(c) { if (!c.steps || !c.steps.length) return null; const m = [...new Set(c.steps.map(s => s.method).filter(Boolean))]; return m.length === 1 ? m[0] : (m.length > 1 ? 'MIX' : null); }
function generateUniqueId() { let id = Date.now().toString(); while (data.collections.some(c => c.id === id) || data.folders.some(f => f.id === id)) id += '-' + Math.random().toString(36).slice(2, 7); return id; }

// ================== Steps ==================
function renderSteps() {
    destroyAllEditors(); stepsContainer.innerHTML = ''; if (!activeCollection.steps) activeCollection.steps = [];
    activeCollection.steps.forEach((s, i) => stepsContainer.appendChild(createStepCard(s, i)));
    requestAnimationFrame(() => activeEditors.forEach(({ editor }) => { if (editor) editor.refresh(); }));
}
function createStepCard(step, idx) {
    const card = document.createElement('div'); card.className = 'step-card'; card.dataset.index = idx;
    const hdr = document.createElement('div'); hdr.className = 'step-header';
    const nm = txt('span', step.name || `Шаг ${idx + 1}`, 'step-name');
    const acts = document.createElement('div'); acts.className = 'step-actions';
    const sendB = document.createElement('button'); sendB.className = 'send-btn'; sendB.textContent = '▶ Send'; sendB.onclick = () => openSendModal(step);
    const curlB = document.createElement('button'); curlB.className = 'curl-import-btn'; curlB.textContent = '📋 cURL'; curlB.title = 'Импорт cURL'; curlB.onclick = () => importStepFromCurl(step, idx);
    const delB = document.createElement('button'); delB.className = 'danger'; delB.style.cssText = 'padding:2px 8px;font-size:12px;'; delB.textContent = 'Удалить';
    delB.onclick = async () => { if (await confirmDialog('Удалить шаг', 'Удалить этот шаг?')) { activeCollection.steps.splice(idx, 1); saveData(); renderSteps(); toast('Шаг удалён', 'success'); } };
    acts.append(sendB, curlB, delB); hdr.append(nm, acts); card.appendChild(hdr);

    const nf = document.createElement('div'); nf.className = 'field'; nf.appendChild(txt('label', 'Название шага'));
    const ni = document.createElement('input'); ni.type = 'text'; ni.className = 'step-name-input'; ni.value = step.name || ''; ni.placeholder = 'Например: Логин'; nf.appendChild(ni); card.appendChild(nf);

    const umr = document.createElement('div'); umr.className = 'url-method-row';
    const mf = document.createElement('div'); mf.className = 'field'; mf.appendChild(txt('label', 'Метод'));
    const md = document.createElement('div'); md.className = 'method-dropdown'; md.dataset.method = step.method || 'GET';
    const ms = document.createElement('div'); ms.className = 'method-selected'; ms.textContent = step.method || 'GET';
    const mo = document.createElement('div'); mo.className = 'method-options';
    ['GET','POST','PUT','PATCH','DELETE'].forEach(m => { const o = document.createElement('div'); o.className = 'method-option'; o.dataset.method = m; o.textContent = m; if (m === step.method) o.classList.add('selected'); o.onclick = () => { ms.textContent = m; md.dataset.method = m; mo.querySelectorAll('.method-option').forEach(x => x.classList.remove('selected')); o.classList.add('selected'); md.classList.remove('open'); md.dispatchEvent(new Event('input', { bubbles: true })); }; mo.appendChild(o); });
    ms.onclick = e => { e.stopPropagation(); document.querySelectorAll('.method-dropdown.open').forEach(d => { if (d !== md) d.classList.remove('open'); }); md.classList.toggle('open'); };
    md.append(ms, mo); Object.defineProperty(md, 'value', { get: () => md.dataset.method }); mf.appendChild(md); umr.appendChild(mf);

    const uf = document.createElement('div'); uf.className = 'field'; uf.appendChild(txt('label', 'URL'));
    const ui = document.createElement('input'); ui.type = 'text'; ui.className = 'step-url'; ui.value = step.url || ''; ui.placeholder = 'http://api.example.com/{{id}}'; uf.appendChild(ui); umr.appendChild(uf); card.appendChild(umr);

    const tc = document.createElement('div'); tc.className = 'step-tabs';
    const tb = {}, tbc = {};
    const crt = (id, lbl) => { const b = document.createElement('button'); b.className = 'step-tab-btn'; b.textContent = lbl; b.dataset.tab = id; const c = document.createElement('div'); c.className = 'step-tab-content'; c.dataset.tab = id; tb[id] = b; tbc[id] = c; tc.appendChild(b); return { b, c }; };
    crt('headers', 'Headers'); crt('auth', 'Authorization'); crt('body', 'Body');
    card.appendChild(tc);
    Object.keys(tb).forEach(id => { tb[id].onclick = () => { Object.values(tb).forEach(x => x.classList.remove('active')); Object.values(tbc).forEach(x => x.classList.remove('active')); tb[id].classList.add('active'); tbc[id].classList.add('active'); if (id === 'body') requestAnimationFrame(() => activeEditors.forEach(({ editor }) => { if (editor) editor.refresh(); })); }; });
    tb.headers.classList.add('active'); tbc.headers.classList.add('active');

    let hArr = step.customHeaders; if (!Array.isArray(hArr)) hArr = (hArr && typeof hArr === 'object') ? Object.entries(hArr).map(([k,v]) => ({ key: k, value: String(v), enabled: true })) : []; step.customHeaders = hArr;
    const ht = document.createElement('table'); ht.className = 'headers-table'; ht.innerHTML = `<thead><tr><th class="header-enabled"></th><th class="header-key">Ключ</th><th class="header-value">Значение</th><th class="header-actions"></th></tr></thead>`;
    const tbody = document.createElement('tbody'); ht.appendChild(tbody);
    const dlId = 'hl-' + idx + '-' + Date.now(); const dl = document.createElement('datalist'); dl.id = dlId; ['Content-Type','Accept','Authorization','X-API-Key','User-Agent','Cache-Control','X-Request-ID'].forEach(h => { const o = document.createElement('option'); o.value = h; dl.appendChild(o); }); tbc.headers.appendChild(dl);
    const renderHR = (hd, i) => { const tr = document.createElement('tr'); tr.className = 'header-row' + (hd.enabled ? '' : ' disabled'); const tdE = document.createElement('td'); tdE.className = 'header-enabled'; const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = hd.enabled !== false; cb.onchange = () => { hd.enabled = cb.checked; tr.classList.toggle('disabled', !cb.checked); debouncedSave(); }; tdE.appendChild(cb); tr.appendChild(tdE); const tdK = document.createElement('td'); tdK.className = 'header-key'; const ki = document.createElement('input'); ki.type = 'text'; ki.setAttribute('list', dlId); ki.value = hd.key || ''; ki.placeholder = 'Название'; ki.autocomplete = 'off'; ki.oninput = () => { hd.key = ki.value.trim(); debouncedSave(); }; tdK.appendChild(ki); tr.appendChild(tdK); const tdV = document.createElement('td'); tdV.className = 'header-value'; const vi = document.createElement('input'); vi.type = 'text'; vi.value = hd.value || ''; vi.placeholder = 'Значение'; vi.oninput = () => { hd.value = vi.value; debouncedSave(); }; tdV.appendChild(vi); tr.appendChild(tdV); const tdA = document.createElement('td'); tdA.className = 'header-actions'; const rm = document.createElement('button'); rm.className = 'header-remove-btn'; rm.textContent = '✕'; rm.title = 'Удалить'; rm.onclick = () => { step.customHeaders.splice(i, 1); tr.style.opacity = '0'; tr.style.transform = 'translateX(10px)'; tr.style.transition = 'all 0.2s'; setTimeout(() => { tr.remove(); debouncedSave(); }, 180); }; tdA.appendChild(rm); tr.appendChild(tdA); tbody.appendChild(tr); };
    step.customHeaders.forEach((h, i) => renderHR(h, i));
    const addH = document.createElement('button'); addH.className = 'add-header-btn'; addH.textContent = 'Добавить заголовок'; addH.onclick = () => { const nh = { key: '', value: '', enabled: true }; step.customHeaders.push(nh); renderHR(nh, step.customHeaders.length - 1); debouncedSave(); }; tbc.headers.append(ht, addH);

    const af = document.createElement('div'); af.className = 'field'; af.appendChild(txt('label', 'Authorization')); const ai = document.createElement('input'); ai.type = 'text'; ai.className = 'step-auth'; ai.value = step.auth || ''; ai.placeholder = 'Bearer токен'; af.appendChild(ai); tbc.auth.appendChild(af);

    const bf = document.createElement('div'); bf.className = 'field'; const blr = document.createElement('div'); blr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;'; blr.appendChild(txt('label', 'Тело запроса (JSON, Ctrl+/ для комментариев)')); const fmtB = document.createElement('button'); fmtB.className = 'secondary'; fmtB.style.cssText = 'padding:2px 10px;font-size:12px;'; fmtB.textContent = '🎨 Форматировать'; blr.appendChild(fmtB); const bta = document.createElement('textarea'); bta.className = 'step-body'; bta.value = step.body || ''; const eId = 'cm-' + idx + '-' + Date.now(); const { wrapper: cw, editor: ce } = createCodeMirrorEditor(bta, step.body || ''); activeEditors.set(eId, { editor: ce, wrapper: cw }); fmtB.onclick = e => { e.stopPropagation(); formatCurrentEditor(eId); }; bf.append(blr, cw); tbc.body.appendChild(bf);
    card.append(tbc.headers, tbc.auth, tbc.body);

    const save = () => { step.name = ni.value.trim(); step.url = ui.value.trim(); step.method = md.value; step.auth = ai.value.trim(); step.body = bta.value; md.dataset.method = step.method; nm.textContent = step.name || `Шаг ${idx + 1}`; debouncedSave(); };
    [ni, ui, md, ai, bta].forEach(el => el.addEventListener('input', save));
    return card;
}

// ================== Runner (с таймингами) ==================
const formatTime = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}с`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}м ${remainingSeconds}с`;
};

runCollectionBtn.addEventListener('click', async () => {
    if (!activeCollection || !activeCollection.steps?.length) { 
        toast('Добавьте шаги', 'warning'); 
        return; 
    }
    
    let items; 
    try { 
        items = await readDataFile(); 
    } catch (e) { 
        toast('Ошибка файла: ' + e.message, 'error'); 
        return; 
    }
    
    const delay = parseInt(delayInput.value, 10) || 0; 
    if (!activeCollection.results) activeCollection.results = []; 
    else activeCollection.results.length = 0;
    
    runnerResultsBody.innerHTML = ''; 
    progressEl.innerHTML = '<div style="color: var(--accent); font-style: italic; padding: 8px 0;">⏳ Запуск и выполнение запросов...</div>';
    
    try { 
        const result = await window.api.runCollection(
            activeCollection.steps, 
            items, 
            delay, 
            activeCollection.name, 
            getActiveEnvironment()
        ); 
        
        progressEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; background: var(--success-bg); padding: 16px; border-radius: var(--radius-md); border-left: 4px solid var(--success); margin-top: 12px;">
                <div style="font-weight: 700; color: var(--success); font-size: 15px; display: flex; align-items: center; gap: 8px;">
                    ✅ Выполнение завершено!
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
                    <div style="background: var(--bg-card); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Всего запросов</div>
                        <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${result.totalExecuted}</div>
                    </div>
                    <div style="background: var(--bg-card); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Общее время</div>
                        <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${formatTime(result.totalTime)}</div>
                    </div>
                    <div style="background: var(--bg-card); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); grid-column: span 2;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Среднее время запроса</div>
                        <div style="font-size: 18px; font-weight: 700; color: var(--accent);">${formatTime(result.avgTime)}</div>
                    </div>
                </div>
            </div>
        `;
        
        toast('Коллекция выполнена', 'success'); 
    }
    catch (e) { 
        progressEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; background: var(--error-bg); padding: 16px; border-radius: var(--radius-md); border-left: 4px solid var(--danger); margin-top: 12px;">
                <div style="font-weight: 700; color: var(--danger); font-size: 15px;">❌ Критическая ошибка выполнения</div>
                <div style="color: var(--text-primary);">${escapeHtml(e.message)}</div>
            </div>
        `;
        toast('Ошибка: ' + e.message, 'error'); 
    }
});

window.api.onProgress((progressData) => {
    const { 
        item, stepName, success, status, error, response,
        requestNumber, totalRequests, requestDuration,
        elapsedMs, etaMs, avgRequestTime
    } = progressData;
    
    const row = document.createElement('tr'); 
    row.className = success ? 'success' : 'error';
    row.dataset.responseData = response ? JSON.stringify(response) : ''; 
    row.dataset.error = error || ''; 
    row.dataset.item = item; 
    row.dataset.stepName = stepName;
    
    row.appendChild(txt('td', `${requestNumber}/${totalRequests}`));
    row.appendChild(txt('td', item)); 
    row.appendChild(txt('td', stepName));
    
    const td3 = document.createElement('td'); 
    const badge = txt('span', success ? `✓ ${status}` : `✗ ${status || 'ERROR'}`, `status-badge ${success ? 'status-success' : 'status-error'}`); 
    td3.appendChild(badge); 
    row.appendChild(td3);
    
    const td4 = document.createElement('td');
    td4.textContent = `${requestDuration}ms`;
    td4.style.fontFamily = 'monospace';
    td4.style.fontSize = '12px';
    row.appendChild(td4);
    
    runnerResultsBody.appendChild(row);
    
    if (activeCollection) { 
        if (!activeCollection.results) activeCollection.results = []; 
        activeCollection.results.push({ 
            item, stepName, success, status, error, 
            responseData: row.dataset.responseData,
            requestDuration 
        }); 
    }
    
    row.addEventListener('dblclick', () => showResponseDetails(row));
    
    const progressPercent = Math.round((requestNumber / totalRequests) * 100);
    progressEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
            <div><strong>Прогресс:</strong> ${requestNumber}/${totalRequests} (${progressPercent}%)</div>
            <div><strong>Текущий:</strong> ${stepName} → ${formatTime(requestDuration)}</div>
            <div><strong>Среднее время:</strong> ${formatTime(avgRequestTime)}</div>
            <div><strong>Прошло:</strong> ${formatTime(elapsedMs)}</div>
            <div><strong>Осталось:</strong> ~${formatTime(etaMs)}</div>
        </div>
    `;
});

function renderRunnerTable(res) { 
    runnerResultsBody.innerHTML = ''; 
    res.forEach(r => { 
        const row = document.createElement('tr'); 
        row.className = r.success ? 'success' : 'error'; 
        row.dataset.responseData = r.responseData || ''; 
        row.dataset.error = r.error || ''; 
        row.dataset.item = r.item; 
        row.dataset.stepName = r.stepName; 
        row.append(txt('td', r.item || ''), txt('td', r.stepName || '')); 
        const td = document.createElement('td'); 
        td.appendChild(txt('span', r.success ? `✓ ${r.status}` : `✗ ${r.status || 'ERROR'}`, `status-badge ${r.success ? 'status-success' : 'status-error'}`)); 
        row.appendChild(td); 
        row.addEventListener('dblclick', () => showResponseDetails(row)); 
        runnerResultsBody.appendChild(row); 
    }); 
}

// ================== Send (Умная модалка с авто-парсингом) ==================
function extractVariables(step) {
    const dataVars = new Set();
    const envVars = new Set();
    const envRegex = /\{\{([^{}]+)\}\}/g;
    const dataRegex = /(?<!\{)\{([^{}]+)\}(?!\})/g;

    const scanString = (str) => {
        if (!str || typeof str !== 'string') return;
        let m;
        while ((m = envRegex.exec(str)) !== null) envVars.add(m[1].trim());
        envRegex.lastIndex = 0;
        while ((m = dataRegex.exec(str)) !== null) dataVars.add(m[1].trim());
        dataRegex.lastIndex = 0;
    };

    const scanJsonValue = (value) => {
        if (typeof value === 'string') {
            scanString(value);
        } else if (Array.isArray(value)) {
            value.forEach(scanJsonValue);
        } else if (value && typeof value === 'object') {
            Object.values(value).forEach(scanJsonValue);
        }
    };

    const stripJsonComments = (str) => {
        let result = '';
        let inString = false;
        let stringChar = '';
        let inLineComment = false;
        let inBlockComment = false;
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            const next = str[i + 1];
            if (inLineComment) { if (c === '\n') { inLineComment = false; result += c; } continue; }
            if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
            if (inString) { result += c; if (c === '\\' && i + 1 < str.length) { result += str[++i]; continue; } if (c === stringChar) inString = false; continue; }
            if (c === '"' || c === "'") { inString = true; stringChar = c; result += c; continue; }
            if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
            if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
            result += c;
        }
        return result;
    };

    scanString(step.url);
    scanString(step.auth);
    if (Array.isArray(step.customHeaders)) {
        step.customHeaders.forEach(h => {
            if (h.enabled !== false) {
                scanString(h.key);
                scanString(h.value);
            }
        });
    }

    if (step.body && typeof step.body === 'string') {
        const cleanedBody = stripJsonComments(step.body).trim();
        try {
            const parsed = JSON.parse(cleanedBody);
            scanJsonValue(parsed);
        } catch (e) {
            scanString(step.body);
        }
    }

    return {
        dataVars: Array.from(dataVars).sort(),
        envVars: Array.from(envVars).sort()
    };
}

function openSendModal(step) {
    currentStepForSend = step;
    sendRequestModal.classList.add('active');

    const infoEl = sendRequestModal.querySelector('.send-modal-step-name');
    if (infoEl) infoEl.textContent = `${step.method || 'GET'} ${step.name || 'Без названия'}`;

    const { dataVars, envVars } = extractVariables(step);
    const activeEnv = getActiveEnvironment();

    const envSection = document.getElementById('sendEnvVarsSection');
    const envContainer = document.getElementById('sendEnvVarsContainer');
    if (envContainer) {
        envContainer.innerHTML = '';
        if (envVars.length > 0) {
            envSection.style.display = 'block';
            envVars.forEach(varName => {
                const row = document.createElement('div');
                row.className = 'send-var-row';
                const label = document.createElement('div');
                label.className = 'send-var-label';
                label.innerHTML = `<span class="send-var-badge env">ENV</span> ${escapeHtml(varName)}`;
                const value = document.createElement('div');
                value.className = 'send-var-value';
                if (varName in activeEnv) {
                    value.textContent = activeEnv[varName];
                    value.classList.add('has-value');
                } else {
                    value.textContent = '⚠ не задано в окружении';
                    value.classList.add('no-value');
                }
                row.appendChild(label);
                row.appendChild(value);
                envContainer.appendChild(row);
            });
        } else {
            envSection.style.display = 'none';
        }
    }

    const dataSection = document.getElementById('sendDataVarsSection');
    const dataContainer = document.getElementById('sendDataVarsContainer');
    if (dataContainer) {
        dataContainer.innerHTML = '';
        if (dataVars.length > 0) {
            dataSection.style.display = 'block';
            dataVars.forEach(varName => {
                const row = document.createElement('div');
                row.className = 'send-var-row';
                const label = document.createElement('div');
                label.className = 'send-var-label';
                label.innerHTML = `<span class="send-var-badge data">DATA</span> ${escapeHtml(varName)}`;
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'send-var-input';
                input.placeholder = `Значение для ${varName}`;
                input.dataset.varName = varName;
                row.appendChild(label);
                row.appendChild(input);
                dataContainer.appendChild(row);
            });
            setTimeout(() => {
                const firstInput = dataContainer.querySelector('.send-var-input');
                if (firstInput) firstInput.focus();
            }, 100);
        } else {
            dataSection.style.display = 'none';
        }
    }

    const noVarsMsg = document.getElementById('sendNoVarsMsg');
    if (noVarsMsg) noVarsMsg.style.display = (envVars.length === 0 && dataVars.length === 0) ? 'block' : 'none';

    updateRawJsonFromInputs();
    if (dataContainer) {
        dataContainer.querySelectorAll('.send-var-input').forEach(input => {
            input.addEventListener('input', updateRawJsonFromInputs);
        });
    }
}

function updateRawJsonFromInputs() {
    const dataContainer = document.getElementById('sendDataVarsContainer');
    if (!dataContainer || !testDataInput) return;
    const obj = {};
    dataContainer.querySelectorAll('.send-var-input').forEach(input => {
        const name = input.dataset.varName;
        const val = input.value;
        if (name) {
            if (val === '') obj[name] = '';
            else if (/^-?\d+$/.test(val)) obj[name] = parseInt(val, 10);
            else if (/^-?\d+\.\d+$/.test(val)) obj[name] = parseFloat(val);
            else if (val === 'true') obj[name] = true;
            else if (val === 'false') obj[name] = false;
            else if (val === 'null') obj[name] = null;
            else obj[name] = val;
        }
    });
    testDataInput.value = JSON.stringify(obj, null, 2);
}

sendSingleBtn.addEventListener('click', async () => {
    if (!currentStepForSend) return;
    const td = testDataInput.value.trim();
    try { if (td) JSON.parse(td); } catch (e) { toast('Некорректный JSON', 'error'); return; }
    sendSingleBtn.disabled = true; sendSingleBtn.textContent = 'Отправка...';
    try {
        const res = await window.api.sendSingleRequest(currentStepForSend, td || '{}', activeCollection?.name || '', getActiveEnvironment());
        sendSingleBtn.disabled = false; sendSingleBtn.textContent = '▶ Отправить'; sendRequestModal.classList.remove('active');
        const rd = { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data, url: res.url };
        buildDetailContent({ responseData: JSON.stringify(rd), error: res.success ? null : res.statusText, url: res.url, requestBody: res.requestBody, requestHeaders: res.requestHeaders, item: `Данные: ${td || '{}'}`, stepName: currentStepForSend.name || 'Одиночный запрос' });
        detailModalTitle.textContent = `Результат: ${currentStepForSend.name || 'Одиночный запрос'}`; detailModal.classList.add('active');
        toast(res.success ? 'Успешно' : `Ошибка: ${res.statusText}`, res.success ? 'success' : 'error');
    } catch (e) { sendSingleBtn.disabled = false; sendSingleBtn.textContent = '▶ Отправить'; toast('Ошибка: ' + e.message, 'error'); }
});

// ================== History ==================
async function loadHistory() { fullHistory = await window.api.getHistory(); updateHistoryFilter(); renderFilteredHistory(); }
function updateHistoryFilter() { historyFilter.innerHTML = '<option value="">Все коллекции</option>'; [...new Set(fullHistory.map(h => h.collection).filter(Boolean))].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; historyFilter.appendChild(o); }); }
function renderFilteredHistory() { const v = historyFilter.value; historyTableBody.innerHTML = ''; (v ? fullHistory.filter(h => h.collection === v) : fullHistory).forEach(e => { const row = document.createElement('tr'); row.className = e.success ? 'success' : 'error'; row.append(txt('td', new Date(e.timestamp).toLocaleString()), txt('td', e.collection || '—'), txt('td', e.type === 'single' ? 'Send' : 'Runner'), txt('td', e.item), txt('td', e.stepName)); const tu = txt('td', e.url); tu.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; row.appendChild(tu); const ts = document.createElement('td'); ts.appendChild(txt('span', e.success ? `✓ ${e.status}` : `✗ ${e.status}`, `status-badge ${e.success ? 'status-success' : 'status-error'}`)); row.appendChild(ts); row.addEventListener('dblclick', () => showHistoryDetail(e)); historyTableBody.appendChild(row); }); }
function showHistoryDetail(e) { const rd = { status: e.status, statusText: '', headers: e.responseHeaders || {}, data: e.responseData, url: e.url }; buildDetailContent({ responseData: JSON.stringify(rd), error: e.success ? null : e.error, url: e.url, requestBody: e.requestBody, requestHeaders: e.requestHeaders, item: e.item, stepName: e.stepName }); detailModalTitle.textContent = `История: ${e.stepName}`; detailModal.classList.add('active'); }
refreshHistoryBtn.addEventListener('click', loadHistory);
historyFilter.addEventListener('change', renderFilteredHistory);

// ================== Details ==================
function showResponseDetails(row) { buildDetailContent({ responseData: row.dataset.responseData, error: row.dataset.error, item: row.dataset.item, stepName: row.dataset.stepName, url: row.dataset.url, requestBody: row.dataset.requestBody, requestHeaders: row.dataset.requestHeaders }); detailModalTitle.textContent = `Детали: ${row.dataset.stepName}`; detailModal.classList.add('active'); }
function formatJsonBlock(data) { if (data == null) return '<span style="color:var(--text-secondary)">Пусто</span>'; let str = typeof data === 'string' ? data : JSON.stringify(data); let fmt = str, isJ = false; try { const p = JSON.parse(str); fmt = JSON.stringify(p, null, 2); isJ = true; } catch(e) {} return `<pre class="${isJ ? 'json-display' : 'text-display'}">${escapeHtml(fmt)}</pre>`; }
function buildDetailContent({ responseData, error, item, stepName, url, requestBody, requestHeaders }) {
    let html = '';
    if (responseData && responseData !== 'null' && responseData !== 'undefined') {
        try {
            const resp = JSON.parse(responseData); const st = resp.status || ''; const cls = st >= 200 && st < 300 ? 'success' : 'error';
            html += `<div class="detail-section"><h3>Статус</h3><span class="detail-status ${cls}">${escapeHtml(String(st))} ${escapeHtml(resp.statusText || '')}</span></div>`;
            html += `<div class="detail-section"><h3>Общая информация</h3>`;
            if (item) html += `<div class="detail-field"><div class="detail-field-label">Элемент</div><div class="detail-field-value">${escapeHtml(item)}</div></div>`;
            if (stepName) html += `<div class="detail-field"><div class="detail-field-label">Шаг</div><div class="detail-field-value">${escapeHtml(stepName)}</div></div>`;
            if (resp.url || url) { const u = resp.url || url; html += `<div class="detail-field"><div class="detail-field-label">URL</div><div class="detail-field-value">${escapeHtml(u)}<button class="copy-btn" data-copy="${escapeHtml(u)}">📋 Копировать</button></div></div>`; }
            html += `</div>`;
            if (requestHeaders && Object.keys(requestHeaders).length) html += `<div class="detail-section"><h3>Заголовки запроса</h3><div class="detail-field-value">${formatJsonBlock(requestHeaders)}<button class="copy-btn" data-copy="${escapeHtml(JSON.stringify(requestHeaders, null, 2))}">📋 Копировать</button></div></div>`;
            if (requestBody) html += `<div class="detail-section"><h3>Тело запроса</h3><div class="detail-field-value">${formatJsonBlock(requestBody)}<button class="copy-btn" data-copy="${escapeHtml(typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody))}">📋 Копировать</button></div></div>`;
            if (resp.headers) html += `<div class="detail-section"><h3>Заголовки ответа</h3><div class="detail-field-value">${formatJsonBlock(resp.headers)}<button class="copy-btn" data-copy="${escapeHtml(JSON.stringify(resp.headers, null, 2))}">📋 Копировать</button></div></div>`;
            html += `<div class="detail-section"><h3>Тело ответа</h3><div class="detail-field-value">${formatJsonBlock(resp.data)}<button class="copy-btn" data-copy="${escapeHtml(JSON.stringify(resp.data, null, 2))}">📋 Копировать</button></div></div>`;
        } catch(e) { html += `<div class="detail-section"><h3>Ответ</h3><div class="detail-field-value">${formatJsonBlock(responseData)}</div></div>`; }
    } else html += `<div class="detail-section"><h3>Ответ</h3><div class="detail-field-value">Нет данных</div></div>`;
    if (error) { html += `<div class="detail-section"><h3>Ошибка</h3><div class="detail-field-value" style="color:var(--danger);">${escapeHtml(error)}`; try { if (responseData) { const p = JSON.parse(responseData); if (p.data?.errors?.[0]) { const s = p.data.errors[0]; html += `<br><br><strong>Детали от сервера:</strong><br><strong>Статус:</strong> ${escapeHtml(s.status || '')}<br><strong>Заголовок:</strong> ${escapeHtml(s.title || '')}`; if (s.detail) html += `<br><strong>Описание:</strong> ${escapeHtml(s.detail)}<br>`; } } } catch(e) {} html += `</div></div>`; }
    detailContent.innerHTML = html;
    detailContent.querySelectorAll('[data-copy]').forEach(btn => { btn.onclick = () => { const t = btn.getAttribute('data-copy'); navigator.clipboard.writeText(t).then(() => { const o = btn.textContent; btn.textContent = '✓ Скопировано'; setTimeout(() => btn.textContent = o, 2000); }); }; });
}

// ================== Global History ==================
if (globalHistoryBtn) globalHistoryBtn.addEventListener('click', async () => { await loadGlobalHistory(); globalHistoryModal.classList.add('active'); });
async function loadGlobalHistory() { fullHistory = await window.api.getHistory(); updateGlobalHistoryFilter(); renderGlobalHistoryTable(); }
function updateGlobalHistoryFilter() { globalHistoryFilter.innerHTML = '<option value="">Все коллекции</option>'; [...new Set(fullHistory.map(h => h.collection).filter(Boolean))].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; globalHistoryFilter.appendChild(o); }); }
function renderGlobalHistoryTable() { globalHistoryTableBody.innerHTML = ''; const v = globalHistoryFilter.value; (v ? fullHistory.filter(h => h.collection === v) : fullHistory).forEach(e => { const row = document.createElement('tr'); row.className = e.success ? 'success' : 'error'; row.append(txt('td', new Date(e.timestamp).toLocaleString()), txt('td', e.collection || '—'), txt('td', e.type === 'single' ? 'Send' : 'Runner'), txt('td', e.item), txt('td', e.stepName)); const tu = txt('td', e.url); tu.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; row.appendChild(tu); const ts = document.createElement('td'); ts.appendChild(txt('span', e.success ? `✓ ${e.status}` : `✗ ${e.status}`, `status-badge ${e.success ? 'status-success' : 'status-error'}`)); row.appendChild(ts); row.addEventListener('dblclick', () => showHistoryDetail(e)); globalHistoryTableBody.appendChild(row); }); }
globalHistoryFilter.addEventListener('change', renderGlobalHistoryTable);
if (refreshGlobalHistoryBtn) refreshGlobalHistoryBtn.addEventListener('click', loadGlobalHistory);

// ================== Clear History ==================
clearHistoryBtn.addEventListener('click', async () => { if (await confirmDialog('Очистить всю историю', 'Удалить ВСЕ записи?')) { await window.api.clearHistory(); fullHistory = []; historyTableBody.innerHTML = ''; if (globalHistoryTableBody) globalHistoryTableBody.innerHTML = ''; toast('История очищена', 'success'); } });
if (clearGlobalHistoryBtn) clearGlobalHistoryBtn.addEventListener('click', async () => { if (await confirmDialog('Очистить всю историю', 'Удалить ВСЕ записи?')) { await window.api.clearHistory(); fullHistory = []; historyTableBody.innerHTML = ''; if (globalHistoryTableBody) globalHistoryTableBody.innerHTML = ''; toast('История очищена', 'success'); } });
if (clearHistoryFilterBtn) clearHistoryFilterBtn.addEventListener('click', () => { clearHistoryModal.classList.add('active'); updateClearHistoryPreview(); });
if (clearGlobalHistoryFilterBtn) clearGlobalHistoryFilterBtn.addEventListener('click', () => { clearHistoryModal.classList.add('active'); updateClearHistoryPreview(); });
[clearHistoryTimeFilter, clearHistoryTypeFilter, clearHistoryMethodFilter, clearHistoryStatusFilter].forEach(f => { if (f) f.addEventListener('change', updateClearHistoryPreview); });
function updateClearHistoryPreview() {
    const tf = clearHistoryTimeFilter.value, tyf = clearHistoryTypeFilter.value, mf = clearHistoryMethodFilter.value, sf = clearHistoryStatusFilter.value;
    let cnt = 0, now = Date.now();
    fullHistory.forEach(e => {
        if (tf !== 'all') { const age = (now - new Date(e.timestamp).getTime()) / 3600000; const days = age / 24; if ((tf === '1h' && age > 1) || (tf === '24h' && age > 24) || (tf === '7d' && days > 7) || (tf === '30d' && days > 30) || (tf === '90d' && days > 90)) return; }
        if (tyf !== 'all' && e.type !== tyf) return;
        if (mf !== 'all' && e.method !== mf) return;
        if (sf === 'success' && !e.success) return; if (sf === 'error' && e.success) return;
        cnt++;
    });
    clearHistoryPreview.textContent = cnt;
}
if (applyClearHistoryBtn) applyClearHistoryBtn.addEventListener('click', async () => {
    const f = { timeFilter: clearHistoryTimeFilter.value, typeFilter: clearHistoryTypeFilter.value, methodFilter: clearHistoryMethodFilter.value, statusFilter: clearHistoryStatusFilter.value };
    if (await confirmDialog('Подтвердите удаление', `Удалить ${clearHistoryPreview.textContent} записей?`)) { await window.api.clearHistoryFiltered(f); await loadHistory(); clearHistoryModal.classList.remove('active'); toast('История очищена', 'success'); }
});

// ================== JSON Generator ==================
if (jsonGeneratorBtn) jsonGeneratorBtn.addEventListener('click', () => jsonModal.classList.add('active'));
if (addFieldBtn) addFieldBtn.addEventListener('click', () => { const row = document.createElement('div'); row.className = 'field-row'; const ni = document.createElement('input'); ni.type = 'text'; ni.placeholder = 'Название поля'; ni.className = 'field-name'; ni.style.flex = '1'; const vi = document.createElement('input'); vi.type = 'text'; vi.placeholder = 'Значения через запятую'; vi.className = 'field-values'; vi.style.flex = '2'; const rm = document.createElement('button'); rm.className = 'remove-field-btn'; rm.textContent = '✕'; rm.onclick = () => row.remove(); row.append(ni, vi, rm); fieldsContainer.appendChild(row); });
if (generateJsonBtn) generateJsonBtn.addEventListener('click', () => { const fields = []; fieldsContainer.querySelectorAll('.field-row').forEach(r => { const n = r.querySelector('.field-name').value.trim(); const v = r.querySelector('.field-values').value.trim(); if (n && v) fields.push({ name: n, values: v.split(',').map(s => s.trim()) }); }); if (!fields.length) { toast('Добавьте поля', 'warning'); return; } const lens = fields.map(f => f.values.length); if (new Set(lens).size > 1) { toast('Длины массивов должны совпадать', 'error'); return; } const res = []; for (let i = 0; i < lens[0]; i++) { const o = {}; fields.forEach(f => o[f.name] = f.values[i]); res.push(o); } generatedJsonString = JSON.stringify(res, null, 2); jsonPreview.style.display = 'block'; jsonPreview.textContent = generatedJsonString; saveJsonBtn.style.display = 'inline-block'; });
if (saveJsonBtn) saveJsonBtn.addEventListener('click', async () => { if (!generatedJsonString) return; const r = await window.api.saveFile(generatedJsonString); if (r.success) toast(`Сохранено: ${r.filePath}`, 'success'); });

// ================== cURL Import ==================
function parseCurl(cmd) {
    let c = cmd.replace(/\\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim(); if (!c.startsWith('curl ')) return null; c = c.substring(5);
    const tokens = []; let cur = '', st = 0;
    for (let i = 0; i < c.length; i++) { const ch = c[i]; if (st === 0) { if (ch === ' ') { if (cur) { tokens.push(cur); cur = ''; } } else if (ch === "'") st = 1; else if (ch === '"') st = 2; else if (ch === '\\' && i + 1 < c.length) cur += c[++i]; else cur += ch; } else if (st === 1) { if (ch === "'") { if (i + 1 < c.length && c[i+1] === "'") { cur += "'"; i++; } else st = 0; } else cur += ch; } else if (st === 2) { if (ch === '\\' && i + 1 < c.length) cur += c[++i]; else if (ch === '"') st = 0; else cur += ch; } }
    if (cur) tokens.push(cur);
    const res = { method: 'GET', url: '', headers: {}, body: null, urlEncodedParams: [] };
    const flags = ['-X','--request','-H','--header','-d','--data','--data-raw','--data-binary','--data-ascii','--data-urlencode','-u','--user','-o','--output','-e','--referer'];
    let i = 0;
    while (i < tokens.length) { const t = tokens[i]; if (['--location','-L','--compressed','--silent','-s','--insecure','-k','--show-error'].includes(t)) { i++; continue; } if (t === '-X' || t === '--request') { if (i+1 < tokens.length) res.method = tokens[++i].toUpperCase(); i++; continue; } if (t === '-H' || t === '--header') { if (i+1 < tokens.length) { const h = tokens[++i]; const ci = h.indexOf(':'); if (ci > 0) { const k = h.substring(0, ci).trim(); const v = h.substring(ci+1).trim(); if (k) res.headers[k] = v; } } i++; continue; } if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-ascii') { if (i+1 < tokens.length) { res.body = tokens[++i]; if (!res.headers['Content-Type'] && !res.headers['content-type']) res.headers['Content-Type'] = 'application/x-www-form-urlencoded'; } i++; continue; } if (t === '--data-urlencode') { if (i+1 < tokens.length) { res.urlEncodedParams.push(tokens[++i]); if (!res.headers['Content-Type'] && !res.headers['content-type']) res.headers['Content-Type'] = 'application/x-www-form-urlencoded'; } i++; continue; } if (t === '-u' || t === '--user') { if (i+1 < tokens.length) res.headers['Authorization'] = 'Basic ' + btoa(tokens[++i]); i++; continue; } if (flags.includes(t)) { i += 2; continue; } if (!t.startsWith('-') && !res.url) res.url = t; i++; }
    if (res.urlEncodedParams.length && !res.body) res.body = res.urlEncodedParams.join('&');
    if (res.body && res.method === 'GET') res.method = 'POST';
    return res;
}
function importStepFromCurl(step, idx) { curlInput.value = ''; curlModal.classList.add('active'); window._curlTarget = { step, idx }; }
if (parseCurlBtn) parseCurlBtn.addEventListener('click', () => {
    const txt = curlInput.value.trim(); if (!txt) { toast('Введите cURL', 'warning'); return; }
    const p = parseCurl(txt); if (!p) { toast('Не распознано', 'error'); return; }
    if (window._curlTarget) { const { step } = window._curlTarget; step.url = p.url; step.method = p.method; step.contentType = p.headers['Content-Type'] || step.contentType || 'application/json'; step.auth = p.headers['Authorization'] || step.auth || ''; step.body = p.body || step.body || ''; delete p.headers['Authorization']; delete p.headers['Content-Type']; step.customHeaders = { ...step.customHeaders, ...p.headers }; window._curlTarget = null; saveData(); renderSteps(); curlModal.classList.remove('active'); toast('Шаг обновлён', 'success'); return; }
    const ns = { name: '', url: p.url, method: p.method, contentType: p.headers['Content-Type'] || 'application/json', auth: p.headers['Authorization'] || '', body: p.body || '', customHeaders: {} }; delete p.headers['Authorization']; delete p.headers['Content-Type']; ns.customHeaders = p.headers; activeCollection.steps.push(ns); saveData(); renderSteps(); curlModal.classList.remove('active'); toast('Шаг импортирован', 'success');
});
if (importCurlBtn) importCurlBtn.addEventListener('click', () => { if (!activeCollection) { toast('Выберите коллекцию', 'warning'); return; } curlInput.value = ''; curlModal.classList.add('active'); });

// ================== Global Buttons & Shortcuts ==================
newRootCollectionBtn.addEventListener('click', async () => { const nc = { id: generateUniqueId(), name: 'Новая коллекция', steps: [], folderId: null }; data.collections.push(nc); await saveData(); selectCollection(nc.id); renderTree(); });
newFolderBtn.addEventListener('click', async () => { const n = await showInputModal('Название папки', 'Новая папка'); if (n) { data.folders.push({ id: generateUniqueId(), name: n, parentId: null, collapsed: false }); await saveData(); renderTree(); toast('Папка создана', 'success'); } });
addStepBtn.addEventListener('click', () => { if (!activeCollection) return; activeCollection.steps.push({ name: '', url: '', method: 'GET', contentType: 'application/json', auth: '', body: '', customHeaders: [] }); saveData(); renderSteps(); });
tabBtns.forEach(b => { b.addEventListener('click', () => { tabBtns.forEach(x => x.classList.remove('active')); b.classList.add('active'); runnerTab.style.display = b.dataset.tab === 'runner' ? 'block' : 'none'; historyTab.style.display = b.dataset.tab === 'history' ? 'block' : 'none'; if (b.dataset.tab === 'history') loadHistory(); }); });
function readDataFile() { return new Promise((res, rej) => { const f = dataFileInput.files[0]; if (!f) { rej(new Error('Файл не выбран')); return; } const r = new FileReader(); r.onload = e => { try { const it = JSON.parse(e.target.result); if (!Array.isArray(it)) rej(new Error('Ожидается массив')); else res(it); } catch(err) { rej(new Error('Ошибка JSON: ' + err.message)); } }; r.onerror = () => rej(new Error('Ошибка чтения')); r.readAsText(f); }); }
dataFileInput.addEventListener('change', () => { selectedFileName.textContent = dataFileInput.files.length ? dataFileInput.files[0].name : 'Файл не выбран'; });

// Themes
const themes = ['dark', 'light', 'red-white', 'red-black'];
const themeNames = { dark: 'Тёмная', light: 'Светлая', 'red-white': 'Sakura', 'red-black': 'Cyberpunk' };
const themeIcons = { dark: '🌙', light: '☀️', 'red-white': '🌸', 'red-black': '🔥' };
const themeToggle = document.getElementById('themeToggle');
function applyTheme(t) { document.body.classList.remove('light-theme', 'red-white-theme', 'red-black-theme'); if (t !== 'dark') document.body.classList.add(`${t}-theme`); themeNameEl.textContent = themeNames[t]; themeToggleBtn.textContent = themeIcons[t]; themeToggle.dataset.tooltip = `Тема: ${themeNames[t]}`; localStorage.setItem('ab-runner-theme', t); updateEditorsTheme(); themeToggleBtn.classList.remove('spinning'); void themeToggleBtn.offsetWidth; themeToggleBtn.classList.add('spinning'); setTimeout(() => themeToggleBtn.classList.remove('spinning'), 500); }
applyTheme(localStorage.getItem('ab-runner-theme') || 'dark');
if (themeToggle) themeToggle.addEventListener('click', () => { const cur = localStorage.getItem('ab-runner-theme') || 'dark'; applyTheme(themes[(themes.indexOf(cur) + 1) % themes.length]); });

// Data
async function loadData() { 
    try {
        data = await window.api.getData(); 
        if (!data.folders) data.folders = []; 
        if (!data.collections) data.collections = []; 
        if (!data.environments) data.environments = []; 
        data.folders.forEach(f => { if (f.parentId === undefined) f.parentId = null; if (f.collapsed === undefined) f.collapsed = false; }); 
        data.collections.forEach(c => { if (c.folderId === undefined) c.folderId = null; if (!c.steps) c.steps = []; }); 
        console.log('✅ Данные загружены:', {
            folders: data.folders.length,
            collections: data.collections.length,
            environments: data.environments.length
        });
        renderTree(); 
        updateEnvironmentSelector(); 
        updateHistoryFilter(); 
        renderRightPanel(); 
    } catch (e) {
        console.error('❌ Ошибка загрузки данных:', e);
        data = { folders: [], collections: [], environments: [] };
        toast('Ошибка загрузки данных', 'error');
    }
}
async function saveData() { 
    console.log('💾 Сохранение данных:', {
        folders: data.folders?.length,
        collections: data.collections?.length,
        environments: data.environments?.length
    });
    
    if (!data.environments) {
        console.error('⚠️ ВНИМАНИЕ: data.environments отсутствует!');
        data.environments = [];
    }
    
    await window.api.saveData(data); 
}

// Shortcuts
document.addEventListener('keydown', async e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); await saveData(); toast('Сохранено', 'success', 1500); }
    if (e.key === 'Escape') { document.querySelectorAll('.modal.active').forEach(m => { m.classList.remove('active'); m.style.zIndex = ''; }); currentStepForSend = null; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && sendRequestModal.classList.contains('active')) sendSingleBtn.click();
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); newRootCollectionBtn.click(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
});
document.addEventListener('click', e => { if (!e.target.closest('.method-dropdown') && !e.target.closest('.import-dropdown')) { document.querySelectorAll('.method-dropdown.open').forEach(d => d.classList.remove('open')); } });
window.addEventListener('beforeunload', () => { if (activeCollectionId) cleanupEmptyCollection(activeCollectionId); });

// Global Buttons
const gJson = document.getElementById('globalJsonGeneratorBtn'); const eNew = document.getElementById('emptyStateNewCollectionBtn'); const eJson = document.getElementById('emptyStateJsonGeneratorBtn'); const ePost = document.getElementById('emptyStateImportPostmanBtn');
if (gJson) gJson.addEventListener('click', () => jsonModal.classList.add('active'));
if (eNew) eNew.addEventListener('click', () => newRootCollectionBtn.click());
if (eJson) eJson.addEventListener('click', () => jsonModal.classList.add('active'));
if (ePost) ePost.addEventListener('click', async () => {
    const files = await window.api.openPostmanDialog();
    if (files && files.length > 0) await processPostmanFiles(files);
});

// Z-Index Observer
const zIndexObs = new MutationObserver(mutations => { mutations.forEach(m => { if (m.type === 'attributes' && m.attributeName === 'class') { const el = m.target; if (el.classList.contains('modal') && el.classList.contains('active')) { let maxZ = 1000; document.querySelectorAll('.modal.active').forEach(mm => { if (mm !== el) { const z = parseInt(window.getComputedStyle(mm).zIndex) || 1000; if (z > maxZ) maxZ = z; } }); el.style.zIndex = maxZ + 10; } } }); });
document.querySelectorAll('.modal').forEach(m => zIndexObs.observe(m, { attributes: true, attributeFilter: ['class'] }));
const bodyObs = new MutationObserver(mutations => { mutations.forEach(m => { m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.classList && n.classList.contains('modal')) zIndexObs.observe(n, { attributes: true, attributeFilter: ['class'] }); }); }); });
bodyObs.observe(document.body, { childList: true });

// Init
loadData(); showEmptyState();