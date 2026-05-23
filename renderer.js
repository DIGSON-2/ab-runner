// renderer.js – исправлены размеры панели и cURL-парсер
let data = { folders: [], collections: [] };
let activeCollectionId = null;
let activeCollection = null;
let searchQuery = '';

const importPostmanBtn = document.getElementById('importPostmanBtn');
const postmanFileInput = document.getElementById('postmanFileInput');
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
const newCollectionBtn = document.getElementById('newCollectionBtn');
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

let currentStepForSend = null;
let fullHistory = [];
let sidebarWidth = 260; // начальная ширина

// ================== Sidebar resize & toggle ==================
function updateMaxWidth() {
    const maxWidth = Math.floor(window.innerWidth * 0.4); // 40% от ширины окна
    sidebar.style.maxWidth = maxWidth + 'px';
    if (sidebarWidth > maxWidth) {
        sidebar.style.width = maxWidth + 'px';
        sidebarWidth = maxWidth;
    }
}

window.addEventListener('resize', () => {
    updateMaxWidth();
});
importPostmanBtn.addEventListener('click', () => {
    postmanFileInput.click();
});


let isResizing = false, startX, startWidth;
resizer.addEventListener('mousedown', e => {
    if (sidebar.style.display === 'none') return;
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const minWidth = 300; // минимальная ширина, чтобы текст не ломался
    const maxWidth = Math.floor(window.innerWidth * 0.4);
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + (e.clientX - startX)));
    sidebar.style.width = newWidth + 'px';
    sidebarWidth = newWidth;
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
});

toggleSidebarBtn.addEventListener('click', () => {
    if (sidebar.style.display === 'none') {
        sidebar.style.display = '';
        resizer.classList.remove('hidden');
        sidebar.style.width = sidebarWidth + 'px';
        sidebarToggleBtn.style.display = 'none';
        toggleSidebarBtn.textContent = '☰ Скрыть панель';
    } else {
        sidebar.style.display = 'none';
        resizer.classList.add('hidden');
        sidebarToggleBtn.style.display = 'block';
        toggleSidebarBtn.textContent = '☰ Показать панель';
    }
});

sidebarToggleBtn.addEventListener('click', () => {
    sidebar.style.display = '';
    resizer.classList.remove('hidden');
    sidebar.style.width = sidebarWidth + 'px';
    sidebarToggleBtn.style.display = 'none';
    toggleSidebarBtn.textContent = '☰ Скрыть панель';
});
// ================== Модальные окна ==================
function setupModalOverlayClose() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.classList.remove('active');
                if (modal === inputModal) inputModalCancelBtn.click();
                if (modal === sendRequestModal) currentStepForSend = null;
            }
        });
    });
}
document.addEventListener('DOMContentLoaded', setupModalOverlayClose);
closeDetailModalBtn.addEventListener('click', () => detailModal.classList.remove('active'));
closeSendModalBtn.addEventListener('click', () => { sendRequestModal.classList.remove('active'); currentStepForSend = null; });

// ================== Триграммный поиск ==================
function getTrigrams(s) {
    const str = '  ' + s.toLowerCase() + ' ';
    const t = [];
    for (let i = 0; i < str.length - 2; i++) t.push(str.substring(i, i + 3));
    return t;
}
function trigramSimilarity(a, b) {
    if (!a || !b) return 0;
    const ta = getTrigrams(a), tb = getTrigrams(b);
    if (!ta.length || !tb.length) return 0;
    const sa = new Set(ta);
    let intersect = 0;
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
function matchesCollection(col) {
    if (!searchQuery) return true;
    return collectionRelevance(col, searchQuery) > SEARCH_THRESHOLD;
}
searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderTree();
});

// ================== Кастомные модалки ==================
function showInputModal(title, def) {
    return new Promise(resolve => {
        inputModalTitle.textContent = title;
        inputModalField.value = def || '';
        const oldSel = inputModal.querySelector('.temp-select');
        if (oldSel) oldSel.remove();
        inputModalField.style.display = 'block';
        inputModal.classList.add('active');
        inputModalField.focus();
        const cleanup = () => {
            inputModal.classList.remove('active');
            inputModalOkBtn.removeEventListener('click', onOk);
            inputModalCancelBtn.removeEventListener('click', onCancel);
            inputModalField.removeEventListener('keydown', onKey);
        };
        const onOk = () => { cleanup(); resolve(inputModalField.value.trim()); };
        const onCancel = () => { cleanup(); resolve(null); };
        const onKey = e => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); };
        inputModalOkBtn.addEventListener('click', onOk);
        inputModalCancelBtn.addEventListener('click', onCancel);
        inputModalField.addEventListener('keydown', onKey);
    });
}
function showSelectModal(title, options) {
    return new Promise(resolve => {
        inputModalTitle.textContent = title;
        inputModalField.style.display = 'none';
        const oldSel = inputModal.querySelector('.temp-select');
        if (oldSel) oldSel.remove();
        const sel = document.createElement('select');
        sel.className = 'temp-select';
        sel.style.cssText = 'width:100%;padding:8px 12px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;margin-bottom:16px;';
        options.forEach((o, i) => {
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = o; sel.appendChild(opt);
        });
        inputModalField.parentNode.insertBefore(sel, inputModalField.nextSibling);
        inputModal.classList.add('active');
        sel.focus();
        const cleanup = () => {
            inputModal.classList.remove('active');
            sel.remove();
            inputModalField.style.display = 'block';
            inputModalOkBtn.removeEventListener('click', onOk);
            inputModalCancelBtn.removeEventListener('click', onCancel);
        };
        const onOk = () => { const v = parseInt(sel.value, 10); cleanup(); resolve(v); };
        const onCancel = () => { cleanup(); resolve(null); };
        inputModalOkBtn.addEventListener('click', onOk);
        inputModalCancelBtn.addEventListener('click', onCancel);
    });
}

// ================== Темы ==================
const themes = ['dark', 'light', 'red-white', 'red-black'];
const themeNames = { dark: 'Тёмная', light: 'Светлая', 'red-white': 'Красно-белая', 'red-black': 'Красно-чёрная' };
function applyTheme(t) {
    document.body.classList.remove('light-theme', 'red-white-theme', 'red-black-theme');
    if (t !== 'dark') document.body.classList.add(`${t}-theme`);
    themeNameEl.textContent = themeNames[t];
    localStorage.setItem('ab-runner-theme', t);
}
applyTheme(localStorage.getItem('ab-runner-theme') || 'dark');
themeToggleBtn.addEventListener('click', () => {
    const cur = localStorage.getItem('ab-runner-theme') || 'dark';
    applyTheme(themes[(themes.indexOf(cur) + 1) % themes.length]);
});

// ================== Данные ==================
async function loadData() {
    data = await window.api.getData();
    if (!data.folders) data.folders = [];
    if (!data.collections) data.collections = [];
    renderTree();
    updateHistoryFilter();
}
async function saveData() { await window.api.saveData(data); }

// ================== Рендер дерева ==================
function renderTree() {
    treeContainer.innerHTML = '';
    const folders = data.folders || [];
    const collections = data.collections || [];
    folders.forEach(folder => {
        const fCols = collections.filter(c => c.folderId === folder.id && matchesCollection(c));
        if (searchQuery && fCols.length === 0) return;
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder-item';
        folderDiv.dataset.folderId = folder.id;
        folderDiv.innerHTML = `<span class="folder-name">📁 ${folder.name || 'Без названия'}</span><button class="delete-folder-btn">✕</button>`;
        folderDiv.addEventListener('click', e => {
            if (e.target.classList.contains('delete-folder-btn')) return;
            const child = folderDiv.nextElementSibling;
            if (child && child.classList.contains('folder-children')) {
                child.classList.toggle('collapsed');
                folderDiv.classList.toggle('collapsed');
            }
        });
        folderDiv.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); folderDiv.classList.add('drag-over'); });
        folderDiv.addEventListener('dragleave', e => folderDiv.classList.remove('drag-over'));
        folderDiv.addEventListener('drop', e => {
            e.preventDefault(); e.stopPropagation(); folderDiv.classList.remove('drag-over');
            const cid = e.dataTransfer.getData('text/plain');
            if (cid) moveCollectionToFolder(cid, folder.id);
        });
        folderDiv.querySelector('.delete-folder-btn').addEventListener('click', e => {
            e.stopPropagation();
            if (collections.some(c => c.folderId === folder.id)) { alert('Сначала удалите или переместите все коллекции из папки.'); return; }
            if (confirm(`Удалить папку "${folder.name}"?`)) { data.folders = data.folders.filter(f => f.id !== folder.id); saveData(); renderTree(); }
        });
        treeContainer.appendChild(folderDiv);
        const childCont = document.createElement('div');
        childCont.className = 'folder-children';
        fCols.forEach(c => renderCollectionItem(c, childCont));
        treeContainer.appendChild(childCont);
    });
    const rootCols = collections.filter(c => (!c.folderId || !folders.find(f => f.id === c.folderId)) && matchesCollection(c));
    rootCols.forEach(c => renderCollectionItem(c, treeContainer));
}
function renderCollectionItem(col, container) {
    const div = document.createElement('div');
    div.className = `collection-item${activeCollectionId === col.id ? ' active' : ''}`;
    div.dataset.collectionId = col.id;
    div.draggable = true;
    div.innerHTML = `<span class="collection-name" title="Двойной клик для переименования">📄 ${col.name || 'Без названия'}</span><button class="delete-collection-btn">✕</button><button class="move-to-folder-btn" title="Переместить в папку" style="background:none;border:none;color:var(--text-secondary);margin-left:4px;cursor:pointer;font-size:14px;">📂</button>`;
    div.addEventListener('click', e => {
        if (e.target.classList.contains('delete-collection-btn') || e.target.classList.contains('move-to-folder-btn')) return;
        selectCollection(col.id);
    });
    div.querySelector('.delete-collection-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('Удалить коллекцию?')) {
            data.collections = data.collections.filter(c => c.id !== col.id);
            if (activeCollectionId === col.id) { activeCollectionId = null; activeCollection = null; showEmptyState(); }
            saveData(); renderTree();
        }
    });
    div.querySelector('.collection-name').addEventListener('dblclick', async e => {
        e.stopPropagation();
        const n = await showInputModal('Новое название коллекции', col.name);
        if (n) { col.name = n; await saveData(); renderTree(); if (activeCollectionId === col.id) collectionNameInput.value = col.name; }
    });
    div.querySelector('.move-to-folder-btn').addEventListener('click', async e => {
        e.stopPropagation();
        const folders = data.folders;
        if (!folders.length) { alert('Нет доступных папок.'); return; }
        const choice = await showSelectModal('Выберите папку', folders.map(f => f.name));
        if (choice !== null) moveCollectionToFolder(col.id, folders[choice].id);
    });
    div.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', col.id); e.dataTransfer.effectAllowed = 'move'; div.classList.add('dragging'); });
    div.addEventListener('dragend', e => div.classList.remove('dragging'));
    container.appendChild(div);
}
async function moveCollectionToFolder(cid, fid) {
    const col = data.collections.find(c => c.id === cid);
    if (col) { col.folderId = fid; await saveData(); renderTree(); }
}

// ================== Выбор коллекции ==================
function selectCollection(id) {
    activeCollectionId = id;
    activeCollection = data.collections.find(c => c.id === id);
    if (!activeCollection) return;
    renderCollectionEditor();
    renderTree();
}
function showEmptyState() { collectionEditorEl.style.display = 'none'; emptyStateEl.style.display = 'block'; }
function renderCollectionEditor() {
    emptyStateEl.style.display = 'none'; collectionEditorEl.style.display = 'block';
    collectionNameInput.value = activeCollection.name || '';
    collectionNameInput.oninput = () => { activeCollection.name = collectionNameInput.value.trim() || 'Без названия'; saveData(); renderTree(); };
    if (activeCollection.results) renderRunnerTable(activeCollection.results); else runnerResultsBody.innerHTML = '';
    tabBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="runner"]').classList.add('active');
    runnerTab.style.display = 'block'; historyTab.style.display = 'none';
    renderSteps();
}
function renderSteps() {
    stepsContainer.innerHTML = '';
    if (!activeCollection.steps) activeCollection.steps = [];
    activeCollection.steps.forEach((step, idx) => {
        const card = createStepCard(step, idx);
        stepsContainer.appendChild(card);
    });
}
function createStepCard(step, idx) {
    const card = document.createElement('div');
    card.className = 'step-card';
    card.dataset.index = idx;
    const header = document.createElement('div');
    header.className = 'step-header';
    header.innerHTML = `<span class="step-name">${step.name || `Шаг ${idx + 1}`}</span><div class="step-actions"><button class="send-btn">▶ Send</button><button class="danger" style="padding:2px 8px;font-size:12px;">Удалить</button></div>`;
    header.querySelector('.send-btn').addEventListener('click', () => openSendModal(step));
    header.querySelector('.danger').addEventListener('click', () => { activeCollection.steps.splice(idx, 1); saveData(); renderSteps(); });
    const fieldsHtml = `
    <div class="field"><label>Название шага</label><input type="text" class="step-name-input" value="${step.name || ''}" placeholder="Например: Логин"></div>
    <div class="field"><label>URL</label><input type="text" class="step-url" value="${step.url || ''}" placeholder="http://api.example.com/{id}"></div>
    <div style="display:flex; gap:10px;">
      <div class="field" style="flex:1;"><label>Метод</label><select class="step-method">
        <option ${step.method === 'GET' ? 'selected' : ''}>GET</option>
        <option ${step.method === 'POST' ? 'selected' : ''}>POST</option>
        <option ${step.method === 'PUT' ? 'selected' : ''}>PUT</option>
        <option ${step.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
        <option ${step.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
      </select></div>
      <div class="field" style="flex:1;"><label>Content-Type</label><input type="text" class="step-content-type" value="${step.contentType || 'application/vnd.api+json'}"></div>
    </div>
    <div class="field"><label>Authorization</label><input type="text" class="step-auth" value="${step.auth || ''}" placeholder="Bearer токен"></div>
    <div class="field"><label>Тело запроса</label><textarea class="step-body" rows="4">${step.body || ''}</textarea></div>
    <div class="field"><label>Доп. заголовки (через запятую key:value)</label><input type="text" class="step-headers" value="${step.customHeaders ? Object.entries(step.customHeaders).map(([k, v]) => `${k}:${v}`).join(', ') : ''}" placeholder="X-API-Key: abc123, Accept: application/json"></div>
  `;
    card.appendChild(header);
    card.insertAdjacentHTML('beforeend', fieldsHtml);
    const save = () => {
        step.name = card.querySelector('.step-name-input').value.trim();
        step.url = card.querySelector('.step-url').value.trim();
        step.method = card.querySelector('.step-method').value;
        step.contentType = card.querySelector('.step-content-type').value.trim();
        step.auth = card.querySelector('.step-auth').value.trim();
        step.body = card.querySelector('.step-body').value;
        const hStr = card.querySelector('.step-headers').value.trim();
        if (hStr) {
            const obj = {};
            hStr.split(',').forEach(p => {
                const [k, ...r] = p.split(':');
                if (k && r.length) obj[k.trim()] = r.join(':').trim();
            });
            step.customHeaders = obj;
        } else step.customHeaders = {};
        card.querySelector('.step-name').textContent = step.name || `Шаг ${idx + 1}`;
        saveData();
    };
    card.querySelectorAll('input, select, textarea').forEach(el => el.addEventListener('input', save));
    return card;
}

// ================== Раннер ==================
runCollectionBtn.addEventListener('click', async () => {
    if (!activeCollection || !activeCollection.steps || activeCollection.steps.length === 0) {
        alert('Добавьте хотя бы один шаг в коллекцию.'); return;
    }
    let items;
    try { items = await readDataFile(); } catch (e) { alert('Ошибка чтения файла данных: ' + e.message); return; }
    const delay = parseInt(delayInput.value, 10) || 0;
    if (!activeCollection.results) activeCollection.results = [];
    else activeCollection.results.length = 0;
    runnerResultsBody.innerHTML = '';
    progressEl.textContent = 'Запуск...';
    await window.api.runCollection(activeCollection.steps, items, delay, activeCollection.name);
    progressEl.textContent = 'Готово.';
});
window.api.onProgress((data) => {
    const { item, stepName, success, status, error, response } = data;
    const row = document.createElement('tr');
    row.className = success ? 'success' : 'error';
    row.dataset.responseData = response ? JSON.stringify(response) : '';
    row.dataset.error = error || '';
    row.innerHTML = `<td>${item}</td><td>${stepName}</td><td><span class="status-badge ${success ? 'status-success' : 'status-error'}">${success ? '✓ ' + status : '✗ ' + (status || 'ERROR')}</span></td>`;
    runnerResultsBody.appendChild(row);
    if (activeCollection) {
        if (!activeCollection.results) activeCollection.results = [];
        activeCollection.results.push({ item, stepName, success, status, error, responseData: response ? JSON.stringify(response) : '' });
    }
    row.addEventListener('dblclick', () => showResponseDetails(row));
    progressEl.textContent = `Элемент: ${item} → ${stepName}`;
});
function renderRunnerTable(results) {
    runnerResultsBody.innerHTML = '';
    results.forEach(r => {
        const row = document.createElement('tr');
        row.className = r.success ? 'success' : 'error';
        row.dataset.responseData = r.responseData || '';
        row.dataset.error = r.error || '';
        row.innerHTML = `<td>${r.item}</td><td>${r.stepName}</td><td><span class="status-badge ${r.success ? 'status-success' : 'status-error'}">${r.success ? '✓ ' + r.status : '✗ ' + (r.status || 'ERROR')}</span></td>`;
        row.addEventListener('dblclick', () => showResponseDetails(row));
        runnerResultsBody.appendChild(row);
    });
}

// ================== Send ==================
function openSendModal(step) { currentStepForSend = step; testDataInput.value = '{}'; sendRequestModal.classList.add('active'); }
sendSingleBtn.addEventListener('click', async () => {
    if (!currentStepForSend) return;
    const td = testDataInput.value.trim();
    try { if (td) JSON.parse(td); } catch (e) { alert('Некорректный JSON'); return; }
    sendSingleBtn.disabled = true; sendSingleBtn.textContent = 'Отправка...';
    const res = await window.api.sendSingleRequest(currentStepForSend, td || '{}', activeCollection?.name || '');
    sendSingleBtn.disabled = false; sendSingleBtn.textContent = '▶ Отправить';
    sendRequestModal.classList.remove('active');
    const rd = { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data, url: res.url };
    buildDetailContent({
        responseData: JSON.stringify(rd),
        error: res.success ? null : res.statusText,
        url: res.url, requestBody: res.requestBody, requestHeaders: res.requestHeaders,
        item: `Тестовые данные: ${td || '{}'}`,
        stepName: currentStepForSend.name || 'Одиночный запрос',
    });
    detailModalTitle.textContent = `Результат: ${currentStepForSend.name || 'Одиночный запрос'}`;
    detailModal.classList.add('active');
});

// ================== История ==================
async function loadHistory() { fullHistory = await window.api.getHistory(); updateHistoryFilter(); renderFilteredHistory(); }
function updateHistoryFilter() {
    historyFilter.innerHTML = '<option value="">Все коллекции</option>';
    [...new Set(fullHistory.map(h => h.collection).filter(Boolean))].forEach(name => {
        const o = document.createElement('option'); o.value = name; o.textContent = name; historyFilter.appendChild(o);
    });
}
function renderFilteredHistory() {
    const val = historyFilter.value;
    historyTableBody.innerHTML = '';
    (val ? fullHistory.filter(h => h.collection === val) : fullHistory).forEach(e => {
        const row = document.createElement('tr');
        row.className = e.success ? 'success' : 'error';
        row.innerHTML = `<td>${new Date(e.timestamp).toLocaleString()}</td><td>${e.collection || '—'}</td><td>${e.type === 'single' ? 'Send' : 'Runner'}</td><td>${e.item}</td><td>${e.stepName}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.url}</td><td><span class="status-badge ${e.success ? 'status-success' : 'status-error'}">${e.success ? '✓ ' + e.status : '✗ ' + e.status}</span></td>`;
        row.addEventListener('dblclick', () => showHistoryDetail(e));
        historyTableBody.appendChild(row);
    });
}
function showHistoryDetail(e) {
    const rd = { status: e.status, statusText: '', headers: e.responseHeaders || {}, data: e.responseData, url: e.url };
    buildDetailContent({
        responseData: JSON.stringify(rd),
        error: e.success ? null : e.error,
        url: e.url, requestBody: e.requestBody, requestHeaders: e.requestHeaders,
        item: e.item, stepName: e.stepName,
    });
    detailModalTitle.textContent = `История: ${e.stepName}`;
    detailModal.classList.add('active');
}
refreshHistoryBtn.addEventListener('click', loadHistory);
clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('Очистить всю историю?')) { await window.api.clearHistory(); fullHistory = []; historyTableBody.innerHTML = ''; }
});
historyFilter.addEventListener('change', renderFilteredHistory);

// ================== Детали ==================
function showResponseDetails(row) {
    buildDetailContent({
        responseData: row.dataset.responseData,
        error: row.dataset.error,
        item: row.cells[0].textContent,
        stepName: row.cells[1].textContent,
    });
    detailModalTitle.textContent = `Детали: ${row.cells[1].textContent}`;
    detailModal.classList.add('active');
}
function buildDetailContent({ responseData, error, item, stepName, url, requestBody, requestHeaders }) {
    let html = '';
    if (responseData && responseData !== 'null' && responseData !== 'undefined') {
        try {
            const resp = JSON.parse(responseData);
            const st = resp.status || '';
            const cls = st >= 200 && st < 300 ? 'success' : 'error';
            html += `<div class="detail-section"><h3>Статус</h3><span class="detail-status ${cls}">${st} ${resp.statusText || ''}</span></div>`;
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
    if (error) html += `<div class="detail-section"><h3>Ошибка</h3><div class="detail-field-value" style="color:var(--danger);">${escapeHtml(error)}</div></div>`;
    detailContent.innerHTML = html;
    detailContent.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
            const txt = btn.getAttribute('data-copy');
            navigator.clipboard.writeText(txt).then(() => {
                const orig = btn.textContent; btn.textContent = '✓ Скопировано';
                setTimeout(() => btn.textContent = orig, 2000);
            });
        });
    });
}
function escapeHtml(t) {
    if (typeof t !== 'string') return t;
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ================== Генератор JSON ==================
const jsonModal = document.getElementById('jsonModal');
const fieldsContainer = document.getElementById('fieldsContainer');
const addFieldBtn = document.getElementById('addFieldBtn');
const generateJsonBtn = document.getElementById('generateJsonBtn');
const saveJsonBtn = document.getElementById('saveJsonBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const jsonPreview = document.getElementById('jsonPreview');
jsonGeneratorBtn.addEventListener('click', () => jsonModal.classList.add('active'));
closeModalBtn.addEventListener('click', () => jsonModal.classList.remove('active'));
let generatedJsonString = '';
addFieldBtn.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `<input type="text" placeholder="Название поля" class="field-name" style="flex:1;"><input type="text" placeholder="Значения через запятую" class="field-values" style="flex:2;"><button class="remove-field-btn">✕</button>`;
    row.querySelector('.remove-field-btn').addEventListener('click', () => row.remove());
    fieldsContainer.appendChild(row);
});
generateJsonBtn.addEventListener('click', () => {
    const fields = [];
    fieldsContainer.querySelectorAll('.field-row').forEach(row => {
        const n = row.querySelector('.field-name').value.trim();
        const v = row.querySelector('.field-values').value.trim();
        if (n && v) fields.push({ name: n, values: v.split(',').map(s => s.trim()) });
    });
    if (!fields.length) { alert('Добавьте хотя бы одно поле.'); return; }
    const lengths = fields.map(f => f.values.length);
    if (new Set(lengths).size > 1) { alert('Количество значений во всех полях должно быть одинаковым.'); return; }
    const result = [];
    for (let i = 0; i < lengths[0]; i++) {
        const obj = {};
        fields.forEach(f => obj[f.name] = f.values[i]);
        result.push(obj);
    }
    generatedJsonString = JSON.stringify(result, null, 2);
    jsonPreview.style.display = 'block'; jsonPreview.textContent = generatedJsonString; saveJsonBtn.style.display = 'inline-block';
});
saveJsonBtn.addEventListener('click', async () => {
    if (!generatedJsonString) return;
    const r = await window.api.saveFile(generatedJsonString);
    if (r.success) alert(`Файл сохранён: ${r.filePath}`);
});

// ================== Импорт cURL (переработанная версия) ==================
function parseCurl(cmd) {
    // Убираем line continuation (обратный слеш + перевод строки)
    let c = cmd.replace(/\\\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (!c.startsWith('curl ')) return null;

    // Убираем начальное "curl "
    c = c.substring(5);

    const tokens = [];
    let current = '';
    let i = 0;
    const STATE = { NORMAL: 0, SQ: 1, DQ: 2 };
    let state = STATE.NORMAL;

    while (i < c.length) {
        const ch = c[i];
        if (state === STATE.NORMAL) {
            if (ch === ' ') {
                if (current !== '') {
                    tokens.push(current);
                    current = '';
                }
            } else if (ch === "'") {
                state = STATE.SQ;
            } else if (ch === '"') {
                state = STATE.DQ;
            } else if (ch === '\\') {
                // обратный слеш экранирует следующий символ (даже пробел)
                if (i + 1 < c.length) {
                    current += c[i + 1];
                    i++;
                } else {
                    current += '\\';
                }
            } else {
                current += ch;
            }
        } else if (state === STATE.SQ) {
            if (ch === "'") {
                if (i + 1 < c.length && c[i + 1] === "'") {
                    // '\'' — экранированный апостроф внутри одинарных кавычек
                    current += "'";
                    i++;
                } else {
                    // закрывающая кавычка
                    state = STATE.NORMAL;
                }
            } else {
                current += ch;
            }
        } else if (state === STATE.DQ) {
            if (ch === '\\' && i + 1 < c.length) {
                // в двойных кавычках \ экранирует следующий символ (обычно " \ $ ` и т.д.)
                current += c[i + 1];
                i++;
            } else if (ch === '"') {
                state = STATE.NORMAL;
            } else {
                current += ch;
            }
        }
        i++;
    }
    if (current !== '') {
        tokens.push(current);
    }

    // Теперь интерпретируем токены
    const result = { method: 'GET', url: '', headers: {}, body: null };
    let iTok = 0;
    while (iTok < tokens.length) {
        const token = tokens[iTok];

        // Пропускаем флаги без значений
        if (['--location', '--compressed', '--silent', '--insecure'].includes(token)) {
            iTok++;
            continue;
        }

        // Метод
        if (token === '-X' || token === '--request') {
            if (iTok + 1 < tokens.length) {
                result.method = tokens[iTok + 1].toUpperCase();
                iTok += 2;
            } else iTok++;
            continue;
        }

        // Заголовок
        if (token === '-H' || token === '--header') {
            if (iTok + 1 < tokens.length) {
                const headerStr = tokens[iTok + 1];
                const colonIndex = headerStr.indexOf(':');
                if (colonIndex > 0) {
                    const key = headerStr.substring(0, colonIndex).trim();
                    const value = headerStr.substring(colonIndex + 1).trim();
                    if (key) result.headers[key] = value;
                }
                iTok += 2;
            } else iTok++;
            continue;
        }

        // Тело запроса
        if (['--data', '--data-raw', '-d', '--data-binary'].includes(token)) {
            if (iTok + 1 < tokens.length) {
                result.body = tokens[iTok + 1];
                iTok += 2;
            } else iTok++;
            continue;
        }

        // Если токен не начинается с '-', считаем его URL (последний такой перезапишет)
        if (!token.startsWith('-')) {
            result.url = token;
            iTok++;
            continue;
        }

        // Неизвестный флаг — если за ним следует не флаг, пропускаем оба
        if (iTok + 1 < tokens.length && !tokens[iTok + 1].startsWith('-')) {
            iTok += 2;
        } else {
            iTok++;
        }
    }

    return result;
}

importCurlBtn.addEventListener('click', () => {
    if (!activeCollection) { alert('Сначала выберите коллекцию.'); return; }
    document.getElementById('curlInput').value = '';
    document.getElementById('curlModal').classList.add('active');
});
document.getElementById('closeCurlModalBtn').addEventListener('click', () => document.getElementById('curlModal').classList.remove('active'));
document.getElementById('parseCurlBtn').addEventListener('click', () => {
    const txt = document.getElementById('curlInput').value.trim();
    if (!txt) { alert('Введите команду cURL'); return; }
    const p = parseCurl(txt);
    if (!p) { alert('Не удалось распознать cURL'); return; }
    const newStep = {
        name: '',
        url: p.url,
        method: p.method,
        contentType: p.headers['Content-Type'] || 'application/json',
        auth: p.headers['Authorization'] || '',
        body: p.body || '',
        customHeaders: {}
    };
    delete p.headers['Authorization'];
    delete p.headers['Content-Type'];
    newStep.customHeaders = p.headers;
    activeCollection.steps.push(newStep);
    saveData();
    renderSteps();
    document.getElementById('curlModal').classList.remove('active');
});
// ================== Кнопки папок и коллекций ==================
newFolderBtn.addEventListener('click', async () => {
    const name = await showInputModal('Название папки', 'Новая папка');
    if (name) { data.folders.push({ id: Date.now().toString(), name }); await saveData(); renderTree(); }
});
newCollectionBtn.addEventListener('click', async () => {
    const col = { id: Date.now().toString(), name: 'Новая коллекция', steps: [], folderId: null };
    data.collections.push(col); await saveData(); selectCollection(col.id); renderTree();
});
addStepBtn.addEventListener('click', () => {
    if (!activeCollection) return;
    activeCollection.steps.push({ name: '', url: '', method: 'GET', contentType: 'application/json', auth: '', body: '', customHeaders: {} });
    saveData(); renderSteps();
});

// ================== Вкладки ==================
tabBtns.forEach(b => {
    b.addEventListener('click', () => {
        tabBtns.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        if (b.dataset.tab === 'runner') { runnerTab.style.display = 'block'; historyTab.style.display = 'none'; }
        else { runnerTab.style.display = 'none'; historyTab.style.display = 'block'; loadHistory(); }
    });
});

function readDataFile() {
    return new Promise((resolve, reject) => {
        const file = dataFileInput.files[0];
        if (!file) { reject(new Error('Файл не выбран')); return; }
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const items = JSON.parse(e.target.result);
                if (!Array.isArray(items)) reject(new Error('Файл данных должен содержать массив'));
                else resolve(items);
            } catch (err) { reject(new Error('Ошибка парсинга JSON: ' + err.message)); }
        };
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsText(file);
    });
}
dataFileInput.addEventListener('change', () => {
    selectedFileName.textContent = dataFileInput.files.length ? dataFileInput.files[0].name : 'Файл не выбран';
});

// ------------------- Импорт Postman -------------------
importPostmanBtn.addEventListener('click', () => {
    postmanFileInput.click();
});

function parsePostmanCollection(collectionJson) {
    const steps = [];
    function processItems(items, prefix = '') {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            if (item.request) {
                // Это запрос
                const req = item.request;
                const url = (req.url && (typeof req.url === 'object' ? req.url.raw : req.url)) || '';
                const method = req.method || 'GET';
                const headers = {};
                if (Array.isArray(req.header)) {
                    req.header.forEach(h => {
                        if (h.key && h.value) headers[h.key] = h.value;
                    });
                }
                let body = '';
                if (req.body && req.body.mode === 'raw' && req.body.raw) {
                    body = req.body.raw;
                }
                steps.push({
                    name: prefix + item.name,
                    url: url,
                    method: method,
                    contentType: headers['Content-Type'] || 'application/json',
                    auth: headers['Authorization'] || '',
                    body: body,
                    customHeaders: Object.fromEntries(
                        Object.entries(headers).filter(([k]) => k !== 'Authorization' && k !== 'Content-Type')
                    )
                });
            } else if (item.item) {
                // Это папка – рекурсивно с префиксом
                processItems(item.item, prefix + item.name + ' / ');
            }
        });
    }
    processItems(collectionJson.item);
    return steps;
}
function parsePostmanCollection(collectionJson) {
    const steps = [];
    function processItems(items, prefix = '') {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            if (item.request) {
                // Это запрос
                const req = item.request;
                const url = (req.url && (typeof req.url === 'object' ? req.url.raw : req.url)) || '';
                const method = req.method || 'GET';
                const headers = {};
                if (Array.isArray(req.header)) {
                    req.header.forEach(h => {
                        if (h.key && h.value) headers[h.key] = h.value;
                    });
                }
                let body = '';
                if (req.body && req.body.mode === 'raw' && req.body.raw) {
                    body = req.body.raw;
                }
                steps.push({
                    name: prefix + item.name,
                    url: url,
                    method: method,
                    contentType: headers['Content-Type'] || 'application/json',
                    auth: headers['Authorization'] || '',
                    body: body,
                    customHeaders: Object.fromEntries(
                        Object.entries(headers).filter(([k]) => k !== 'Authorization' && k !== 'Content-Type')
                    )
                });
            } else if (item.item) {
                // Папка – рекурсивно с префиксом
                processItems(item.item, prefix + item.name + ' / ');
            }
        });
    }
    if (collectionJson.item) {
        processItems(collectionJson.item);
    }
    return steps;
}

// Импорт одной коллекции (создаёт новую коллекцию в данных)
async function importSinglePostmanCollection(collectionJson) {
    const collectionName = (collectionJson.info && collectionJson.info.name) ? collectionJson.info.name : 'Postman Import';
    const steps = parsePostmanCollection(collectionJson);
    if (steps.length === 0) {
        console.warn(`Коллекция "${collectionName}" не содержит запросов, пропущена.`);
        return;
    }
    const newCol = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        name: collectionName,
        steps: steps,
        folderId: null,
    };
    data.collections.push(newCol);
    await saveData();
    selectCollection(newCol.id);
    renderTree();
}

// Обработка окружений (сохраняет переменные в JSON-файлы)
async function handlePostmanEnvironments(environments) {
    if (!environments.length) return;
    const proceed = confirm(`Найдено ${environments.length} окружений. Сохранить переменные каждого как JSON-файл?`);
    if (!proceed) return;
    for (const env of environments) {
        const envName = env.name || 'environment';
        const variables = {};
        if (env.values && Array.isArray(env.values)) {
            env.values.forEach(v => {
                if (v.key && v.value !== undefined) {
                    variables[v.key] = v.value;
                }
            });
        }
        const content = JSON.stringify(variables, null, 2);
        const res = await window.api.saveFile(content, `${envName}.json`);
        if (res.success) {
            console.log(`Окружение "${envName}" сохранено в ${res.filePath}`);
        } else {
            console.warn(`Сохранение окружения "${envName}" отменено.`);
        }
    }
}

// Главный обработчик выбора файла
postmanFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const json = JSON.parse(text);

        // Определяем структуру
        if (Array.isArray(json)) {
            // массив коллекций
            for (const col of json) {
                await importSinglePostmanCollection(col);
            }
        } else if (json.collections && Array.isArray(json.collections)) {
            // Data Dump
            for (const col of json.collections) {
                await importSinglePostmanCollection(col);
            }
            if (json.environments && Array.isArray(json.environments)) {
                await handlePostmanEnvironments(json.environments);
            }
        } else if (json.info && json.item) {
            // Одиночная коллекция v2.1
            await importSinglePostmanCollection(json);
        } else {
            alert('Файл не содержит коллекций Postman в известном формате.');
            return;
        }
        alert('Импорт завершён.');
    } catch (err) {
        alert('Ошибка при импорте Postman: ' + err.message);
    }
    postmanFileInput.value = '';
});
// Горячие клавиши
document.addEventListener('keydown', (e) => {
    // Ctrl+Enter — запуск раннера
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('runCollectionBtn').click();
    }
    // Ctrl+B — скрыть/показать боковую панель
    if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebarBtn.click();
    }
    // Ctrl+N — новая коллекция
    if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        newCollectionBtn.click();
    }
    // Ctrl+Shift+N — новая папка
    if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        newFolderBtn.click();
    }
    // Escape — закрыть все модальные окна
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        // Если окно Send было открыто, сбросить текущий шаг
        if (sendRequestModal.classList.contains('active')) {
            sendRequestModal.classList.remove('active');
            currentStepForSend = null;
        }
    }
});
// Старт
loadData();
showEmptyState();