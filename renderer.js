// renderer.js – полная версия с исправлениями
let data = { folders: [], collections: [] };
let activeCollectionId = null;
let activeCollection = null;
let searchQuery = '';

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

let currentStepForSend = null;
let fullHistory = [];
let sidebarWidth = 260;

// ================== УТИЛИТЫ ==================

// Безопасное экранирование HTML
function escapeHtml(t) {
    if (typeof t !== 'string') return t == null ? '' : String(t);
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Создание текстового элемента (безопаснее innerHTML)
function txt(tag, text, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
}

// Debounce для автосохранения
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// Toast-уведомления
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

// Кастомный confirm вместо browser confirm
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
            </div>
        `;
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

// Debounced save
const debouncedSave = debounce(async () => {
    try {
        await saveData();
    } catch (e) {
        toast('Ошибка сохранения: ' + e.message, 'error');
    }
}, 500);

// ================== Sidebar resize & toggle ==================
let isResizing = false, startX, startWidth;
resizer.addEventListener('mousedown', e => {
    if (sidebar.style.display === 'none') return;
    isResizing = true; startX = e.clientX; startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const newWidth = Math.max(200, Math.min(Math.floor(window.innerWidth * 0.4), startWidth + (e.clientX - startX)));
    sidebar.style.width = newWidth + 'px';
    sidebarWidth = newWidth;
});
document.addEventListener('mouseup', () => {
    if (isResizing) { isResizing = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; }
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

// ================== Закрытие модальных окон ==================
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
    data.folders.forEach(f => {
        if (f.parentId === undefined) f.parentId = null;
        if (f.collapsed === undefined) f.collapsed = false;
    });
    data.collections.forEach(c => {
        if (c.folderId === undefined) c.folderId = null;
    });
    renderTree();
    updateHistoryFilter();
}
async function saveData() { await window.api.saveData(data); }

// ================== Иконка коллекции ==================
function getCollectionIcon(col) {
    if (!col.steps || col.steps.length === 0) return '📄';
    const methods = [...new Set(col.steps.map(s => s.method).filter(Boolean))];
    if (methods.length === 0) return '📄';
    if (methods.length === 1) {
        switch (methods[0]) {
            case 'GET': return '📥';
            case 'POST': return '📤';
            case 'PUT': return '📝';
            case 'PATCH': return '🔧';
            case 'DELETE': return '🗑️';
            default: return '📄';
        }
    }
    return '📂';
}

// ================== Генерация уникальных ID ==================
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
        folderDiv.dataset.folderId = folder.id;
        folderDiv.draggable = true;
        folderDiv.style.paddingLeft = (level * 16) + 'px';

        const nameSpan = txt('span', '📁 ' + (folder.name || 'Без названия'), 'folder-name');
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'folder-actions';
        const addColBtn = document.createElement('button');
        addColBtn.className = 'folder-add-collection-btn';
        addColBtn.title = 'Создать коллекцию в этой папке';
        addColBtn.textContent = '+';
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-folder-btn';
        delBtn.textContent = '✕';
        actionsDiv.appendChild(addColBtn);
        actionsDiv.appendChild(delBtn);

        folderDiv.appendChild(nameSpan);
        folderDiv.appendChild(actionsDiv);

        const childContainer = document.createElement('div');
        childContainer.className = 'folder-children' + (folder.collapsed ? ' collapsed' : '');
        childContainer.dataset.folderId = folder.id;

        container.appendChild(folderDiv);
        container.appendChild(childContainer);
        renderFolderContents(folder.id, childContainer, level + 1);

        // Клик по папке — сворачивание/разворачивание
        folderDiv.addEventListener('click', e => {
            if (e.target.classList.contains('delete-folder-btn') || e.target.classList.contains('folder-add-collection-btn')) return;
            folder.collapsed = !folder.collapsed;
            saveData().then(() => renderTree());
        });

        // Drag-start папки
        folderDiv.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', 'folder:' + folder.id);
            e.dataTransfer.effectAllowed = 'move';
            folderDiv.classList.add('dragging');
        });
        folderDiv.addEventListener('dragend', e => folderDiv.classList.remove('dragging'));

        // ===== DROP-зона: заголовок папки =====
        folderDiv.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            const transferData = e.dataTransfer.getData('text/plain');
            if (!transferData) return;
            if (transferData === 'folder:' + folder.id) return;
            folderDiv.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'move';
        });
        folderDiv.addEventListener('dragleave', e => {
            if (!folderDiv.contains(e.relatedTarget)) {
                folderDiv.classList.remove('drag-over');
            }
        });
        folderDiv.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            folderDiv.classList.remove('drag-over');
            handleDropOnFolder(e.dataTransfer.getData('text/plain'), folder.id);
        });

        // ===== DROP-зона: содержимое папки =====
        childContainer.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            const transferData = e.dataTransfer.getData('text/plain');
            if (!transferData) return;
            if (transferData === 'folder:' + folder.id) return;
            childContainer.classList.add('drag-over');
            folderDiv.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'move';
        });
        childContainer.addEventListener('dragleave', e => {
            if (!childContainer.contains(e.relatedTarget)) {
                childContainer.classList.remove('drag-over');
                folderDiv.classList.remove('drag-over');
            }
        });
        childContainer.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            childContainer.classList.remove('drag-over');
            folderDiv.classList.remove('drag-over');
            handleDropOnFolder(e.dataTransfer.getData('text/plain'), folder.id);
        });

        // Удаление папки
        delBtn.addEventListener('click', async e => {
            e.stopPropagation();
            const hasChildren = collections.some(c => c.folderId === folder.id) || folders.some(f => f.parentId === folder.id);
            if (hasChildren) { toast('Сначала удалите или переместите все элементы из папки.', 'warning'); return; }
            if (await confirmDialog('Удалить папку', `Удалить папку "${folder.name}"?`)) {
                data.folders = data.folders.filter(f => f.id !== folder.id);
                saveData(); renderTree();
                toast('Папка удалена', 'success');
            }
        });

        // Создание коллекции в папке
        addColBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newCol = {
                id: generateUniqueId(),
                name: 'Новая коллекция',
                steps: [],
                folderId: folder.id,
            };
            data.collections.push(newCol);
            await saveData();
            selectCollection(newCol.id);
            renderTree();
        });
    });

    const folderCollections = collections.filter(c => c.folderId === folderId && matchesCollection(c));
    folderCollections.forEach(col => renderCollectionItem(col, container, level + 1));
}

// Общая функция обработки drop на папку
function handleDropOnFolder(transferData, targetFolderId) {
    if (!transferData) return;
    if (transferData.startsWith('col:')) {
        const colId = transferData.substring(4);
        moveCollectionToFolder(colId, targetFolderId);
    } else if (transferData.startsWith('folder:')) {
        const folderIdToMove = transferData.substring(7);
        if (folderIdToMove !== targetFolderId && !isDescendant(targetFolderId, folderIdToMove)) {
            moveFolderToFolder(folderIdToMove, targetFolderId);
        }
    }
}

// Проверка: является ли folderId потомком ancestorId
function isDescendant(folderId, ancestorId) {
    const folder = data.folders.find(f => f.id === folderId);
    if (!folder) return false;
    if (folder.parentId === ancestorId) return true;
    if (!folder.parentId) return false;
    return isDescendant(folder.parentId, ancestorId);
}

function renderFolderContents(folderId, container, level) {
    renderFolderChildren(folderId, container, level);
}

function renderTree() {
    treeContainer.innerHTML = '';
    renderFolderChildren(null, treeContainer, 0);

    // Drop-зона для вытаскивания в корень
    treeContainer.addEventListener('dragover', e => {
        e.preventDefault();
        treeContainer.classList.add('drag-over-root');
        e.dataTransfer.dropEffect = 'move';
    });
    treeContainer.addEventListener('dragleave', e => {
        if (!treeContainer.contains(e.relatedTarget)) {
            treeContainer.classList.remove('drag-over-root');
        }
    });
    treeContainer.addEventListener('drop', e => {
        if (e.target === treeContainer) {
            e.preventDefault();
            treeContainer.classList.remove('drag-over-root');
            const transferData = e.dataTransfer.getData('text/plain');
            if (transferData.startsWith('col:')) {
                moveCollectionToFolder(transferData.substring(4), null);
            } else if (transferData.startsWith('folder:')) {
                moveFolderToFolder(transferData.substring(7), null);
            }
        }
    });
}

function renderCollectionItem(col, container, indentLevel = 0) {
    const div = document.createElement('div');
    div.className = `collection-item${activeCollectionId === col.id ? ' active' : ''}`;
    div.dataset.collectionId = col.id;
    div.draggable = true;
    div.style.paddingLeft = (indentLevel * 16) + 'px';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'collection-name';
    nameSpan.title = 'Двойной клик для переименования';
    nameSpan.textContent = getCollectionIcon(col) + ' ' + (col.name || 'Без названия');

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-collection-btn';
    delBtn.textContent = '✕';

    div.appendChild(nameSpan);
    div.appendChild(delBtn);

    div.addEventListener('click', e => {
        if (e.target.classList.contains('delete-collection-btn')) return;
        selectCollection(col.id);
    });
    delBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (await confirmDialog('Удалить коллекцию', 'Удалить эту коллекцию?')) {
            data.collections = data.collections.filter(c => c.id !== col.id);
            if (activeCollectionId === col.id) { activeCollectionId = null; activeCollection = null; showEmptyState(); }
            saveData(); renderTree();
            toast('Коллекция удалена', 'success');
        }
    });
    nameSpan.addEventListener('dblclick', async e => {
        e.stopPropagation();
        const newName = await showInputModal('Новое название коллекции', col.name);
        if (newName) {
            col.name = newName;
            await saveData();
            renderTree();
            if (activeCollectionId === col.id) collectionNameInput.value = col.name;
            toast('Переименовано', 'success');
        }
    });
    div.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', 'col:' + col.id);
        e.dataTransfer.effectAllowed = 'move';
        div.classList.add('dragging');
    });
    div.addEventListener('dragend', e => div.classList.remove('dragging'));
    container.appendChild(div);
}

async function moveCollectionToFolder(collectionId, folderId) {
    const col = data.collections.find(c => c.id === collectionId);
    if (col) { col.folderId = folderId; await saveData(); renderTree(); }
}

async function moveFolderToFolder(folderId, newParentId) {
    const folder = data.folders.find(f => f.id === folderId);
    if (folder && folderId !== newParentId) {
        folder.parentId = newParentId;
        await saveData();
        renderTree();
    }
}

// ================== Автоудаление пустых коллекций ==================
function cleanupEmptyCollection(colId) {
    const col = data.collections.find(c => c.id === colId);
    if (!col) return;

    const isEmpty = !col.steps || col.steps.length === 0;
    const isDefaultName = col.name === 'Новая коллекция' || !col.name || col.name.trim() === '';
    const hasNoResults = !col.results || col.results.length === 0;

    if (isEmpty && isDefaultName && hasNoResults) {
        data.collections = data.collections.filter(c => c.id !== colId);
        saveData();
    }
}

// ================== Выбор коллекции ==================
function selectCollection(id) {
    const previousId = activeCollectionId;
    if (previousId && previousId !== id) {
        cleanupEmptyCollection(previousId);
    }

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
    collectionNameInput.oninput = () => {
        activeCollection.name = collectionNameInput.value.trim() || 'Без названия';
        debouncedSave();
        renderTree();
    };
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

    const nameSpan = txt('span', step.name || `Шаг ${idx + 1}`, 'step-name');
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'step-actions';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'send-btn';
    sendBtn.textContent = '▶ Send';
    sendBtn.addEventListener('click', () => openSendModal(step));

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.style.cssText = 'padding:2px 8px;font-size:12px;';
    delBtn.textContent = 'Удалить';
    delBtn.addEventListener('click', async () => {
        if (await confirmDialog('Удалить шаг', 'Удалить этот шаг?')) {
            activeCollection.steps.splice(idx, 1);
            saveData(); renderSteps();
            toast('Шаг удалён', 'success');
        }
    });

    actionsDiv.appendChild(sendBtn);
    actionsDiv.appendChild(delBtn);
    header.appendChild(nameSpan);
    header.appendChild(actionsDiv);
    card.appendChild(header);

    const createField = (labelText, tag, className, value, placeholder) => {
        const field = document.createElement('div');
        field.className = 'field';
        const label = txt('label', labelText);
        let input;
        if (tag === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 4;
            input.value = value || '';
        } else if (tag === 'select') {
            input = document.createElement('select');
            ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                if (m === value) opt.selected = true;
                input.appendChild(opt);
            });
        } else {
            input = document.createElement('input');
            input.type = tag;
            input.value = value || '';
            if (placeholder) input.placeholder = placeholder;
        }
        input.className = className;
        field.appendChild(label);
        field.appendChild(input);
        return { field, input };
    };

    const nameField = createField('Название шага', 'text', 'step-name-input', step.name, 'Например: Логин');
    const urlField = createField('URL', 'text', 'step-url', step.url, 'http://api.example.com/{id}');

    const methodRow = document.createElement('div');
    methodRow.style.cssText = 'display:flex; gap:10px;';
    const methodField = document.createElement('div');
    methodField.className = 'field';
    methodField.style.flex = '1';
    const methodLabel = txt('label', 'Метод');
    const methodSelect = document.createElement('select');
    methodSelect.className = 'step-method';
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        if (m === step.method) opt.selected = true;
        methodSelect.appendChild(opt);
    });
    methodField.appendChild(methodLabel);
    methodField.appendChild(methodSelect);

    const ctField = createField('Content-Type', 'text', 'step-content-type', step.contentType || 'application/vnd.api+json');
    methodRow.appendChild(methodField);
    methodRow.appendChild(ctField.field);

    const authField = createField('Authorization', 'text', 'step-auth', step.auth, 'Bearer токен');
    const bodyField = createField('Тело запроса', 'textarea', 'step-body', step.body);

    const customHeadersStr = step.customHeaders ? Object.entries(step.customHeaders).map(([k, v]) => `${k}:${v}`).join(', ') : '';
    const headersField = createField('Доп. заголовки (через запятую key:value)', 'text', 'step-headers', customHeadersStr, 'X-API-Key: abc123, Accept: application/json');

    card.appendChild(nameField.field);
    card.appendChild(urlField.field);
    card.appendChild(methodRow);
    card.appendChild(authField.field);
    card.appendChild(bodyField.field);
    card.appendChild(headersField.field);

    const save = () => {
        step.name = nameField.input.value.trim();
        step.url = urlField.input.value.trim();
        step.method = methodSelect.value;
        step.contentType = ctField.input.value.trim();
        step.auth = authField.input.value.trim();
        step.body = bodyField.input.value;
        const hStr = headersField.input.value.trim();
        if (hStr) {
            const obj = {};
            hStr.split(',').forEach(p => {
                const [k, ...r] = p.split(':');
                if (k && r.length) obj[k.trim()] = r.join(':').trim();
            });
            step.customHeaders = obj;
        } else step.customHeaders = {};
        nameSpan.textContent = step.name || `Шаг ${idx + 1}`;
        debouncedSave();
    };
    [nameField.input, urlField.input, methodSelect, ctField.input, authField.input, bodyField.input, headersField.input]
        .forEach(el => el.addEventListener('input', save));
    return card;
}

// ================== Раннер ==================
runCollectionBtn.addEventListener('click', async () => {
    if (!activeCollection || !activeCollection.steps || activeCollection.steps.length === 0) {
        toast('Добавьте хотя бы один шаг в коллекцию.', 'warning'); return;
    }
    let items;
    try { items = await readDataFile(); } catch (e) { toast('Ошибка чтения файла данных: ' + e.message, 'error'); return; }
    const delay = parseInt(delayInput.value, 10) || 0;
    if (!activeCollection.results) activeCollection.results = [];
    else activeCollection.results.length = 0;
    runnerResultsBody.innerHTML = '';
    progressEl.textContent = 'Запуск...';
    try {
        await window.api.runCollection(activeCollection.steps, items, delay, activeCollection.name);
        progressEl.textContent = 'Готово.';
        toast('Коллекция выполнена', 'success');
    } catch (e) {
        progressEl.textContent = 'Ошибка: ' + e.message;
        toast('Ошибка выполнения: ' + e.message, 'error');
    }
});

window.api.onProgress((progressData) => {
    const { item, stepName, success, status, error, response } = progressData;
    const row = document.createElement('tr');
    row.className = success ? 'success' : 'error';
    row.dataset.responseData = response ? JSON.stringify(response) : '';
    row.dataset.error = error || '';
    row.dataset.item = item;
    row.dataset.stepName = stepName;

    const td1 = txt('td', item);
    const td2 = txt('td', stepName);
    const td3 = document.createElement('td');
    const badge = txt('span', success ? '✓ ' + status : '✗ ' + (status || 'ERROR'),
        'status-badge ' + (success ? 'status-success' : 'status-error'));
    td3.appendChild(badge);

    row.appendChild(td1);
    row.appendChild(td2);
    row.appendChild(td3);
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
        row.dataset.item = r.item;
        row.dataset.stepName = r.stepName;

        const td1 = txt('td', r.item);
        const td2 = txt('td', r.stepName);
        const td3 = document.createElement('td');
        const badge = txt('span', r.success ? '✓ ' + r.status : '✗ ' + (r.status || 'ERROR'),
            'status-badge ' + (r.success ? 'status-success' : 'status-error'));
        td3.appendChild(badge);

        row.appendChild(td1);
        row.appendChild(td2);
        row.appendChild(td3);
        row.addEventListener('dblclick', () => showResponseDetails(row));
        runnerResultsBody.appendChild(row);
    });
}

// ================== Send ==================
function openSendModal(step) { currentStepForSend = step; testDataInput.value = '{}'; sendRequestModal.classList.add('active'); }
sendSingleBtn.addEventListener('click', async () => {
    if (!currentStepForSend) return;
    const td = testDataInput.value.trim();
    try { if (td) JSON.parse(td); } catch (e) { toast('Некорректный JSON', 'error'); return; }
    sendSingleBtn.disabled = true; sendSingleBtn.textContent = 'Отправка...';
    try {
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
        if (res.success) toast('Запрос выполнен успешно', 'success');
        else toast(`Ошибка: ${res.statusText}`, 'error');
    } catch (e) {
        sendSingleBtn.disabled = false; sendSingleBtn.textContent = '▶ Отправить';
        toast('Ошибка: ' + e.message, 'error');
    }
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

        const tdTime = txt('td', new Date(e.timestamp).toLocaleString());
        const tdCol = txt('td', e.collection || '—');
        const tdType = txt('td', e.type === 'single' ? 'Send' : 'Runner');
        const tdItem = txt('td', e.item);
        const tdStep = txt('td', e.stepName);
        const tdUrl = txt('td', e.url);
        tdUrl.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const tdStatus = document.createElement('td');
        const badge = txt('span', e.success ? '✓ ' + e.status : '✗ ' + e.status,
            'status-badge ' + (e.success ? 'status-success' : 'status-error'));
        tdStatus.appendChild(badge);

        row.appendChild(tdTime);
        row.appendChild(tdCol);
        row.appendChild(tdType);
        row.appendChild(tdItem);
        row.appendChild(tdStep);
        row.appendChild(tdUrl);
        row.appendChild(tdStatus);
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
    if (await confirmDialog('Очистить историю', 'Очистить всю историю запросов?')) {
        await window.api.clearHistory();
        fullHistory = [];
        historyTableBody.innerHTML = '';
        toast('История очищена', 'success');
    }
});
historyFilter.addEventListener('change', renderFilteredHistory);

// ================== Детали ==================
function showResponseDetails(row) {
    buildDetailContent({
        responseData: row.dataset.responseData,
        error: row.dataset.error,
        item: row.dataset.item,
        stepName: row.dataset.stepName,
    });
    detailModalTitle.textContent = `Детали: ${row.dataset.stepName}`;
    detailModal.classList.add('active');
}

function buildDetailContent({ responseData, error, item, stepName, url, requestBody, requestHeaders }) {
    let html = '';
    if (responseData && responseData !== 'null' && responseData !== 'undefined') {
        try {
            const resp = JSON.parse(responseData);
            const st = resp.status || '';
            const cls = st >= 200 && st < 300 ? 'success' : 'error';
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
        } catch (e) { 
            html += `<div class="detail-section"><h3>Ответ</h3><div class="detail-field-value">${escapeHtml(responseData)}</div></div>`; 
        }
    } else { 
        html += `<div class="detail-section"><h3>Ответ</h3><div class="detail-field-value">Нет данных</div></div>`; 
    }
    
    if (error) {
        html += `<div class="detail-section"><h3>Ошибка</h3>`;
        html += `<div class="detail-field-value" style="color:var(--danger);">${escapeHtml(error)}`;
        
        try {
            if (responseData) {
                const parsed = JSON.parse(responseData);
                if (parsed.data?.errors?.[0]) {
                    const serverErr = parsed.data.errors[0];
                    html += `<br><br><strong>Детали от сервера:</strong><br>`;
                    html += `<strong>Статус:</strong> ${escapeHtml(serverErr.status || '')}<br>`;
                    html += `<strong>Заголовок:</strong> ${escapeHtml(serverErr.title || '')}<br>`;
                    if (serverErr.detail) {
                        html += `<strong>Описание:</strong> ${escapeHtml(serverErr.detail)}<br>`;
                    }
                }
            }
        } catch (e) { /* не JSON */ }
        
        html += `</div></div>`;
    }
    
    detailContent.innerHTML = html;
    detailContent.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
            const txt2 = btn.getAttribute('data-copy');
            navigator.clipboard.writeText(txt2).then(() => {
                const orig = btn.textContent; 
                btn.textContent = '✓ Скопировано';
                setTimeout(() => btn.textContent = orig, 2000);
            });
        });
    });
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
    const nameInput = document.createElement('input');
    nameInput.type = 'text'; nameInput.placeholder = 'Название поля'; nameInput.className = 'field-name';
    nameInput.style.flex = '1';
    const valuesInput = document.createElement('input');
    valuesInput.type = 'text'; valuesInput.placeholder = 'Значения через запятую'; valuesInput.className = 'field-values';
    valuesInput.style.flex = '2';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-field-btn'; removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(nameInput);
    row.appendChild(valuesInput);
    row.appendChild(removeBtn);
    fieldsContainer.appendChild(row);
});
generateJsonBtn.addEventListener('click', () => {
    const fields = [];
    fieldsContainer.querySelectorAll('.field-row').forEach(row => {
        const n = row.querySelector('.field-name').value.trim();
        const v = row.querySelector('.field-values').value.trim();
        if (n && v) fields.push({ name: n, values: v.split(',').map(s => s.trim()) });
    });
    if (!fields.length) { toast('Добавьте хотя бы одно поле.', 'warning'); return; }
    const lengths = fields.map(f => f.values.length);
    if (new Set(lengths).size > 1) { toast('Количество значений во всех полях должно быть одинаковым.', 'error'); return; }
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
    if (r.success) toast(`Файл сохранён: ${r.filePath}`, 'success');
});

// ================== Импорт cURL ==================
function parseCurl(cmd) {
    let c = cmd.replace(/\\\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (!c.startsWith('curl ')) return null;
    c = c.substring(5);
    const tokens = [];
    let current = '', state = 0;
    for (let i = 0; i < c.length; i++) {
        const ch = c[i];
        if (state === 0) {
            if (ch === ' ') {
                if (current) { tokens.push(current); current = ''; }
            } else if (ch === "'") { state = 1; }
            else if (ch === '"') { state = 2; }
            else if (ch === '\\' && i + 1 < c.length) { current += c[++i]; }
            else { current += ch; }
        } else if (state === 1) {
            if (ch === "'") {
                if (i + 1 < c.length && c[i + 1] === "'") { current += "'"; i++; }
                else { state = 0; }
            } else { current += ch; }
        } else if (state === 2) {
            if (ch === '\\' && i + 1 < c.length) { current += c[++i]; }
            else if (ch === '"') { state = 0; }
            else { current += ch; }
        }
    }
    if (current) tokens.push(current);
    const result = { method: 'GET', url: '', headers: {}, body: null };
    let iTok = 0;
    while (iTok < tokens.length) {
        const token = tokens[iTok];
        if (['--location', '--compressed', '--silent', '--insecure'].includes(token)) { iTok++; continue; }
        if (token === '-X' || token === '--request') { if (iTok + 1 < tokens.length) { result.method = tokens[iTok + 1].toUpperCase(); iTok += 2; } else iTok++; continue; }
        if (token === '-H' || token === '--header') {
            if (iTok + 1 < tokens.length) {
                const headerStr = tokens[iTok + 1];
                const colonIndex = headerStr.indexOf(':');
                if (colonIndex > 0) { const key = headerStr.substring(0, colonIndex).trim(); const value = headerStr.substring(colonIndex + 1).trim(); if (key) result.headers[key] = value; }
                iTok += 2;
            } else iTok++;
            continue;
        }
        if (['--data', '--data-raw', '-d', '--data-binary'].includes(token)) { if (iTok + 1 < tokens.length) { result.body = tokens[iTok + 1]; iTok += 2; } else iTok++; continue; }
        if (!token.startsWith('-')) { result.url = token; iTok++; continue; }
        if (iTok + 1 < tokens.length && !tokens[iTok + 1].startsWith('-')) { iTok += 2; } else iTok++;
    }
    return result;
}
importCurlBtn.addEventListener('click', () => {
    if (!activeCollection) { toast('Сначала выберите коллекцию.', 'warning'); return; }
    document.getElementById('curlInput').value = '';
    document.getElementById('curlModal').classList.add('active');
});
document.getElementById('closeCurlModalBtn').addEventListener('click', () => document.getElementById('curlModal').classList.remove('active'));
document.getElementById('parseCurlBtn').addEventListener('click', () => {
    const txt2 = document.getElementById('curlInput').value.trim();
    if (!txt2) { toast('Введите команду cURL', 'warning'); return; }
    const p = parseCurl(txt2);
    if (!p) { toast('Не удалось распознать cURL', 'error'); return; }
    const newStep = {
        name: '', url: p.url, method: p.method,
        contentType: p.headers['Content-Type'] || 'application/json',
        auth: p.headers['Authorization'] || '',
        body: p.body || '',
        customHeaders: {}
    };
    delete p.headers['Authorization']; delete p.headers['Content-Type'];
    newStep.customHeaders = p.headers;
    activeCollection.steps.push(newStep);
    saveData(); renderSteps();
    document.getElementById('curlModal').classList.remove('active');
    toast('Шаг импортирован из cURL', 'success');
});

// ================== Кнопки папок и коллекций ==================
newRootCollectionBtn.addEventListener('click', async () => {
    const newCol = {
        id: generateUniqueId(),
        name: 'Новая коллекция',
        steps: [],
        folderId: null,
    };
    data.collections.push(newCol);
    await saveData();
    selectCollection(newCol.id);
    renderTree();
});

newFolderBtn.addEventListener('click', async () => {
    const name = await showInputModal('Название папки', 'Новая папка');
    if (name) {
        data.folders.push({ id: generateUniqueId(), name, parentId: null, collapsed: false });
        await saveData();
        renderTree();
        toast('Папка создана', 'success');
    }
});

addStepBtn.addEventListener('click', () => {
    if (!activeCollection) return;
    activeCollection.steps.push({ name: '', url: '', method: 'GET', contentType: 'application/json', auth: '', body: '', customHeaders: {} });
    saveData();
    renderSteps();
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

// ================== Горячие клавиши ==================
document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        await saveData();
        toast('Сохранено', 'success', 1500);
    }
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        currentStepForSend = null;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (sendRequestModal.classList.contains('active')) {
            sendSingleBtn.click();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        newRootCollectionBtn.click();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
});

window.addEventListener('beforeunload', () => {
    if (activeCollectionId) {
        cleanupEmptyCollection(activeCollectionId);
    }
});

// Старт
loadData();
showEmptyState();