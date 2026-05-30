// renderer.js – полная рабочая версия с поддержкой {{env}} и {data}
let data = { folders: [], collections: [], environments: [] };
let activeCollectionId = null;
let activeCollection = null;
let searchQuery = '';

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

// Environment Manager Elements
const environmentSelect = document.getElementById('environmentSelect');
const manageEnvBtnGlobal = document.getElementById('manageEnvBtnGlobal'); // Кнопка шестеренки
const envManagerModal = document.getElementById('envManagerModal');
const envListContainer = document.getElementById('envListContainer');
const newEnvNameInput = document.getElementById('newEnvNameInput');
const createEnvBtn = document.getElementById('createEnvBtn');
const closeEnvManagerBtn = document.getElementById('closeEnvManagerBtn');

let currentStepForSend = null;
let fullHistory = [];
let sidebarWidth = 260;

// ================== CodeMirror 5 ==================
const activeEditors = new Map();

function createCodeMirrorEditor(textarea, initialValue = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-wrapper';
    if (typeof CodeMirror === 'undefined') {
        console.warn('CodeMirror не загружен');
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
        extraKeys: {
            'Ctrl-/': 'toggleComment',
            'Cmd-/': 'toggleComment',
            'Ctrl-F': 'findPersistent',
            'Cmd-F': 'findPersistent',
        },
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
            if (wrapper && wrapper.parentNode) {
                wrapper.parentNode.removeChild(wrapper);
            }
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

// ================== Форматирование JSON ==================
function formatJSON(text) {
    if (!text || !text.trim()) return '';
    let result = '';
    let indent = 0;
    const indentStr = '  ';

    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;
    let inWord = false;

    const addNewline = () => {
        result += '\n' + indentStr.repeat(indent);
        inWord = false;
    };

    const addChar = (c) => { result += c; };
    const isWordChar = (c) => /[a-zA-Z0-9_]/.test(c);
    const endsWithWhitespace = () => !result || /[\s]$/.test(result);
    const trimTrailingWhitespace = () => {
        result = result.replace(/[ \t]*\n([ \t]*\n)*/g, '\n').replace(/[ \t]+$/, '');
    };

    let i = 0;
    while (i < text.length) {
        const c = text[i];
        const next = text[i + 1];

        if (inLineComment) {
            addChar(c);
            if (c === '\n') {
                inLineComment = false;
                result += indentStr.repeat(indent);
            }
            i++;
            continue;
        }

        if (inBlockComment) {
            addChar(c);
            if (c === '*' && next === '/') {
                addChar('/');
                inBlockComment = false;
                i += 2;
            } else {
                i++;
            }
            continue;
        }

        if (inString) {
            addChar(c);
            if (c === '\\' && i + 1 < text.length) {
                addChar(text[i + 1]);
                i += 2;
                continue;
            }
            if (c === stringChar) {
                inString = false;
                inWord = false;
            }
            i++;
            continue;
        }

        if (/\s/.test(c)) {
            if (inWord) inWord = false;
            i++;
            continue;
        }

        if ((c === '"' || c === "'") && !inString) {
            if (!endsWithWhitespace() && !inWord && result && !/[{:,\[]$/.test(result)) {
                result += ' ';
            }
            addChar(c);
            inString = true;
            stringChar = c;
            inWord = false;
            i++;
            continue;
        }

        if (c === '/' && next === '/') {
            if (result && !result.endsWith('\n') && !/\s$/.test(result)) result += ' ';
            addChar('/'); addChar('/');
            inLineComment = true; inWord = false; i += 2; continue;
        }
        if (c === '/' && next === '*') {
            if (result && !result.endsWith('\n') && !/\s$/.test(result)) result += ' ';
            addChar('/'); addChar('*');
            inBlockComment = true; inWord = false; i += 2; continue;
        }

        if (c === '{' || c === '[') {
            if (inWord) { result += ' '; inWord = false; }
            addChar(c);
            indent++;
            let j = i + 1;
            let hasContent = false;
            while (j < text.length) {
                const ch = text[j];
                if (/\s/.test(ch)) { j++; continue; }
                if ((ch === '}' && c === '{') || (ch === ']' && c === '[')) break;
                if (ch === '/' && (text[j + 1] === '/' || text[j + 1] === '*')) {
                    j += (text[j + 1] === '*' ? 2 : 2);
                    while (j < text.length) {
                        if (text[j] === '/' && text[j - 1] === '/') break;
                        if (text[j] === '*' && text[j + 1] === '/') { j++; break; }
                        j++;
                    }
                    continue;
                }
                hasContent = true;
                break;
            }
            if (hasContent) addNewline();
            inWord = false; i++; continue;
        }

        if (c === '}' || c === ']') {
            indent--;
            if (inWord) inWord = false;
            const trimmed = result.trimEnd();
            const lastChar = trimmed[trimmed.length - 1];
            if (lastChar !== '{' && lastChar !== '[') {
                trimTrailingWhitespace();
                addNewline();
            } else {
                trimTrailingWhitespace();
            }
            addChar(c); i++; continue;
        }

        if (c === ',') {
            if (inWord) inWord = false;
            addChar(c);
            let j = i + 1;
            while (j < text.length) {
                const ch = text[j];
                if (/\s/.test(ch)) { j++; continue; }
                if (ch === '/' && (text[j + 1] === '/' || text[j + 1] === '*')) {
                    j += 2; while (j < text.length && text[j] !== '\n') j++; continue;
                }
                break;
            }
            if (text[j] !== '}' && text[j] !== ']') addNewline();
            inWord = false; i++; continue;
        }

        if (c === ':') {
            if (inWord) inWord = false;
            result = result.replace(/[\s]+$/, '');
            addChar(c); result += ' ';
            inWord = false; i++; continue;
        }

        if (isWordChar(c)) {
            if (!inWord && !endsWithWhitespace() && result && !/[{:,\[]$/.test(result)) result += ' ';
            addChar(c); inWord = true; i++; continue;
        }

        if (inWord) inWord = false;
        if (!endsWithWhitespace() && result && !/[{:,\[]$/.test(result)) result += ' ';
        addChar(c); i++;
    }
    return result.trim();
}

function formatCurrentEditor(editorId) {
    const editorInfo = activeEditors.get(editorId);
    if (!editorInfo || !editorInfo.editor) { toast('Редактор не найден', 'error'); return; }
    const text = editorInfo.editor.getValue();
    if (!text.trim()) { toast('Нечего форматировать', 'warning'); return; }
    try {
        const formatted = formatJSON(text);
        editorInfo.editor.setValue(formatted);
        toast('JSON отформатирован', 'success');
    } catch (e) { toast('Ошибка форматирования: ' + e.message, 'error'); }
}

// ================== УТИЛИТЫ ==================
function escapeHtml(t) {
    if (typeof t !== 'string') return t == null ? '' : String(t);
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function txt(tag, text, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
}

function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function toast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, duration);
}

function confirmDialog(title, message) {
    return new Promise(resolve => {
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.innerHTML = `
            <div class="confirm-dialog-content">
                <h3></h3>
                <p></p>
                <div class="confirm-dialog-actions">
                    <button class="secondary cancel-btn">Отмена</button>
                    <button class="danger ok-btn">OK</button>
                </div>
            </div>`;
        dialog.querySelector('h3').textContent = title;
        dialog.querySelector('p').textContent = message;
        document.body.appendChild(dialog);

        const cleanup = (result) => {
            dialog.classList.remove('show');
            setTimeout(() => dialog.remove(), 200);
            resolve(result);
        };
        dialog.querySelector('.ok-btn').onclick = () => cleanup(true);
        dialog.querySelector('.cancel-btn').onclick = () => cleanup(false);
        dialog.onclick = (e) => { if (e.target === dialog) cleanup(false); };
        requestAnimationFrame(() => dialog.classList.add('show'));
    });
}

const debouncedSave = debounce(async () => {
    try { await saveData(); } catch (e) { toast('Ошибка сохранения: ' + e.message, 'error'); }
}, 500);

// ================== Sidebar ==================
let isResizing = false, startX, startWidth;
resizer.addEventListener('mousedown', e => {
    if (sidebar.style.display === 'none') return;
    isResizing = true; startX = e.clientX; startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const newWidth = Math.max(200, Math.min(Math.floor(window.innerWidth * 0.4), startWidth + (e.clientX - startX)));
    sidebar.style.width = newWidth + 'px'; sidebarWidth = newWidth;
});
document.addEventListener('mouseup', () => {
    if (isResizing) { isResizing = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; }
});
toggleSidebarBtn.addEventListener('click', () => {
    if (sidebar.style.display === 'none') {
        sidebar.style.display = ''; resizer.classList.remove('hidden'); sidebar.style.width = sidebarWidth + 'px';
        sidebarToggleBtn.style.display = 'none'; toggleSidebarBtn.textContent = 'Скрыть панель'; toggleSidebarBtn.classList.remove('show');
    } else {
        sidebar.style.display = 'none'; resizer.classList.add('hidden'); sidebarToggleBtn.style.display = 'block';
        toggleSidebarBtn.textContent = 'Показать панель'; toggleSidebarBtn.classList.add('show');
    }
});
sidebarToggleBtn.addEventListener('click', () => {
    sidebar.style.display = ''; resizer.classList.remove('hidden'); sidebar.style.width = sidebarWidth + 'px';
    sidebarToggleBtn.style.display = 'none'; toggleSidebarBtn.textContent = '☰ Скрыть панель';
});

// ================== Закрытие модалок ==================
function setupModalOverlayClose() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.classList.remove('active');
                if (modal === inputModal) inputModalCancelBtn.click();
                if (modal === sendRequestModal) currentStepForSend = null;
                if (modal === envManagerModal) envManagerModal.classList.remove('active');
            }
        });
    });
}
document.addEventListener('DOMContentLoaded', setupModalOverlayClose);
closeDetailModalBtn.addEventListener('click', () => detailModal.classList.remove('active'));
closeSendModalBtn.addEventListener('click', () => { sendRequestModal.classList.remove('active'); currentStepForSend = null; });
if (closeEnvManagerBtn) closeEnvManagerBtn.addEventListener('click', () => envManagerModal.classList.remove('active'));

// ================== Поиск ==================
function getTrigrams(s) {
    const str = '  ' + s.toLowerCase() + ' '; const t = [];
    for (let i = 0; i < str.length - 2; i++) t.push(str.substring(i, i + 3));
    return t;
}
function trigramSimilarity(a, b) {
    if (!a || !b) return 0;
    const ta = getTrigrams(a), tb = getTrigrams(b);
    if (!ta.length || !tb.length) return 0;
    const sa = new Set(ta); let intersect = 0;
    for (const x of tb) if (sa.has(x)) intersect++;
    return intersect / (ta.length + tb.length - intersect);
}
function getSearchText(col) {
    const p = [col.name || ''];
    if (col.steps) col.steps.forEach(s => p.push(s.name || '', s.method || '', s.url || ''));
    return p.join(' ').toLowerCase();
}
function collectionRelevance(col, q) {
    const target = getSearchText(col);
    if (!q) return 1;
    if (target.includes(q)) return 1 + q.length / target.length;
    return trigramSimilarity(q, target);
}
const SEARCH_THRESHOLD = 0.15;
function matchesCollection(col) { if (!searchQuery) return true; return collectionRelevance(col, searchQuery) > SEARCH_THRESHOLD; }
searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLowerCase(); renderTree(); });

// ================== Окружения (Environments) ==================
function getActiveEnvironment() {
    if (!data.activeEnvironmentId || !data.environments) return {};
    const env = data.environments.find(e => e.id === data.activeEnvironmentId);
    if (!env) return {};
    const result = {};
    env.variables.forEach(v => { if (v.enabled !== false && v.key) result[v.key] = v.value; });
    return result;
}

function updateEnvironmentSelector() {
    if (!data.environments) data.environments = [];
    environmentSelect.innerHTML = '<option value="">No Environment</option>';
    data.environments.forEach(env => {
        const opt = document.createElement('option'); opt.value = env.id; opt.textContent = env.name; environmentSelect.appendChild(opt);
    });
    if (data.activeEnvironmentId && data.environments.some(e => e.id === data.activeEnvironmentId)) environmentSelect.value = data.activeEnvironmentId;
}

environmentSelect.addEventListener('change', () => {
    data.activeEnvironmentId = environmentSelect.value || null; saveData();
    toast(`Окружение: ${environmentSelect.options[environmentSelect.selectedIndex].text}`, 'info', 1500);
});

// Менеджер окружений
if (manageEnvBtnGlobal) {
    manageEnvBtnGlobal.addEventListener('click', () => {
        renderEnvList();
        envManagerModal.classList.add('active');
    });
}

if (createEnvBtn) {
    createEnvBtn.addEventListener('click', () => {
        const name = newEnvNameInput.value.trim();
        if (!name) { toast('Введите название', 'warning'); return; }

        const newEnv = {
            id: generateUniqueId(),
            name: name,
            variables: [{ key: '', value: '', enabled: true }]
        };

        if (!data.environments) data.environments = [];
        data.environments.push(newEnv);
        saveData().then(() => {
            newEnvNameInput.value = '';
            renderEnvList();
            updateEnvironmentSelector();
            toast('Окружение создано', 'success');
        });
    });
}

function renderEnvList() {
    if (!envListContainer) return;
    envListContainer.innerHTML = '';
    const envs = data.environments || [];

    if (envs.length === 0) {
        envListContainer.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">Нет сохраненных окружений</div>';
        return;
    }

    envs.forEach(env => {
        const div = document.createElement('div');
        div.className = 'env-manager-item';

        const header = document.createElement('div');
        header.className = 'env-manager-header';

        const title = document.createElement('span');
        title.textContent = env.name;
        title.style.fontWeight = '600';

        const actions = document.createElement('div');

        const editBtn = document.createElement('button');
        editBtn.className = 'secondary';
        editBtn.style.fontSize = '12px';
        editBtn.style.padding = '4px 8px';
        editBtn.textContent = 'Переменные';
        editBtn.onclick = () => editEnvVariables(env.id);

        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.style.fontSize = '12px';
        delBtn.style.padding = '4px 8px';
        delBtn.textContent = 'Удалить';
        delBtn.onclick = async () => {
            if (await confirmDialog('Удалить окружение', `Удалить "${env.name}"?`)) {
                data.environments = data.environments.filter(e => e.id !== env.id);
                if (data.activeEnvironmentId === env.id) {
                    data.activeEnvironmentId = null;
                    environmentSelect.value = '';
                }
                saveData().then(() => {
                    renderEnvList();
                    updateEnvironmentSelector();
                });
            }
        };

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        header.appendChild(title);
        header.appendChild(actions);
        div.appendChild(header);
        envListContainer.appendChild(div);
    });
}

function editEnvVariables(envId) {
    const env = data.environments.find(e => e.id === envId);
    if (!env) return;

    showInputModal(`Редактировать: ${env.name}`, JSON.stringify(env.variables, null, 2)).then(res => {
        if (res) {
            try {
                const newVars = JSON.parse(res);
                if (Array.isArray(newVars)) {
                    env.variables = newVars;
                    saveData().then(() => toast('Переменные обновлены', 'success'));
                } else {
                    toast('JSON должен быть массивом объектов', 'error');
                }
            } catch (e) {
                toast('Ошибка JSON: ' + e.message, 'error');
            }
        }
    });
}

// ================== Замена плейсхолдеров (v2: {{env}} и {data}) ==================
function replacePlaceholders(template, item, environment = {}, options = {}) {
    if (!template || typeof template !== 'string') return template;

    const cleaned = cleanString(template);
    const { toJson = false } = options;
    const env = environment && typeof environment === 'object' ? environment : {};
    const dataItem = item && typeof item === 'object' ? item : {};

    // 1. Сначала заменяем {{variable}} из Environment
    let result = cleaned.replace(/\{\{([^{}]+)\}\}/g, (match, key) => {
        const k = key.trim();
        if (k in env) {
            const v = env[k];
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return toJson ? JSON.stringify(v) : String(v);
            return String(v);
        }
        return match; // Если не нашли в окружении, оставляем как есть
    });

    // 2. Затем заменяем {variable} из Data Item (JSON файла)
    // Используем негативный lookahead (?!\}), чтобы не задеть {{
    result = result.replace(/\{([^{}]+)\}(?!\})/g, (match, pathStr) => {
        const keys = pathStr.split('.');
        let value = dataItem;
        let found = true;

        for (const key of keys) {
            if (value === null || value === undefined || typeof value !== 'object') {
                found = false; break;
            }
            if (key in value) {
                value = value[key];
            } else {
                found = false; break;
            }
        }

        if (found && value !== undefined) {
            if (value === null) return '';
            if (typeof value === 'object') return toJson ? JSON.stringify(value) : String(value);
            return String(value);
        }
        return match;
    });

    return result;
}

// ================== Импорт Postman (С поддержкой структуры папок) ==================
async function handlePostmanImport() {
    const files = await window.api.openPostmanDialog();
    if (!files || files.length === 0) return;

    let collectionsCreated = 0;
    let foldersCreated = 0;

    files.forEach(fileObj => {
        if (!fileObj || !fileObj.data) return;

        let json = fileObj.data;

        // Очистка ключей от пробелов (фикс для битых экспортов)
        const cleanKeys = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            const newObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    const cleanKey = key.trim();
                    newObj[cleanKey] = cleanKeys(obj[key]);
                }
            }
            return newObj;
        };

        if (Object.keys(json).some(k => k !== k.trim())) {
            json = cleanKeys(json);
        }

        // Определяем тип файла
        if (json.info && json.info.schema && json.item) {
            // Это коллекция. Создаем корневую папку с именем коллекции
            const rootFolderName = json.info.name || 'Imported Collection';

            // Проверяем, нет ли уже такой папки
            let existingFolder = data.folders.find(f => f.name === rootFolderName && f.parentId === null);

            let rootFolderId;
            if (existingFolder) {
                rootFolderId = existingFolder.id;
            } else {
                const newFolder = {
                    id: generateUniqueId(),
                    name: rootFolderName,
                    parentId: null,
                    collapsed: true // По умолчанию закрыта
                };
                data.folders.push(newFolder);
                rootFolderId = newFolder.id;
                foldersCreated++;
            }

            // Запускаем рекурсивный импорт элементов внутрь этой папки
            parsePostmanItems(json.item, rootFolderId);
            collectionsCreated += countCollectionsInItems(json.item);

            // Импортируем переменные коллекции как окружение
            if (json.variable && json.variable.length > 0) {
                const envName = `${rootFolderName} (Env)`;
                if (!data.environments.some(e => e.name === envName)) {
                    data.environments.push({
                        id: generateUniqueId(),
                        name: envName,
                        variables: json.variable.map(v => ({ key: v.key, value: v.value, enabled: true }))
                    });
                }
            }

        } else if (json.values && json.name) {
            // Это окружение
            const env = {
                id: generateUniqueId(),
                name: json.name || 'Postman Environment',
                variables: []
            };
            if (Array.isArray(json.values)) {
                env.variables = json.values.map(v => ({ key: v.key, value: v.value, enabled: v.enabled !== false }));
            }
            data.environments.push(env);
            toast(`Окружение "${env.name}" импортировано`, 'success');
        } else {
            toast(`Файл "${fileObj.fileName}" имеет неподдерживаемый формат`, 'error');
        }
    });

    saveData();
    renderTree();
    updateEnvironmentSelector();

    if (collectionsCreated > 0 || foldersCreated > 0) {
        toast(`Импорт завершен: ${foldersCreated} папок, ${collectionsCreated} коллекций`, 'success');
    }
}

// Рекурсивная функция для разбора items (папок и запросов)
function parsePostmanItems(items, parentFolderId) {
    if (!Array.isArray(items)) return;

    items.forEach(item => {
        // Если у элемента есть свойство 'item', значит это ПАПКА в Postman
        if (item.item && Array.isArray(item.item)) {
            const folderName = item.name || 'Untitled Folder';

            // Создаем новую папку в AB Runner
            const newFolder = {
                id: generateUniqueId(),
                name: folderName,
                parentId: parentFolderId,
                collapsed: true // Вложенные папки тоже закрыты
            };
            data.folders.push(newFolder);

            // Рекурсивно обрабатываем содержимое этой папки
            parsePostmanItems(item.item, newFolder.id);
        }
        // Если у элемента есть 'request', значит это ЗАПРОС
        else if (item.request) {
            const req = item.request;
            const step = {
                name: item.name || '',
                method: (typeof req.method === 'string' ? req.method : 'GET').toUpperCase(),
                url: '',
                auth: '',
                body: '',
                contentType: 'application/json',
                customHeaders: []
            };

            // Парсинг URL
            if (typeof req.url === 'string') {
                step.url = req.url;
            } else if (req.url && req.url.raw) {
                step.url = req.url.raw;
            }

            // Парсинг заголовков
            if (Array.isArray(req.header)) {
                req.header.forEach(h => {
                    if (h.disabled) return;
                    const keyLower = h.key.toLowerCase();
                    if (keyLower === 'authorization') {
                        step.auth = h.value;
                    } else if (keyLower === 'content-type') {
                        step.contentType = h.value;
                    } else {
                        step.customHeaders.push({ key: h.key, value: h.value, enabled: true });
                    }
                });
            }

            // Парсинг тела запроса
            if (req.body) {
                if (req.body.mode === 'raw' && req.body.raw) {
                    step.body = req.body.raw;
                } else if (req.body.mode === 'urlencoded' && Array.isArray(req.body.urlencoded)) {
                    const obj = {};
                    req.body.urlencoded.forEach(u => {
                        if (!u.disabled) obj[u.key] = u.value;
                    });
                    step.body = JSON.stringify(obj, null, 2);
                } else if (req.body.mode === 'formdata' && Array.isArray(req.body.formdata)) {
                    // Упрощенная обработка formdata как JSON объекта
                    const obj = {};
                    req.body.formdata.forEach(u => {
                        if (!u.disabled && u.type === 'text') obj[u.key] = u.value;
                    });
                    step.body = JSON.stringify(obj, null, 2);
                }
            }

            // Создаем коллекцию AB Runner для этого запроса
            const newCollection = {
                id: generateUniqueId(),
                name: step.name || 'Untitled Request',
                steps: [step], // Кладем запрос как единственный шаг
                folderId: parentFolderId
            };
            data.collections.push(newCollection);
        }
    });
}

// Вспомогательная функция для подсчета количества запросов (для тоста)
function countCollectionsInItems(items) {
    let count = 0;
    if (!Array.isArray(items)) return 0;
    items.forEach(item => {
        if (item.item) {
            count += countCollectionsInItems(item.item);
        } else if (item.request) {
            count++;
        }
    });
    return count;
}

// ================== Кастомные модалки ==================
function showInputModal(title, def) {
    return new Promise(resolve => {
        inputModalTitle.textContent = title; inputModalField.value = def || '';
        const oldSel = inputModal.querySelector('.temp-select'); if (oldSel) oldSel.remove();
        inputModalField.style.display = 'block'; inputModal.classList.add('active'); inputModalField.focus();
        const cleanup = () => {
            inputModal.classList.remove('active');
            inputModalOkBtn.removeEventListener('click', onOk); inputModalCancelBtn.removeEventListener('click', onCancel); inputModalField.removeEventListener('keydown', onKey);
        };
        const onOk = () => { cleanup(); resolve(inputModalField.value.trim()); };
        const onCancel = () => { cleanup(); resolve(null); };
        const onKey = e => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); };
        inputModalOkBtn.addEventListener('click', onOk); inputModalCancelBtn.addEventListener('click', onCancel); inputModalField.addEventListener('keydown', onKey);
    });
}

// ================== Темы ==================
const themes = ['dark', 'light', 'red-white', 'red-black'];
const themeNames = { dark: 'Тёмная', light: 'Светлая', 'red-white': 'Sakura', 'red-black': 'Cyberpunk' };
const themeIcons = { dark: '🌙', light: '☀️', 'red-white': '🌸', 'red-black': '🔥' };
const themeToggle = document.getElementById('themeToggle');
const themeIconBtn = document.getElementById('themeToggleBtn');

function applyTheme(t) {
    document.body.classList.remove('light-theme', 'red-white-theme', 'red-black-theme');
    if (t !== 'dark') document.body.classList.add(`${t}-theme`);
    themeNameEl.textContent = themeNames[t]; themeIconBtn.textContent = themeIcons[t];
    themeToggle.dataset.tooltip = `Тема: ${themeNames[t]}. Кликните для смены`;
    localStorage.setItem('ab-runner-theme', t); updateEditorsTheme();
    themeIconBtn.classList.remove('spinning'); void themeIconBtn.offsetWidth; themeIconBtn.classList.add('spinning');
    setTimeout(() => themeIconBtn.classList.remove('spinning'), 500);
}
applyTheme(localStorage.getItem('ab-runner-theme') || 'dark');
themeToggle.addEventListener('click', () => {
    const cur = localStorage.getItem('ab-runner-theme') || 'dark';
    applyTheme(themes[(themes.indexOf(cur) + 1) % themes.length]);
});

// ================== Данные ==================
async function loadData() {
    data = await window.api.getData();
    if (!data.folders) data.folders = []; if (!data.collections) data.collections = []; if (!data.environments) data.environments = [];
    data.folders.forEach(f => { if (f.parentId === undefined) f.parentId = null; if (f.collapsed === undefined) f.collapsed = false; });
    data.collections.forEach(c => { if (c.folderId === undefined) c.folderId = null; });
    renderTree(); updateEnvironmentSelector(); updateHistoryFilter();
}
async function saveData() { await window.api.saveData(data); }

function getCollectionIcon(col) { if (!col.steps || col.steps.length === 0) return ''; return '📄'; }
function getCollectionMethodBadge(col) {
    if (!col.steps || col.steps.length === 0) return null;
    const methods = [...new Set(col.steps.map(s => s.method).filter(Boolean))];
    return methods.length === 1 ? methods[0] : (methods.length > 1 ? 'MIX' : null);
}
function generateUniqueId() {
    let id = Date.now().toString();
    while (data.collections.some(c => c.id === id) || data.folders.some(f => f.id === id)) {
        id = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 7);
    }
    return id;
}

// ================== Рендер дерева ==================
function renderFolderChildren(folderId, container, level) {
    const folders = data.folders || [];
    const collections = data.collections || [];
    const childFolders = folders.filter(f => f.parentId === folderId);

    childFolders.forEach(folder => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder-item' + (folder.collapsed ? ' collapsed' : '');
        folderDiv.dataset.folderId = folder.id; folderDiv.draggable = true; folderDiv.style.paddingLeft = (level * 16) + 'px';
        const nameSpan = txt('span', '📁 ' + (folder.name || 'Без названия'), 'folder-name');
        const actionsDiv = document.createElement('div'); actionsDiv.className = 'folder-actions';
        const addColBtn = document.createElement('button'); addColBtn.className = 'folder-add-collection-btn'; addColBtn.title = 'Создать коллекцию в этой папке'; addColBtn.textContent = '+';
        const delBtn = document.createElement('button'); delBtn.className = 'delete-folder-btn'; delBtn.textContent = '✕';
        actionsDiv.appendChild(addColBtn); actionsDiv.appendChild(delBtn);
        folderDiv.appendChild(nameSpan); folderDiv.appendChild(actionsDiv);
        const childContainer = document.createElement('div'); childContainer.className = 'folder-children' + (folder.collapsed ? ' collapsed' : ''); childContainer.dataset.folderId = folder.id;
        container.appendChild(folderDiv); container.appendChild(childContainer);
        renderFolderContents(folder.id, childContainer, level + 1);

        folderDiv.addEventListener('click', e => {
            if (e.target.classList.contains('delete-folder-btn') || e.target.classList.contains('folder-add-collection-btn')) return;
            folder.collapsed = !folder.collapsed; saveData().then(() => renderTree());
        });
        folderDiv.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'folder:' + folder.id); e.dataTransfer.effectAllowed = 'move'; folderDiv.classList.add('dragging'); });
        folderDiv.addEventListener('dragend', () => folderDiv.classList.remove('dragging'));
        folderDiv.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); if (!e.dataTransfer.types.includes('text/plain')) return; folderDiv.classList.add('drag-over'); e.dataTransfer.dropEffect = 'move'; });
        folderDiv.addEventListener('dragleave', e => { if (!folderDiv.contains(e.relatedTarget)) folderDiv.classList.remove('drag-over'); });
        folderDiv.addEventListener('drop', e => {
            e.preventDefault(); e.stopPropagation(); folderDiv.classList.remove('drag-over');
            const transferData = e.dataTransfer.getData('text/plain');
            if (transferData === 'folder:' + folder.id) return;
            handleDropOnFolder(transferData, folder.id);
        });
        childContainer.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); if (!e.dataTransfer.types.includes('text/plain')) return; childContainer.classList.add('drag-over'); folderDiv.classList.add('drag-over'); e.dataTransfer.dropEffect = 'move'; });
        childContainer.addEventListener('dragleave', e => { if (!childContainer.contains(e.relatedTarget)) { childContainer.classList.remove('drag-over'); folderDiv.classList.remove('drag-over'); } });
        childContainer.addEventListener('drop', e => {
            e.preventDefault(); e.stopPropagation(); childContainer.classList.remove('drag-over'); folderDiv.classList.remove('drag-over');
            const transferData = e.dataTransfer.getData('text/plain'); if (transferData === 'folder:' + folder.id) return; handleDropOnFolder(transferData, folder.id);
        });

        // Удаление папки с содержимым
        delBtn.addEventListener('click', async e => {
            e.stopPropagation();
            if (await confirmDialog('Удалить папку', `Удалить папку "${folder.name}" и ВСЕ коллекции внутри неё? Это действие нельзя отменить.`)) {

                // 1. Рекурсивно собираем ID всех вложенных папок
                const foldersToDelete = [];
                const collectFolders = (parentId) => {
                    data.folders.filter(f => f.parentId === parentId).forEach(f => {
                        foldersToDelete.push(f.id);
                        collectFolders(f.id); // Рекурсия
                    });
                };
                collectFolders(folder.id);

                // 2. Удаляем все коллекции, которые лежат в этой папке или во вложенных
                const idsToRemove = [folder.id, ...foldersToDelete];
                data.collections = data.collections.filter(c => !idsToRemove.includes(c.folderId));

                // 3. Удаляем сами папки (и текущую, и вложенные)
                data.folders = data.folders.filter(f => !idsToRemove.includes(f.id));

                // 4. Если удалили активную коллекцию, сбрасываем вид
                if (activeCollectionId && !data.collections.find(c => c.id === activeCollectionId)) {
                    activeCollectionId = null;
                    activeCollection = null;
                    showEmptyState();
                }

                await saveData();
                renderTree();
                toast('Папка и её содержимое удалены', 'success');
            }
        });

        addColBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); const newCol = { id: generateUniqueId(), name: 'Новая коллекция', steps: [], folderId: folder.id };
            data.collections.push(newCol); await saveData(); selectCollection(newCol.id); renderTree();
        });
    });

    collections.filter(c => c.folderId === folderId && matchesCollection(c)).forEach(col => renderCollectionItem(col, container, level + 1));
}
function handleDropOnFolder(transferData, targetFolderId) {
    if (!transferData) return;
    if (transferData.startsWith('col:')) moveCollectionToFolder(transferData.substring(4), targetFolderId);
    else if (transferData.startsWith('folder:')) {
        const folderIdToMove = transferData.substring(7);
        if (folderIdToMove !== targetFolderId && !isDescendant(targetFolderId, folderIdToMove)) moveFolderToFolder(folderIdToMove, targetFolderId);
    }
}
function isDescendant(folderId, ancestorId) {
    const folder = data.folders.find(f => f.id === folderId);
    if (!folder) return false; if (folder.parentId === ancestorId) return true; if (!folder.parentId) return false;
    return isDescendant(folder.parentId, ancestorId);
}
function renderFolderContents(folderId, container, level) { renderFolderChildren(folderId, container, level); }
let treeContainerListenersAdded = false;
function renderTree() {
    treeContainer.innerHTML = ''; renderFolderChildren(null, treeContainer, 0);
    if (!treeContainerListenersAdded) {
        treeContainerListenersAdded = true;
        treeContainer.addEventListener('dragover', e => { e.preventDefault(); treeContainer.classList.add('drag-over-root'); e.dataTransfer.dropEffect = 'move'; });
        treeContainer.addEventListener('dragleave', e => { if (!treeContainer.contains(e.relatedTarget)) treeContainer.classList.remove('drag-over-root'); });
        treeContainer.addEventListener('drop', e => {
            if (e.target === treeContainer) {
                e.preventDefault(); treeContainer.classList.remove('drag-over-root');
                const transferData = e.dataTransfer.getData('text/plain');
                if (transferData.startsWith('col:')) moveCollectionToFolder(transferData.substring(4), null);
                else if (transferData.startsWith('folder:')) moveFolderToFolder(transferData.substring(7), null);
            }
        });
    }
}
function renderCollectionItem(col, container, indentLevel = 0) {
    const div = document.createElement('div'); div.className = `collection-item${activeCollectionId === col.id ? ' active' : ''}`; div.dataset.collectionId = col.id; div.draggable = true; div.style.paddingLeft = (indentLevel * 16) + 'px';
    const nameSpan = document.createElement('span'); nameSpan.className = 'collection-name'; nameSpan.title = 'Двойной клик для переименования';
    const methodBadge = getCollectionMethodBadge(col);
    if (methodBadge) {
        const badge = document.createElement('span'); badge.className = 'method-badge'; badge.dataset.method = methodBadge === 'MIX' ? '' : methodBadge; badge.textContent = methodBadge;
        nameSpan.appendChild(badge); nameSpan.appendChild(document.createTextNode(' '));
    }
    const icon = getCollectionIcon(col); if (icon) nameSpan.appendChild(document.createTextNode(icon + ' '));
    nameSpan.appendChild(document.createTextNode(col.name || 'Без названия'));
    const delBtn = document.createElement('button'); delBtn.className = 'delete-collection-btn'; delBtn.textContent = '✕';
    div.appendChild(nameSpan); div.appendChild(delBtn);
    div.addEventListener('click', e => { if (e.target.classList.contains('delete-collection-btn')) return; selectCollection(col.id); });
    delBtn.addEventListener('click', async e => {
        e.stopPropagation(); if (await confirmDialog('Удалить коллекцию', 'Удалить эту коллекцию?')) {
            data.collections = data.collections.filter(c => c.id !== col.id);
            if (activeCollectionId === col.id) { activeCollectionId = null; activeCollection = null; showEmptyState(); }
            saveData(); renderTree(); toast('Коллекция удалена', 'success');
        }
    });
    nameSpan.addEventListener('dblclick', async e => {
        e.stopPropagation(); const newName = await showInputModal('Новое название коллекции', col.name);
        if (newName) { col.name = newName; await saveData(); renderTree(); if (activeCollectionId === col.id) collectionNameInput.value = col.name; toast('Переименовано', 'success'); }
    });
    div.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'col:' + col.id); e.dataTransfer.effectAllowed = 'move'; div.classList.add('dragging'); });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));
    container.appendChild(div);
}
async function moveCollectionToFolder(collectionId, folderId) { const col = data.collections.find(c => c.id === collectionId); if (col) { col.folderId = folderId; await saveData(); renderTree(); } }
async function moveFolderToFolder(folderId, newParentId) { const folder = data.folders.find(f => f.id === folderId); if (folder && folderId !== newParentId) { folder.parentId = newParentId; await saveData(); renderTree(); } }

function cleanupEmptyCollection(colId) {
    const col = data.collections.find(c => c.id === colId); if (!col) return;
    if (!col.steps?.length && (!col.name || col.name === 'Новая коллекция') && !col.results?.length) {
        data.collections = data.collections.filter(c => c.id !== colId); saveData();
    }
}

function selectCollection(id) {
    const previousId = activeCollectionId; if (previousId && previousId !== id) cleanupEmptyCollection(previousId);
    activeCollectionId = id; activeCollection = data.collections.find(c => c.id === id); if (!activeCollection) return;
    renderCollectionEditor(); renderTree();
}
function showEmptyState() { collectionEditorEl.style.display = 'none'; emptyStateEl.style.display = 'block'; }
function renderCollectionEditor() {
    emptyStateEl.style.display = 'none'; collectionEditorEl.style.display = 'block'; collectionNameInput.value = activeCollection.name || '';
    collectionNameInput.oninput = () => { activeCollection.name = collectionNameInput.value.trim() || 'Без названия'; debouncedSave(); renderTree(); };
    if (activeCollection.results) renderRunnerTable(activeCollection.results); else runnerResultsBody.innerHTML = '';
    tabBtns.forEach(b => b.classList.remove('active')); document.querySelector('[data-tab="runner"]').classList.add('active');
    runnerTab.style.display = 'block'; historyTab.style.display = 'none'; renderSteps();
}

function renderSteps() {
    destroyAllEditors(); stepsContainer.innerHTML = ''; if (!activeCollection.steps) activeCollection.steps = [];
    activeCollection.steps.forEach((step, idx) => stepsContainer.appendChild(createStepCard(step, idx)));
    requestAnimationFrame(() => { activeEditors.forEach(({ editor }) => { if (editor) editor.refresh(); }); });
}

function createStepCard(step, idx) {
    const card = document.createElement('div'); card.className = 'step-card'; card.dataset.index = idx;
    const header = document.createElement('div'); header.className = 'step-header';
    const nameSpan = txt('span', step.name || `Шаг ${idx + 1}`, 'step-name');
    const actionsDiv = document.createElement('div'); actionsDiv.className = 'step-actions';
    const sendBtn = document.createElement('button'); sendBtn.className = 'send-btn'; sendBtn.textContent = '▶ Send'; sendBtn.addEventListener('click', () => openSendModal(step));
    const curlBtn = document.createElement('button'); curlBtn.className = 'curl-import-btn'; curlBtn.textContent = '📋 cURL'; curlBtn.title = 'Импортировать из cURL'; curlBtn.addEventListener('click', () => importStepFromCurl(step, idx));
    const delBtn = document.createElement('button'); delBtn.className = 'danger'; delBtn.style.cssText = 'padding:2px 8px;font-size:12px;'; delBtn.textContent = 'Удалить';
    delBtn.addEventListener('click', async () => {
        if (await confirmDialog('Удалить шаг', 'Удалить этот шаг?')) { activeCollection.steps.splice(idx, 1); saveData(); renderSteps(); toast('Шаг удалён', 'success'); }
    });
    actionsDiv.appendChild(sendBtn); actionsDiv.appendChild(curlBtn); actionsDiv.appendChild(delBtn);
    header.appendChild(nameSpan); header.appendChild(actionsDiv); card.appendChild(header);

    const nameField = document.createElement('div'); nameField.className = 'field'; nameField.appendChild(txt('label', 'Название шага'));
    const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.className = 'step-name-input'; nameInput.value = step.name || ''; nameInput.placeholder = 'Например: Логин';
    nameField.appendChild(nameInput); card.appendChild(nameField);

    const urlMethodRow = document.createElement('div'); urlMethodRow.className = 'url-method-row';
    const methodField = document.createElement('div'); methodField.className = 'field'; methodField.appendChild(txt('label', 'Метод'));
    const methodDropdown = document.createElement('div'); methodDropdown.className = 'method-dropdown'; methodDropdown.dataset.method = step.method || 'GET';
    const methodSelected = document.createElement('div'); methodSelected.className = 'method-selected'; methodSelected.textContent = step.method || 'GET';
    const methodOptions = document.createElement('div'); methodOptions.className = 'method-options';
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach(m => {
        const option = document.createElement('div'); option.className = 'method-option'; option.dataset.method = m; option.textContent = m; if (m === step.method) option.classList.add('selected');
        option.addEventListener('click', () => {
            methodSelected.textContent = m; methodDropdown.dataset.method = m; methodOptions.querySelectorAll('.method-option').forEach(opt => opt.classList.remove('selected')); option.classList.add('selected'); methodDropdown.classList.remove('open');
            methodDropdown.dispatchEvent(new Event('input', { bubbles: true }));
        });
        methodOptions.appendChild(option);
    });
    methodSelected.addEventListener('click', (e) => { e.stopPropagation(); document.querySelectorAll('.method-dropdown.open').forEach(d => { if (d !== methodDropdown) d.classList.remove('open'); }); methodDropdown.classList.toggle('open'); });
    methodDropdown.appendChild(methodSelected); methodDropdown.appendChild(methodOptions);
    Object.defineProperty(methodDropdown, 'value', { get: function () { return this.dataset.method; } });
    methodField.appendChild(methodDropdown); urlMethodRow.appendChild(methodField);

    const urlField = document.createElement('div'); urlField.className = 'field'; urlField.appendChild(txt('label', 'URL'));
    const urlInput = document.createElement('input'); urlInput.type = 'text'; urlInput.className = 'step-url'; urlInput.value = step.url || ''; urlInput.placeholder = 'http://api.example.com/{{id}}';
    urlField.appendChild(urlInput); urlMethodRow.appendChild(urlField); card.appendChild(urlMethodRow);

    const tabsContainer = document.createElement('div'); tabsContainer.className = 'step-tabs';
    const tabButtons = {}; const tabContents = {};
    const createTab = (id, label) => {
        const btn = document.createElement('button'); btn.className = 'step-tab-btn'; btn.textContent = label; btn.dataset.tab = id;
        const content = document.createElement('div'); content.className = 'step-tab-content'; content.dataset.tab = id;
        tabButtons[id] = btn; tabContents[id] = content; tabsContainer.appendChild(btn); return { btn, content };
    };
    const headersTab = createTab('headers', 'Headers'); const authTab = createTab('auth', 'Authorization'); const bodyTab = createTab('body', 'Body');
    card.appendChild(tabsContainer);
    Object.keys(tabButtons).forEach(tabId => {
        tabButtons[tabId].addEventListener('click', () => {
            Object.values(tabButtons).forEach(b => b.classList.remove('active')); Object.values(tabContents).forEach(c => c.classList.remove('active'));
            tabButtons[tabId].classList.add('active'); tabContents[tabId].classList.add('active');
            if (tabId === 'body') requestAnimationFrame(() => { activeEditors.forEach(({ editor }) => { if (editor) editor.refresh(); }); });
        });
    });
    tabButtons.headers.classList.add('active'); tabContents.headers.classList.add('active');

    // Headers Tab
    let headersArray = step.customHeaders;
    if (!Array.isArray(headersArray)) { headersArray = (headersArray && typeof headersArray === 'object') ? Object.entries(headersArray).map(([key, value]) => ({ key, value: String(value), enabled: true })) : []; step.customHeaders = headersArray; }
    const headersTable = document.createElement('table'); headersTable.className = 'headers-table';
    headersTable.innerHTML = `<thead><tr><th class="header-enabled"></th><th class="header-key">Ключ</th><th class="header-value">Значение</th><th class="header-actions"></th></tr></thead>`;
    const tbody = document.createElement('tbody'); headersTable.appendChild(tbody);
    const datalistId = 'headers-list-' + idx + '-' + Date.now(); const datalist = document.createElement('datalist'); datalist.id = datalistId;
    ['Content-Type', 'Accept', 'Authorization', 'X-API-Key', 'User-Agent', 'Cache-Control', 'X-Request-ID'].forEach(h => { const opt = document.createElement('option'); opt.value = h; datalist.appendChild(opt); });
    tabContents.headers.appendChild(datalist);

    const renderHeaderRow = (headerData, index) => {
        const tr = document.createElement('tr'); tr.className = 'header-row' + (headerData.enabled ? '' : ' disabled');
        const tdEnabled = document.createElement('td'); tdEnabled.className = 'header-enabled'; const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = headerData.enabled !== false;
        checkbox.addEventListener('change', () => { headerData.enabled = checkbox.checked; tr.classList.toggle('disabled', !checkbox.checked); debouncedSave(); });
        tdEnabled.appendChild(checkbox); tr.appendChild(tdEnabled);
        const tdKey = document.createElement('td'); tdKey.className = 'header-key'; const keyInput = document.createElement('input'); keyInput.type = 'text'; keyInput.setAttribute('list', datalistId); keyInput.value = headerData.key || ''; keyInput.placeholder = 'Название'; keyInput.autocomplete = 'off';
        keyInput.addEventListener('input', () => { headerData.key = keyInput.value.trim(); debouncedSave(); }); tdKey.appendChild(keyInput); tr.appendChild(tdKey);
        const tdValue = document.createElement('td'); tdValue.className = 'header-value'; const valueInput = document.createElement('input'); valueInput.type = 'text'; valueInput.value = headerData.value || ''; valueInput.placeholder = 'Значение';
        valueInput.addEventListener('input', () => { headerData.value = valueInput.value; debouncedSave(); }); tdValue.appendChild(valueInput); tr.appendChild(tdValue);
        const tdActions = document.createElement('td'); tdActions.className = 'header-actions'; const removeBtn = document.createElement('button'); removeBtn.className = 'header-remove-btn'; removeBtn.textContent = '✕'; removeBtn.title = 'Удалить заголовок';
        removeBtn.addEventListener('click', () => { step.customHeaders.splice(index, 1); tr.style.opacity = '0'; tr.style.transform = 'translateX(10px)'; tr.style.transition = 'all 0.2s'; setTimeout(() => { tr.remove(); debouncedSave(); }, 180); });
        tdActions.appendChild(removeBtn); tr.appendChild(tdActions); tbody.appendChild(tr);
    };
    step.customHeaders.forEach((h, i) => renderHeaderRow(h, i));
    const addHeaderBtn = document.createElement('button'); addHeaderBtn.className = 'add-header-btn'; addHeaderBtn.textContent = 'Добавить заголовок';
    addHeaderBtn.addEventListener('click', () => { const newHeader = { key: '', value: '', enabled: true }; step.customHeaders.push(newHeader); renderHeaderRow(newHeader, step.customHeaders.length - 1); debouncedSave(); });
    tabContents.headers.appendChild(headersTable); tabContents.headers.appendChild(addHeaderBtn);

    // Auth Tab
    const authField = document.createElement('div'); authField.className = 'field'; authField.appendChild(txt('label', 'Authorization'));
    const authInput = document.createElement('input'); authInput.type = 'text'; authInput.className = 'step-auth'; authInput.value = step.auth || ''; authInput.placeholder = 'Bearer токен';
    authField.appendChild(authInput); tabContents.auth.appendChild(authField);

    // Body Tab
    const bodyFieldDiv = document.createElement('div'); bodyFieldDiv.className = 'field';
    const bodyLabelRow = document.createElement('div'); bodyLabelRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;';
    bodyLabelRow.appendChild(txt('label', 'Тело запроса (JSON, Ctrl+/ для комментариев)'));
    const formatBtn = document.createElement('button'); formatBtn.className = 'secondary'; formatBtn.style.cssText = 'padding:2px 10px; font-size:12px;'; formatBtn.textContent = '🎨 Форматировать'; bodyLabelRow.appendChild(formatBtn);
    const bodyTextarea = document.createElement('textarea'); bodyTextarea.className = 'step-body'; bodyTextarea.value = step.body || '';
    const editorId = 'cm-' + idx + '-' + Date.now(); const { wrapper: cmWrapper, editor: cmInstance } = createCodeMirrorEditor(bodyTextarea, step.body || ''); activeEditors.set(editorId, { editor: cmInstance, wrapper: cmWrapper });
    formatBtn.addEventListener('click', (e) => { e.stopPropagation(); formatCurrentEditor(editorId); });
    bodyFieldDiv.appendChild(bodyLabelRow); bodyFieldDiv.appendChild(cmWrapper); tabContents.body.appendChild(bodyFieldDiv);
    card.appendChild(tabContents.headers); card.appendChild(tabContents.auth); card.appendChild(tabContents.body);

    const save = () => {
        step.name = nameInput.value.trim(); step.url = urlInput.value.trim(); step.method = methodDropdown.value; step.auth = authInput.value.trim(); step.body = bodyTextarea.value;
        methodDropdown.dataset.method = step.method; nameSpan.textContent = step.name || `Шаг ${idx + 1}`; debouncedSave();
    };
    [nameInput, urlInput, methodDropdown, authInput, bodyTextarea].forEach(el => el.addEventListener('input', save));
    return card;
}

// ================== Раннер ==================
runCollectionBtn.addEventListener('click', async () => {
    if (!activeCollection || !activeCollection.steps?.length) { toast('Добавьте хотя бы один шаг в коллекцию.', 'warning'); return; }
    let items; try { items = await readDataFile(); } catch (e) { toast('Ошибка чтения файла данных: ' + e.message, 'error'); return; }
    const delay = parseInt(delayInput.value, 10) || 0; if (!activeCollection.results) activeCollection.results = []; else activeCollection.results.length = 0;
    runnerResultsBody.innerHTML = ''; progressEl.textContent = 'Запуск...';
    try {
        await window.api.runCollection(activeCollection.steps, items, delay, activeCollection.name, getActiveEnvironment());
        progressEl.textContent = 'Готово.'; toast('Коллекция выполнена', 'success');
    } catch (e) { progressEl.textContent = 'Ошибка: ' + e.message; toast('Ошибка выполнения: ' + e.message, 'error'); }
});

window.api.onProgress((progressData) => {
    const { item, stepName, success, status, error, response } = progressData;
    const row = document.createElement('tr'); row.className = success ? 'success' : 'error';
    row.dataset.responseData = response ? JSON.stringify(response) : ''; row.dataset.error = error || ''; row.dataset.item = item; row.dataset.stepName = stepName;
    row.appendChild(txt('td', item)); row.appendChild(txt('td', stepName));
    const td3 = document.createElement('td'); const badge = txt('span', success ? `✓ ${status}` : `✗ ${status || 'ERROR'}`, `status-badge ${success ? 'status-success' : 'status-error'}`); td3.appendChild(badge); row.appendChild(td3);
    runnerResultsBody.appendChild(row);
    if (activeCollection) { if (!activeCollection.results) activeCollection.results = []; activeCollection.results.push({ item, stepName, success, status, error, responseData: row.dataset.responseData }); }
    row.addEventListener('dblclick', () => showResponseDetails(row)); progressEl.textContent = `Элемент: ${item} → ${stepName}`;
});

function renderRunnerTable(results) {
    runnerResultsBody.innerHTML = '';
    results.forEach(r => {
        const row = document.createElement('tr'); row.className = r.success ? 'success' : 'error'; row.dataset.responseData = r.responseData || ''; row.dataset.error = r.error || ''; row.dataset.item = r.item; row.dataset.stepName = r.stepName;
        row.appendChild(txt('td', r.item)); row.appendChild(txt('td', r.stepName));
        const td3 = document.createElement('td'); const badge = txt('span', r.success ? `✓ ${r.status}` : `✗ ${r.status || 'ERROR'}`, `status-badge ${r.success ? 'status-success' : 'status-error'}`); td3.appendChild(badge); row.appendChild(td3);
        row.addEventListener('dblclick', () => showResponseDetails(row)); runnerResultsBody.appendChild(row);
    });
}

// ================== Send ==================
function openSendModal(step) { currentStepForSend = step; testDataInput.value = '{}'; sendRequestModal.classList.add('active'); }
sendSingleBtn.addEventListener('click', async () => {
    if (!currentStepForSend) return; const td = testDataInput.value.trim();
    try { if (td) JSON.parse(td); } catch (e) { toast('Некорректный JSON', 'error'); return; }
    sendSingleBtn.disabled = true; sendSingleBtn.textContent = 'Отправка...';
    try {
        const res = await window.api.sendSingleRequest(currentStepForSend, td || '{}', activeCollection?.name || '', getActiveEnvironment());
        sendSingleBtn.disabled = false; sendSingleBtn.textContent = '▶ Отправить'; sendRequestModal.classList.remove('active');
        const rd = { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data, url: res.url };
        buildDetailContent({ responseData: JSON.stringify(rd), error: res.success ? null : res.statusText, url: res.url, requestBody: res.requestBody, requestHeaders: res.requestHeaders, item: `Тестовые данные: ${td || '{}'}`, stepName: currentStepForSend.name || 'Одиночный запрос' });
        detailModalTitle.textContent = `Результат: ${currentStepForSend.name || 'Одиночный запрос'}`; detailModal.classList.add('active');
        toast(res.success ? 'Запрос выполнен успешно' : `Ошибка: ${res.statusText}`, res.success ? 'success' : 'error');
    } catch (e) { sendSingleBtn.disabled = false; sendSingleBtn.textContent = '▶ Отправить'; toast('Ошибка: ' + e.message, 'error'); }
});

// ================== История ==================
async function loadHistory() { fullHistory = await window.api.getHistory(); updateHistoryFilter(); renderFilteredHistory(); }
function updateHistoryFilter() {
    historyFilter.innerHTML = '<option value="">Все коллекции</option>';
    [...new Set(fullHistory.map(h => h.collection).filter(Boolean))].forEach(name => { const o = document.createElement('option'); o.value = name; o.textContent = name; historyFilter.appendChild(o); });
}
function renderFilteredHistory() {
    const val = historyFilter.value; historyTableBody.innerHTML = '';
    (val ? fullHistory.filter(h => h.collection === val) : fullHistory).forEach(e => {
        const row = document.createElement('tr'); row.className = e.success ? 'success' : 'error';
        row.appendChild(txt('td', new Date(e.timestamp).toLocaleString())); row.appendChild(txt('td', e.collection || '—')); row.appendChild(txt('td', e.type === 'single' ? 'Send' : 'Runner'));
        row.appendChild(txt('td', e.item)); row.appendChild(txt('td', e.stepName)); const tdUrl = txt('td', e.url); tdUrl.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; row.appendChild(tdUrl);
        const tdStatus = document.createElement('td'); const badge = txt('span', e.success ? `✓ ${e.status}` : `✗ ${e.status}`, `status-badge ${e.success ? 'status-success' : 'status-error'}`); tdStatus.appendChild(badge); row.appendChild(tdStatus);
        row.addEventListener('dblclick', () => showHistoryDetail(e)); historyTableBody.appendChild(row);
    });
}
function showHistoryDetail(e) {
    const rd = { status: e.status, statusText: '', headers: e.responseHeaders || {}, data: e.responseData, url: e.url };
    buildDetailContent({ responseData: JSON.stringify(rd), error: e.success ? null : e.error, url: e.url, requestBody: e.requestBody, requestHeaders: e.requestHeaders, item: e.item, stepName: e.stepName });
    detailModalTitle.textContent = `История: ${e.stepName}`; detailModal.classList.add('active');
}
refreshHistoryBtn.addEventListener('click', loadHistory);
clearHistoryBtn.addEventListener('click', async () => { if (await confirmDialog('Очистить историю', 'Очистить всю историю запросов?')) { await window.api.clearHistory(); fullHistory = []; historyTableBody.innerHTML = ''; toast('История очищена', 'success'); } });
historyFilter.addEventListener('change', renderFilteredHistory);

function showResponseDetails(row) { buildDetailContent({ responseData: row.dataset.responseData, error: row.dataset.error, item: row.dataset.item, stepName: row.dataset.stepName }); detailModalTitle.textContent = `Детали: ${row.dataset.stepName}`; detailModal.classList.add('active'); }

function buildDetailContent({ responseData, error, item, stepName, url, requestBody, requestHeaders }) {
    let html = '';
    if (responseData && responseData !== 'null' && responseData !== 'undefined') {
        try {
            const resp = JSON.parse(responseData); const st = resp.status || ''; const cls = st >= 200 && st < 300 ? 'success' : 'error';
            html += `<div class="detail-section"><h3>Статус</h3><span class="detail-status ${cls}">${escapeHtml(String(st))} ${escapeHtml(resp.statusText || '')}</span></div>`;
            html += `<div class="detail-section"><h3>Общая информация</h3>`;
            if (item) html += `<div class="detail-field"><div class="detail-field-label">Элемент</div><div class="detail-field-value">${escapeHtml(item)}</div></div>`;
            if (stepName) html += `<div class="detail-field"><div class="detail-field-label">Шаг</div><div class="detail-field-value">${escapeHtml(stepName)}</div></div>`;
            if (resp.url || url) html += `<div class="detail-field"><div class="detail-field-label">URL</div><div class="detail-field-value">${escapeHtml(resp.url || url)}<button class="copy-btn" data-copy="${escapeHtml(resp.url || url)}">📋 Копировать</button></div></div>`;
            html += `</div>`;
            if (requestHeaders && Object.keys(requestHeaders).length) html += `<div class="detail-section"><h3>Заголовки запроса</h3><div class="detail-field-value">${escapeHtml(JSON.stringify(requestHeaders, null, 2))}<button class="copy-btn" data-copy="${escapeHtml(JSON.stringify(requestHeaders, null, 2))}">📋 Копировать</button></div></div>`;
            if (requestBody) html += `<div class="detail-section"><h3>Тело запроса</h3><div class="detail-field-value">${escapeHtml(requestBody)}<button class="copy-btn" data-copy="${escapeHtml(requestBody)}">📋 Копировать</button></div></div>`;
            if (resp.headers) html += `<div class="detail-section"><h3>Заголовки ответа</h3><div class="detail-field-value">${escapeHtml(JSON.stringify(resp.headers, null, 2))}<button class="copy-btn" data-copy="${escapeHtml(JSON.stringify(resp.headers, null, 2))}">📋 Копировать</button></div></div>`;
            html += `<div class="detail-section"><h3>Тело ответа</h3><div class="detail-field-value">${escapeHtml(JSON.stringify(resp.data, null, 2))}<button class="copy-btn" data-copy="${escapeHtml(JSON.stringify(resp.data, null, 2))}">📋 Копировать</button></div></div>`;
        } catch (e) { html += `<div class="detail-section"><h3>Ответ</h3><div class="detail-field-value">${escapeHtml(responseData)}</div></div>`; }
    } else { html += `<div class="detail-section"><h3>Ответ</h3><div class="detail-field-value">Нет данных</div></div>`; }
    if (error) {
        html += `<div class="detail-section"><h3>Ошибка</h3><div class="detail-field-value" style="color:var(--danger);">${escapeHtml(error)}`;
        try { if (responseData) { const parsed = JSON.parse(responseData); if (parsed.data?.errors?.[0]) { const s = parsed.data.errors[0]; html += `<br><br><strong>Детали от сервера:</strong><br><strong>Статус:</strong> ${escapeHtml(s.status || '')}<br><strong>Заголовок:</strong> ${escapeHtml(s.title || '')}`; if (s.detail) html += `<br><strong>Описание:</strong> ${escapeHtml(s.detail)}<br>`; } } } catch (e) { }
        html += `</div></div>`;
    }
    detailContent.innerHTML = html;
    detailContent.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
            const txt2 = btn.getAttribute('data-copy'); navigator.clipboard.writeText(txt2).then(() => { const orig = btn.textContent; btn.textContent = '✓ Скопировано'; setTimeout(() => btn.textContent = orig, 2000); });
        });
    });
}

// ================== Генератор JSON ==================
const jsonModal = document.getElementById('jsonModal'); const fieldsContainer = document.getElementById('fieldsContainer'); const addFieldBtn = document.getElementById('addFieldBtn'); const generateJsonBtn = document.getElementById('generateJsonBtn'); const saveJsonBtn = document.getElementById('saveJsonBtn'); const closeModalBtn = document.getElementById('closeModalBtn'); const jsonPreview = document.getElementById('jsonPreview');
closeModalBtn.addEventListener('click', () => jsonModal.classList.remove('active'));
let generatedJsonString = '';
addFieldBtn.addEventListener('click', () => {
    const row = document.createElement('div'); row.className = 'field-row';
    const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.placeholder = 'Название поля'; nameInput.className = 'field-name'; nameInput.style.flex = '1';
    const valuesInput = document.createElement('input'); valuesInput.type = 'text'; valuesInput.placeholder = 'Значения через запятую'; valuesInput.className = 'field-values'; valuesInput.style.flex = '2';
    const removeBtn = document.createElement('button'); removeBtn.className = 'remove-field-btn'; removeBtn.textContent = '✕'; removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(nameInput); row.appendChild(valuesInput); row.appendChild(removeBtn); fieldsContainer.appendChild(row);
});
generateJsonBtn.addEventListener('click', () => {
    const fields = []; fieldsContainer.querySelectorAll('.field-row').forEach(row => { const n = row.querySelector('.field-name').value.trim(); const v = row.querySelector('.field-values').value.trim(); if (n && v) fields.push({ name: n, values: v.split(',').map(s => s.trim()) }); });
    if (!fields.length) { toast('Добавьте хотя бы одно поле.', 'warning'); return; }
    const lengths = fields.map(f => f.values.length); if (new Set(lengths).size > 1) { toast('Количество значений во всех полях должно быть одинаковым.', 'error'); return; }
    const result = []; for (let i = 0; i < lengths[0]; i++) { const obj = {}; fields.forEach(f => obj[f.name] = f.values[i]); result.push(obj); }
    generatedJsonString = JSON.stringify(result, null, 2); jsonPreview.style.display = 'block'; jsonPreview.textContent = generatedJsonString; saveJsonBtn.style.display = 'inline-block';
});
saveJsonBtn.addEventListener('click', async () => { if (!generatedJsonString) return; const r = await window.api.saveFile(generatedJsonString); if (r.success) toast(`Файл сохранён: ${r.filePath}`, 'success'); });

// ================== Импорт cURL ==================
function parseCurl(cmd) {
    let c = cmd.replace(/\\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim(); if (!c.startsWith('curl ')) return null; c = c.substring(5);
    const tokens = []; let current = '', state = 0;
    for (let i = 0; i < c.length; i++) {
        const ch = c[i];
        if (state === 0) { if (ch === ' ') { if (current) { tokens.push(current); current = ''; } } else if (ch === "'") { state = 1; } else if (ch === '"') { state = 2; } else if (ch === '\\' && i + 1 < c.length) { current += c[++i]; } else { current += ch; } }
        else if (state === 1) { if (ch === "'") { if (i + 1 < c.length && c[i + 1] === "'") { current += "'"; i++; } else { state = 0; } } else { current += ch; } }
        else if (state === 2) { if (ch === '\\' && i + 1 < c.length) { current += c[++i]; } else if (ch === '"') { state = 0; } else { current += ch; } }
    }
    if (current) tokens.push(current);
    const result = { method: 'GET', url: '', headers: {}, body: null }; let iTok = 0;
    while (iTok < tokens.length) {
        const token = tokens[iTok];
        if (['--location', '--compressed', '--silent', '--insecure'].includes(token)) { iTok++; continue; }
        if ((token === '-X' || token === '--request') && iTok + 1 < tokens.length) { result.method = tokens[++iTok].toUpperCase(); iTok++; continue; }
        if ((token === '-H' || token === '--header') && iTok + 1 < tokens.length) { const h = tokens[++iTok]; const idx = h.indexOf(':'); if (idx > 0) { const k = h.substring(0, idx).trim(); const v = h.substring(idx + 1).trim(); if (k) result.headers[k] = v; } iTok++; continue; }
        if (['--data', '--data-raw', '-d', '--data-binary'].includes(token) && iTok + 1 < tokens.length) { result.body = tokens[++iTok]; iTok++; continue; }
        if (!token.startsWith('-')) { result.url = token; }
        iTok++;
    }
    return result;
}
function importStepFromCurl(step, idx) { document.getElementById('curlInput').value = ''; document.getElementById('curlModal').classList.add('active'); window._currentStepForCurlImport = { step, idx }; }
document.getElementById('closeCurlModalBtn').addEventListener('click', () => document.getElementById('curlModal').classList.remove('active'));
document.getElementById('parseCurlBtn').addEventListener('click', () => {
    const txt2 = document.getElementById('curlInput').value.trim(); if (!txt2) { toast('Введите команду cURL', 'warning'); return; }
    const p = parseCurl(txt2); if (!p) { toast('Не удалось распознать cURL', 'error'); return; }
    if (window._currentStepForCurlImport) {
        const { step } = window._currentStepForCurlImport;
        step.url = p.url; step.method = p.method; step.contentType = p.headers['Content-Type'] || step.contentType || 'application/json'; step.auth = p.headers['Authorization'] || step.auth || ''; step.body = p.body || step.body || '';
        delete p.headers['Authorization']; delete p.headers['Content-Type']; step.customHeaders = { ...step.customHeaders, ...p.headers };
        window._currentStepForCurlImport = null; saveData(); renderSteps(); document.getElementById('curlModal').classList.remove('active'); toast('Шаг обновлён из cURL', 'success'); return;
    }
    const newStep = { name: '', url: p.url, method: p.method, contentType: p.headers['Content-Type'] || 'application/json', auth: p.headers['Authorization'] || '', body: p.body || '', customHeaders: {} };
    delete p.headers['Authorization']; delete p.headers['Content-Type']; newStep.customHeaders = p.headers; activeCollection.steps.push(newStep); saveData(); renderSteps(); document.getElementById('curlModal').classList.remove('active'); toast('Шаг импортирован из cURL', 'success');
});

// ================== Кнопки ==================
newRootCollectionBtn.addEventListener('click', async () => { const newCol = { id: generateUniqueId(), name: 'Новая коллекция', steps: [], folderId: null }; data.collections.push(newCol); await saveData(); selectCollection(newCol.id); renderTree(); });
newFolderBtn.addEventListener('click', async () => { const name = await showInputModal('Название папки', 'Новая папка'); if (name) { data.folders.push({ id: generateUniqueId(), name, parentId: null, collapsed: false }); await saveData(); renderTree(); toast('Папка создана', 'success'); } });
addStepBtn.addEventListener('click', () => { if (!activeCollection) return; activeCollection.steps.push({ name: '', url: '', method: 'GET', contentType: 'application/json', auth: '', body: '', customHeaders: [] }); saveData(); renderSteps(); });
tabBtns.forEach(b => { b.addEventListener('click', () => { tabBtns.forEach(x => x.classList.remove('active')); b.classList.add('active'); runnerTab.style.display = b.dataset.tab === 'runner' ? 'block' : 'none'; historyTab.style.display = b.dataset.tab === 'history' ? 'block' : 'none'; if (b.dataset.tab === 'history') loadHistory(); }); });
function readDataFile() {
    return new Promise((resolve, reject) => {
        const file = dataFileInput.files[0]; if (!file) { reject(new Error('Файл не выбран')); return; }
        const reader = new FileReader(); reader.onload = e => { try { const items = JSON.parse(e.target.result); if (!Array.isArray(items)) reject(new Error('Файл данных должен содержать массив')); else resolve(items); } catch (err) { reject(new Error('Ошибка парсинга JSON: ' + err.message)); } };
        reader.onerror = () => reject(new Error('Ошибка чтения файла')); reader.readAsText(file);
    });
}
dataFileInput.addEventListener('change', () => { selectedFileName.textContent = dataFileInput.files.length ? dataFileInput.files[0].name : 'Файл не выбран'; });

// ================== Горячие клавиши ==================
document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); await saveData(); toast('Сохранено', 'success', 1500); }
    if (e.key === 'Escape') { document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active')); currentStepForSend = null; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && sendRequestModal.classList.contains('active')) sendSingleBtn.click();
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); newRootCollectionBtn.click(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('.method-dropdown')) document.querySelectorAll('.method-dropdown.open').forEach(d => d.classList.remove('open')); });
window.addEventListener('beforeunload', () => { if (activeCollectionId) cleanupEmptyCollection(activeCollectionId); });

const globalJsonBtn = document.getElementById('globalJsonGeneratorBtn'); const globalPostmanBtn = document.getElementById('globalImportPostmanBtn'); const emptyNewColBtn = document.getElementById('emptyStateNewCollectionBtn'); const emptyJsonBtn = document.getElementById('emptyStateJsonGeneratorBtn'); const emptyPostmanBtn = document.getElementById('emptyStateImportPostmanBtn');
if (globalJsonBtn) globalJsonBtn.addEventListener('click', () => jsonModal.classList.add('active'));
if (globalPostmanBtn) globalPostmanBtn.addEventListener('click', handlePostmanImport);
if (emptyNewColBtn) emptyNewColBtn.addEventListener('click', () => newRootCollectionBtn.click());
if (emptyJsonBtn) emptyJsonBtn.addEventListener('click', () => jsonModal.classList.add('active'));
if (emptyPostmanBtn) emptyPostmanBtn.addEventListener('click', handlePostmanImport);
if (jsonGeneratorBtn) jsonGeneratorBtn.addEventListener('click', () => jsonModal.classList.add('active'));
if (importCurlBtn) importCurlBtn.addEventListener('click', () => { if (!activeCollection) { toast('Сначала выберите коллекцию.', 'warning'); return; } document.getElementById('curlInput').value = ''; document.getElementById('curlModal').classList.add('active'); });

loadData(); showEmptyState();