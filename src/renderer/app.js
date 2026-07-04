import { escapeHtml, txt, debounce, cachedJsonParse } from './utils.js';
import { collectionRelevance } from './search.js';
import { formatJSON, parseJsonValue, repairJsonText } from './jsonFormat.js';
import { parseCurl } from './curlParser.js';
import { countPostmanRequests } from './postman.js';

let data = { folders: [], collections: [], environments: [] };
let activeCollectionId = null;
let activeCollection = null;
let openTabs = []; // Array of { id, name }
let searchQuery = '';
let searchExpandedFolders = new Set();
let currentStepForSend = null;
let fullHistory = [];
let sidebarWidth = 260;
const OPEN_TABS_LIMIT_KEY = 'ab-runner-open-tabs-limit';
const DEFAULT_OPEN_TABS_LIMIT = 10;
const MIN_OPEN_TABS_LIMIT = 1;
const MAX_OPEN_TABS_LIMIT = 30;
let openTabsLimit = readOpenTabsLimit();

// ================== DOM Elements ==================
const treeContainer = document.getElementById('treeContainer');
const workspaceTabsBar = document.getElementById('workspaceTabsBar');
const workspaceTabsTitle = document.getElementById('workspaceTabsTitle');
const workspaceTabsLimitInput = document.getElementById('workspaceTabsLimitInput');
const collectionTabsEl = document.getElementById('collectionTabs');
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
const stopCollectionBtn = document.getElementById('stopCollectionBtn');
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
const appVersionBadge = document.getElementById('appVersionBadge');

// Environments & Right Panel
const environmentSelect = document.getElementById('environmentSelect');
const manageEnvBtnGlobal = document.getElementById('manageEnvBtnGlobal');
const envManagerModal = document.getElementById('envManagerModal');
const envListContainer = document.getElementById('envListContainer');
const newEnvNameInput = document.getElementById('newEnvNameInput');
const envSearchInput = document.getElementById('envSearchInput');
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
const jsonPreviewContent = document.getElementById('jsonPreviewContent');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const curlModal = document.getElementById('curlModal');
const curlInput = document.getElementById('curlInput');
const closeCurlModalBtn = document.getElementById('closeCurlModalBtn');
const parseCurlBtn = document.getElementById('parseCurlBtn');

// Import Dropdown
const globalImportBtn = document.getElementById('globalImportBtn');
const importDropdownMenu = document.getElementById('importDropdownMenu');
const importFilesBtn = document.getElementById('importFilesBtn');
const importFolderBtn = document.getElementById('importFolderBtn');
const appDataBtn = document.getElementById('appDataBtn');
const appDataMenu = document.getElementById('appDataMenu');
const exportAppDataBtn = document.getElementById('exportAppDataBtn');
const importAppDataBtn = document.getElementById('importAppDataBtn');

// ================== CodeMirror ==================
const activeEditors = new Map();

if (workspaceTabsLimitInput) {
  workspaceTabsLimitInput.value = String(openTabsLimit);
  workspaceTabsLimitInput.addEventListener('change', () => setOpenTabsLimit(workspaceTabsLimitInput.value));
  workspaceTabsLimitInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      workspaceTabsLimitInput.blur();
    }
  });
}

function createCodeMirrorEditor(textarea, initialValue = '', mode = 'javascript', height = '180px') {
  const editorValue = initialValue == null || initialValue === 'undefined' ? '' : String(initialValue);
  textarea.value = editorValue;
  const wrapper = document.createElement('div');
  wrapper.className = 'cm-wrapper';
  if (typeof CodeMirror === 'undefined') {
    textarea.style.display = '';
    wrapper.appendChild(textarea);
    return { wrapper, editor: null };
  }
  const currentTheme = localStorage.getItem('ab-runner-theme') || 'dark';
  const editor = CodeMirror(wrapper, {
    value: editorValue,
    mode: mode,
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
      'Ctrl-/': (cm) => {
        cm.toggleComment({ line: '//', block: ['/*', '*/'], indent: false, padding: ' ', fullLines: true });
        return false;
      },
      'Cmd-/': (cm) => {
        cm.toggleComment({ line: '//', block: ['/*', '*/'], indent: false, padding: ' ', fullLines: true });
        return false;
      },
      'Ctrl-F': 'findPersistent',
      'Cmd-F': 'findPersistent',
    },
  });
  editor.on('change', () => {
    textarea.value = editor.getValue();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  editor.setSize('100%', height);
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

function formatCurrentEditor(editorId) {
  const info = activeEditors.get(editorId);
  if (!info || !info.editor) {
    toast('Редактор не найден', 'error');
    return;
  }

  const text = info.editor.getValue();
  if (!text.trim()) {
    toast('Нечего форматировать', 'warning');
    return;
  }

  try {
    const formatted = formatJSON(text);

    // Проверяем, что форматтер не сломал данные
    if (!formatted || formatted.trim().length === 0) {
      toast('Форматирование вернуло пустой результат', 'error');
      return;
    }

    info.editor.setValue(formatted);

    // Сохраняем в step.body
    const step = activeCollection?.steps?.find((_, i) => {
      const eid = 'cm-raw-' + i;
      return editorId.startsWith(eid);
    });
    if (step) {
      step.body = formatted;
      debouncedSave();
    }

    toast('JSON отформатирован', 'success');
  } catch (e) {
    toast('Ошибка форматирования: ' + e.message, 'error');
  }
}

// ================== Utilities ==================
function toast(msg, type = 'info', dur = 3000) {
  let c = document.querySelector('.toast-container');
  if (!c) {
    c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, dur);
}
function confirmDialog(title, msg) {
  return new Promise((res) => {
    const d = document.createElement('div');
    d.className = 'confirm-dialog';
    d.innerHTML = `<div class="confirm-dialog-content"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(msg)}</p><div class="confirm-dialog-actions"><button class="secondary cancel-btn">Отмена</button><button class="danger ok-btn">OK</button></div></div>`;
    document.body.appendChild(d);
    const cleanup = (r) => {
      d.classList.remove('show');
      setTimeout(() => d.remove(), 200);
      res(r);
    };
    d.querySelector('.ok-btn').onclick = () => cleanup(true);
    d.querySelector('.cancel-btn').onclick = () => cleanup(false);
    d.onclick = (e) => {
      if (e.target === d) cleanup(false);
    };
    requestAnimationFrame(() => d.classList.add('show'));
  });
}
function showInputModal(title, def) {
  return new Promise((res) => {
    inputModalTitle.textContent = title;
    inputModalField.value = def || '';
    inputModalField.style.display = 'block';
    inputModal.classList.add('active');
    inputModalField.focus();
    const cleanup = () => {
      inputModal.classList.remove('active');
      inputModalOkBtn.removeEventListener('click', onOk);
      inputModalCancelBtn.removeEventListener('click', onCancel);
      inputModalField.removeEventListener('keydown', onKey);
    };
    const onOk = () => {
      cleanup();
      res(inputModalField.value.trim());
    };
    const onCancel = () => {
      cleanup();
      res(null);
    };
    const onKey = (e) => {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    };
    inputModalOkBtn.addEventListener('click', onOk);
    inputModalCancelBtn.addEventListener('click', onCancel);
    inputModalField.addEventListener('keydown', onKey);
  });
}

function truncateName(name, maxLength = 32) {
  const value = name || 'Без названия';
  return value.length > maxLength ? value.slice(0, maxLength - 3).trimEnd() + '...' : value;
}

function normalizeStepScripts(step) {
  const normalizeScriptConfig = (script) => {
    if (!script || typeof script !== 'object' || Array.isArray(script)) return { code: '', timeout: 5000 };
    const rawCode = script.code;
    const code = rawCode == null || rawCode === 'undefined' ? '' : String(rawCode);
    return { ...script, code, timeout: script.timeout || 5000 };
  };

  step.scripts = {
    prerequest: normalizeScriptConfig(step.scripts?.prerequest),
    postresponse: normalizeScriptConfig(step.scripts?.postresponse),
  };
}

async function renderAppVersion() {
  if (!appVersionBadge || !window.api.getAppVersion) return;
  try {
    const version = await window.api.getAppVersion();
    appVersionBadge.textContent = `v${version}`;
  } catch (e) {
    console.error('Version load error:', e);
  }
}

// ================== Умное сохранение ==================
let saveTimeout = null;
let saveScheduled = false;
let lastSavedJson = ''; // Для проверки реальных изменений

const debouncedSave = () => {
  // Если уже запланировано сохранение — не дублируем
  if (saveScheduled) return;
  saveScheduled = true;

  // Используем requestIdleCallback — сохраняем когда браузер свободен
  if ('requestIdleCallback' in window) {
    requestIdleCallback(doSave, { timeout: 2000 });
  } else {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 800);
  }
};

const doSave = async () => {
  try {
    // КРИТИЧЕСКАЯ ОПТИМИЗАЦИЯ: Проверяем, изменились ли данные
    const currentJson = JSON.stringify(data);
    if (currentJson === lastSavedJson) {
      // Данные не изменились — ничего не сохраняем
      saveScheduled = false;
      return;
    }

    await saveData();
    lastSavedJson = currentJson;

    // Track collection edit
    if (activeCollection && activeCollection.id) {
      window.api.updateRecentCollection(activeCollection.id, 'edited');
    }
  } catch (e) {
    console.error('Save error:', e);
    toast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    saveScheduled = false;
  }
};

// Принудительное сохранение (для важных действий)
const forceSave = async () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveScheduled = false;
  try {
    await saveData();
    lastSavedJson = JSON.stringify(data);
  } catch (e) {
    toast('Ошибка сохранения: ' + e.message, 'error');
  }
};
// ================== Sidebar & Resize ==================
let isResizing = false,
  startX,
  startWidth;
resizer.addEventListener('mousedown', (e) => {
  if (sidebar.style.display === 'none') return;
  isResizing = true;
  startX = e.clientX;
  startWidth = sidebar.offsetWidth;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const w = Math.max(200, Math.min(Math.floor(window.innerWidth * 0.4), startWidth + (e.clientX - startX)));
  sidebar.style.width = w + 'px';
  sidebarWidth = w;
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
    toggleSidebarBtn.textContent = 'Скрыть панель';
    toggleSidebarBtn.classList.remove('show');
  } else {
    sidebar.style.display = 'none';
    resizer.classList.add('hidden');
    sidebarToggleBtn.style.display = 'block';
    toggleSidebarBtn.textContent = 'Показать панель';
    toggleSidebarBtn.classList.add('show');
  }
});
sidebarToggleBtn.addEventListener('click', () => {
  sidebar.style.display = '';
  resizer.classList.remove('hidden');
  sidebar.style.width = sidebarWidth + 'px';
  sidebarToggleBtn.style.display = 'none';
  toggleSidebarBtn.textContent = '☰ Скрыть панель';
});

// ================== Modals ==================
function setupModalClose() {
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) {
        /* Overlay disabled */
      }
    });
  });
}
document.addEventListener('DOMContentLoaded', setupModalClose);
closeDetailModalBtn.addEventListener('click', () => {
  detailModal.classList.remove('active');
  detailModal.style.zIndex = '';
});
closeSendModalBtn.addEventListener('click', () => {
  sendRequestModal.classList.remove('active');
  currentStepForSend = null;
});
if (closeEnvManagerBtn) closeEnvManagerBtn.addEventListener('click', () => envManagerModal.classList.remove('active'));
if (closeRightPanelBtn) closeRightPanelBtn.addEventListener('click', () => rightPanel.classList.add('hidden'));
if (closeGlobalHistoryBtn)
  closeGlobalHistoryBtn.addEventListener('click', () => {
    globalHistoryModal.classList.remove('active');
    globalHistoryModal.style.zIndex = '';
  });
if (closeClearHistoryModalBtn)
  closeClearHistoryModalBtn.addEventListener('click', () => clearHistoryModal.classList.remove('active'));
if (closeModalBtn) closeModalBtn.addEventListener('click', () => jsonModal.classList.remove('active'));
if (closeCurlModalBtn) closeCurlModalBtn.addEventListener('click', () => curlModal.classList.remove('active'));

// ================== Search ==================
const SEARCH_THRESHOLD = 0.15;
function matchesCollection(col) {
  if (!searchQuery) return true;
  return collectionRelevance(col, searchQuery) > SEARCH_THRESHOLD;
}
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  renderTree();
});

function prepareSearchState() {
  searchExpandedFolders.clear();
  if (!searchQuery) return;
  const folders = data.folders || [];
  data.collections.forEach((col) => {
    if (matchesCollection(col)) {
      let fid = col.folderId;
      while (fid) {
        searchExpandedFolders.add(fid);
        const f = folders.find((x) => x.id === fid);
        fid = f ? f.parentId : null;
      }
    }
  });
  folders.forEach((f) => {
    if (f.name && f.name.toLowerCase().includes(searchQuery)) {
      let fid = f.id;
      while (fid) {
        searchExpandedFolders.add(fid);
        const pf = folders.find((x) => x.id === fid);
        fid = pf ? pf.parentId : null;
      }
    }
  });
}
function isFolderVisibleInSearch(fid) {
  return !searchQuery || searchExpandedFolders.has(fid);
}

// ================== Environments ==================
function ensureEnvironmentShape(env) {
  if (!env.variables) env.variables = [];
  env.variables.forEach((v) => {
    if (v.enabled === undefined) v.enabled = true;
    if (v.key === undefined) v.key = '';
    if (v.value === undefined) v.value = '';
  });
  return env;
}

function getActiveEnvironment() {
  if (!data.activeEnvironmentId || !data.environments) return {};
  const env = data.environments.find((e) => e.id === data.activeEnvironmentId);
  if (!env) return {};
  ensureEnvironmentShape(env);
  const res = {};
  env.variables.forEach((v) => {
    if (v.enabled !== false && v.key) res[v.key] = v.value;
  });
  return res;
}

function getEnvironmentStats(env) {
  ensureEnvironmentShape(env);
  const total = env.variables.length;
  const enabled = env.variables.filter((v) => v.enabled !== false && v.key).length;
  return { total, enabled };
}

function isSecretEnvKey(key) {
  return /(token|secret|password|passwd|pwd|api[_-]?key|authorization|bearer)/i.test(key || '');
}

async function copyToClipboard(text, label = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, 'success', 1200);
  } catch {
    toast('Не удалось скопировать', 'error');
  }
}

function makeEnvActionButton(text, title, onClick, className = 'secondary') {
  const btn = document.createElement('button');
  btn.className = className;
  btn.type = 'button';
  btn.textContent = text;
  btn.title = title;
  btn.onclick = onClick;
  return btn;
}

function updateEnvironmentSelector() {
  if (!data.environments) data.environments = [];
  data.environments.forEach(ensureEnvironmentShape);
  environmentSelect.innerHTML = '<option value="">No Environment</option>';
  data.environments.forEach((env) => {
    const stats = getEnvironmentStats(env);
    const o = document.createElement('option');
    o.value = env.id;
    o.textContent = `${env.name} (${stats.enabled}/${stats.total})`;
    environmentSelect.appendChild(o);
  });
  if (data.activeEnvironmentId && data.environments.some((e) => e.id === data.activeEnvironmentId))
    environmentSelect.value = data.activeEnvironmentId;
}

environmentSelect.addEventListener('change', () => {
  data.activeEnvironmentId = environmentSelect.value || null;
  saveData();
  renderRightPanel();
  toast(`Окружение: ${environmentSelect.options[environmentSelect.selectedIndex].text}`, 'info', 1500);
});

// Right Panel
if (toggleRightPanelBtn) toggleRightPanelBtn.addEventListener('click', () => rightPanel.classList.toggle('hidden'));
function renderRightPanel() {
  if (!envVarsContainer) return;
  envVarsContainer.innerHTML = '';
  const envId = data.activeEnvironmentId;
  if (!envId || !data.environments) {
    const empty = document.createElement('div');
    empty.className = 'empty-env-msg';
    empty.innerHTML = '<strong>Окружение не выбрано</strong><span>Выберите его слева или создайте новое.</span>';
    empty.appendChild(
      makeEnvActionButton('+ Создать окружение', 'Создать окружение', () => {
        envManagerModal.classList.add('active');
        newEnvNameInput?.focus();
      }),
    );
    envVarsContainer.appendChild(empty);
    return;
  }
  const env = data.environments.find((e) => e.id === envId);
  if (!env) {
    envVarsContainer.innerHTML = '<div class="empty-env-msg">Окружение не найдено</div>';
    return;
  }
  ensureEnvironmentShape(env);

  const stats = getEnvironmentStats(env);
  const head = document.createElement('div');
  head.className = 'env-panel-summary';
  const title = document.createElement('div');
  title.className = 'env-panel-title';
  title.append(txt('strong', env.name));
  title.append(txt('span', `${stats.enabled} активных из ${stats.total}`));
  const actions = document.createElement('div');
  actions.className = 'env-panel-actions';
  actions.append(
    makeEnvActionButton('+', 'Добавить переменную', () => addEnvironmentVariable(env)),
    makeEnvActionButton('⚙', 'Открыть менеджер окружений', () => {
      renderEnvList();
      envManagerModal.classList.add('active');
    }),
  );
  head.append(title, actions);
  envVarsContainer.appendChild(head);

  if (!env.variables.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-env-msg compact';
    empty.textContent = 'В этом окружении пока нет переменных.';
    envVarsContainer.appendChild(empty);
  }

  env.variables.forEach((v, idx) => {
    const row = document.createElement('div');
    row.className = `env-var-row${v.enabled === false ? ' disabled' : ''}`;
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'env-var-enabled';
    enabled.checked = v.enabled !== false;
    enabled.title = 'Включить переменную';
    enabled.onchange = () => {
      env.variables[idx].enabled = enabled.checked;
      saveData();
      renderRightPanel();
      updateEnvironmentSelector();
    };
    const kIn = document.createElement('input');
    kIn.className = 'env-var-key';
    kIn.placeholder = 'Ключ';
    kIn.value = v.key || '';
    kIn.addEventListener(
      'input',
      debounce(() => {
        env.variables[idx].key = kIn.value.trim();
        saveData();
        updateEnvironmentSelector();
      }, 300),
    );
    const vIn = document.createElement('input');
    vIn.className = 'env-var-value';
    vIn.placeholder = 'Значение';
    vIn.type = isSecretEnvKey(v.key) ? 'password' : 'text';
    vIn.value = v.value || '';
    vIn.addEventListener(
      'input',
      debounce(() => {
        env.variables[idx].value = vIn.value;
        saveData();
      }, 300),
    );
    const copy = makeEnvActionButton('{{}}', `Скопировать {{${v.key || 'key'}}}`, () => {
      if (!env.variables[idx].key) {
        toast('Сначала заполните ключ', 'warning');
        return;
      }
      copyToClipboard(`{{${env.variables[idx].key}}}`, 'Плейсхолдер скопирован');
    });
    copy.className = 'env-var-copy';
    const reveal = makeEnvActionButton('👁', 'Показать/скрыть значение', () => {
      vIn.type = vIn.type === 'password' ? 'text' : 'password';
    });
    reveal.className = 'env-var-copy';
    const rm = document.createElement('button');
    rm.className = 'env-var-remove';
    rm.textContent = '✕';
    rm.title = 'Удалить переменную';
    rm.onclick = () => {
      env.variables.splice(idx, 1);
      saveData();
      renderRightPanel();
      updateEnvironmentSelector();
    };
    const rowActions = document.createElement('div');
    rowActions.className = 'env-var-actions';
    rowActions.appendChild(copy);
    if (isSecretEnvKey(v.key)) rowActions.appendChild(reveal);
    rowActions.appendChild(rm);
    row.append(enabled, kIn, vIn, rowActions);
    envVarsContainer.appendChild(row);
  });
  const add = document.createElement('button');
  add.className = 'add-env-var-btn';
  add.textContent = '+ Добавить переменную';
  add.onclick = () => addEnvironmentVariable(env);
  envVarsContainer.appendChild(add);
}

function addEnvironmentVariable(env) {
  env.variables.push({ key: '', value: '', enabled: true });
  saveData();
  renderRightPanel();
  updateEnvironmentSelector();
  requestAnimationFrame(() => {
    const inputs = envVarsContainer.querySelectorAll('.env-var-key');
    inputs[inputs.length - 1]?.focus();
  });
}

// Env Manager Modal
if (manageEnvBtnGlobal)
  manageEnvBtnGlobal.addEventListener('click', () => {
    renderEnvList();
    envManagerModal.classList.add('active');
    envSearchInput?.focus();
  });
if (envSearchInput) envSearchInput.addEventListener('input', () => renderEnvList());
if (createEnvBtn) createEnvBtn.addEventListener('click', () => createEnvironmentFromInput());
if (newEnvNameInput)
  newEnvNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createEnvironmentFromInput();
  });

function createEnvironmentFromInput() {
  const name = newEnvNameInput.value.trim();
  if (!name) {
    toast('Введите название', 'warning');
    return;
  }
  if ((data.environments || []).some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    toast('Окружение с таким названием уже есть', 'warning');
    return;
  }
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
}

function renderEnvList() {
  if (!envListContainer) return;
  envListContainer.innerHTML = '';
  const q = (envSearchInput?.value || '').trim().toLowerCase();
  const envs = (data.environments || []).filter((env) => {
    ensureEnvironmentShape(env);
    if (!q) return true;
    return (
      (env.name || '').toLowerCase().includes(q) ||
      env.variables.some((v) => (v.key || '').toLowerCase().includes(q) || (v.value || '').toLowerCase().includes(q))
    );
  });
  if (!envs.length) {
    envListContainer.innerHTML = '<div class="empty-env-msg">Окружения не найдены</div>';
    return;
  }
  envs.forEach((env) => {
    const stats = getEnvironmentStats(env);
    const div = document.createElement('div');
    div.className = `env-manager-item${env.id === data.activeEnvironmentId ? ' active' : ''}`;
    const hdr = document.createElement('div');
    hdr.className = 'env-manager-header';
    const ttl = document.createElement('div');
    ttl.className = 'env-manager-title';
    ttl.append(txt('strong', env.name));
    ttl.append(txt('span', `${stats.enabled}/${stats.total} переменных`));
    const acts = document.createElement('div');
    const selectBtn = makeEnvActionButton('Открыть', 'Выбрать и открыть переменные', () => {
      data.activeEnvironmentId = env.id;
      environmentSelect.value = env.id;
      saveData().then(() => {
        renderRightPanel();
        updateEnvironmentSelector();
        renderEnvList();
        rightPanel.classList.remove('hidden');
        toast(`Выбрано: ${env.name}`, 'success');
      });
    });
    const rename = makeEnvActionButton('Переименовать', 'Переименовать окружение', async () => {
      const next = await showInputModal('Новое название окружения', env.name);
      if (!next || next === env.name) return;
      if ((data.environments || []).some((e) => e.id !== env.id && e.name.toLowerCase() === next.toLowerCase())) {
        toast('Окружение с таким названием уже есть', 'warning');
        return;
      }
      env.name = next;
      saveData().then(() => {
        updateEnvironmentSelector();
        renderEnvList();
        renderRightPanel();
        toast('Окружение переименовано', 'success');
      });
    });
    const duplicate = makeEnvActionButton('Дублировать', 'Создать копию окружения', () => {
      const copy = {
        id: generateUniqueId(),
        name: `${env.name} copy`,
        variables: env.variables.map((v) => ({ ...v })),
      };
      data.environments.push(copy);
      data.activeEnvironmentId = copy.id;
      saveData().then(() => {
        updateEnvironmentSelector();
        renderEnvList();
        renderRightPanel();
        rightPanel.classList.remove('hidden');
        toast('Копия окружения создана', 'success');
      });
    });
    const copyAll = makeEnvActionButton('Copy JSON', 'Скопировать переменные как JSON', () => {
      const vars = {};
      env.variables.forEach((v) => {
        if (v.key) vars[v.key] = v.value || '';
      });
      copyToClipboard(JSON.stringify(vars, null, 2), 'JSON окружения скопирован');
    });
    const del = makeEnvActionButton(
      'Удалить',
      'Удалить окружение',
      async () => {
        if (await confirmDialog('Удалить окружение', `Удалить "${env.name}"?`)) {
          data.environments = data.environments.filter((e) => e.id !== env.id);
          if (data.activeEnvironmentId === env.id) {
            data.activeEnvironmentId = null;
            environmentSelect.value = '';
          }
          saveData().then(() => {
            renderEnvList();
            updateEnvironmentSelector();
            renderRightPanel();
          });
        }
      },
      'danger',
    );
    acts.append(selectBtn, rename, duplicate, copyAll, del);
    hdr.append(ttl, acts);
    div.appendChild(hdr);
    const preview = document.createElement('div');
    preview.className = 'env-manager-preview';
    const keys = env.variables
      .filter((v) => v.key)
      .slice(0, 6)
      .map((v) => `{{${v.key}}}`);
    preview.textContent = keys.length ? keys.join('  ') : 'Нет переменных';
    div.appendChild(preview);
    envListContainer.appendChild(div);
  });
}

// ================== Postman Import ==================
async function processPostmanFiles(files) {
  let cols = 0,
    folds = 0;
  files.forEach((fObj) => {
    if (!fObj || !fObj.data) return;
    let json = fObj.data;
    const cleanKeys = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const n = {};
      for (const k in obj) if (obj.hasOwnProperty(k)) n[k.trim()] = cleanKeys(obj[k]);
      return n;
    };
    if (Object.keys(json).some((k) => k !== k.trim())) json = cleanKeys(json);
    if (json.info && json.info.schema && json.item) {
      const rootName = json.info.name || 'Imported Collection';
      let root = data.folders.find((f) => f.name === rootName && f.parentId === null);
      let rootId;
      if (root) rootId = root.id;
      else {
        const nf = { id: generateUniqueId(), name: rootName, parentId: null, collapsed: true };
        data.folders.push(nf);
        rootId = nf.id;
        folds++;
      }
      parsePostmanItems(json.item, rootId);
      cols += countPostmanRequests(json.item);
      if (json.variable?.length) {
        const envN = `${rootName} (Env)`;
        if (!data.environments.some((e) => e.name === envN))
          data.environments.push({
            id: generateUniqueId(),
            name: envN,
            variables: json.variable.map((v) => ({ key: v.key, value: v.value, enabled: true })),
          });
      }
    } else if (json.values && json.name) {
      data.environments.push({
        id: generateUniqueId(),
        name: typeof json.name === 'string' ? json.name.trim() : json.name,
        variables: json.values.map((v) => ({
          key: typeof v.key === 'string' ? v.key.trim() : v.key || '',
          value: typeof v.value === 'string' ? v.value.trim() : v.value || '',
          enabled: v.enabled !== false,
        })),
      });
      toast(`Окружение "${json.name}" импортировано`, 'success');
    } else toast(`Файл "${fObj.fileName}" не распознан`, 'error');
  });
  saveData();
  renderTree();
  updateEnvironmentSelector();
  if (cols || folds) toast(`Импорт: ${folds} папок, ${cols} запросов`, 'success');
}
function parsePostmanItems(items, pId) {
  if (!Array.isArray(items)) return;

  // Вспомогательная функция очистки невидимых символов
  const cleanInvisibleChars = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/[\u200C\u200D\u2060\u2061\u2062\u2063\u2064]/g, '')
      .replace(/[\uFFF0-\uFFFF]/g, '')
      .replace(/[\u00AD]/g, '')
      .replace(/[\u180E]/g, '');
  };

  items.forEach((it) => {
    if (it.item && Array.isArray(it.item)) {
      const nf = { id: generateUniqueId(), name: it.name || 'Folder', parentId: pId, collapsed: true };
      data.folders.push(nf);
      parsePostmanItems(it.item, nf.id);
    } else if (it.request) {
      const req = it.request;
      const step = {
        id: generateStepId(),
        name: cleanInvisibleChars(it.name || ''),
        method: (typeof req.method === 'string' ? req.method : 'GET').toUpperCase(),
        url: '',
        auth: '',
        body: '',
        contentType: 'application/json',
        customHeaders: [],
      };

      // Очищаем URL
      if (typeof req.url === 'string') {
        step.url = cleanInvisibleChars(req.url);
      } else if (req.url?.raw) {
        step.url = cleanInvisibleChars(req.url.raw);
      }

      // Очищаем заголовки
      if (Array.isArray(req.header)) {
        req.header.forEach((h) => {
          if (h.disabled) return;
          const kl = h.key.toLowerCase();
          const cleanKey = cleanInvisibleChars(h.key);
          const cleanValue = cleanInvisibleChars(h.value);

          if (kl === 'authorization') {
            step.auth = cleanValue;
          } else if (kl === 'content-type') {
            step.contentType = cleanValue;
          } else {
            step.customHeaders.push({
              key: cleanKey,
              value: cleanValue,
              enabled: true,
            });
          }
        });
      }

      // Очищаем тело запроса
      if (req.body) {
        if (req.body.mode === 'raw' && req.body.raw) {
          step.body = cleanInvisibleChars(req.body.raw);
        } else if (req.body.mode === 'urlencoded' && Array.isArray(req.body.urlencoded)) {
          const o = {};
          req.body.urlencoded.forEach((u) => {
            if (!u.disabled) {
              o[cleanInvisibleChars(u.key)] = cleanInvisibleChars(u.value);
            }
          });
          step.body = JSON.stringify(o, null, 2);
        } else if (req.body.mode === 'formdata' && Array.isArray(req.body.formdata)) {
          const o = {};
          req.body.formdata.forEach((u) => {
            if (!u.disabled && u.type === 'text') {
              o[cleanInvisibleChars(u.key)] = cleanInvisibleChars(u.value);
            }
          });
          step.body = JSON.stringify(o, null, 2);
        }
      }

      data.collections.push({
        id: generateUniqueId(),
        name: step.name || 'Request',
        steps: [step],
        folderId: pId,
      });
    }
  });
}

// ================== Import Dropdown ==================
if (globalImportBtn) {
  globalImportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    importDropdownMenu.classList.toggle('show');
    appDataMenu?.classList.remove('show');
  });
}
if (appDataBtn) {
  appDataBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    appDataMenu.classList.toggle('show');
    importDropdownMenu?.classList.remove('show');
  });
}
document.addEventListener('click', (e) => {
  if (importDropdownMenu && !importDropdownMenu.contains(e.target) && e.target !== globalImportBtn) {
    importDropdownMenu.classList.remove('show');
  }
  if (appDataMenu && !appDataMenu.contains(e.target) && e.target !== appDataBtn) {
    appDataMenu.classList.remove('show');
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

if (exportAppDataBtn) {
  exportAppDataBtn.addEventListener('click', async () => {
    appDataMenu?.classList.remove('show');
    try {
      await saveData();
      const res = await window.api.exportAppBackup();
      if (res?.success) {
        toast('Backup сохранён', 'success');
      } else if (!res?.cancelled) {
        toast('Ошибка экспорта: ' + (res?.error || 'неизвестная ошибка'), 'error');
      }
    } catch (e) {
      toast('Ошибка экспорта: ' + e.message, 'error');
    }
  });
}

if (importAppDataBtn) {
  importAppDataBtn.addEventListener('click', async () => {
    appDataMenu?.classList.remove('show');
    const ok = await confirmDialog(
      'Восстановить backup',
      'Текущие коллекции, окружения и история будут заменены данными из backup-файла. Продолжить?'
    );
    if (!ok) return;

    try {
      const res = await window.api.importAppBackup();
      if (!res?.success) {
        if (!res?.cancelled) toast('Ошибка импорта: ' + (res?.error || 'неизвестная ошибка'), 'error');
        return;
      }

      activeCollectionId = null;
      activeCollection = null;
      openTabs = [];
      collectionEditorEl.style.display = 'none';
      emptyStateEl.style.display = 'block';
      renderTabs();
      await loadData();
      const c = res.counts || {};
      toast(`Backup восстановлен: ${c.collections || 0} коллекций, ${c.environments || 0} окружений`, 'success');
    } catch (e) {
      toast('Ошибка импорта: ' + e.message, 'error');
    }
  });
}

// ================== Tree Rendering ==================
function renderFolderChildren(folderId, container, level) {
  const folders = data.folders || [],
    collections = data.collections || [];
  folders
    .filter((f) => f.parentId === folderId)
    .forEach((folder) => {
      if (!isFolderVisibleInSearch(folder.id)) return;
      const isExp = searchQuery && searchExpandedFolders.has(folder.id);
      const isCol = isExp ? false : folder.collapsed;
      const div = document.createElement('div');
      div.className = 'folder-item' + (isCol ? ' collapsed' : '');
      div.dataset.folderId = folder.id;
      div.draggable = true;
      div.style.paddingLeft = level * 16 + 'px';
      const nm = txt('span', '📁 ' + (folder.name || 'Без названия'), 'folder-name');
      const acts = document.createElement('div');
      acts.className = 'folder-actions';
      const addB = document.createElement('button');
      addB.className = 'folder-add-collection-btn';
      addB.title = 'Добавить коллекцию';
      addB.textContent = '+';
      const delB = document.createElement('button');
      delB.className = 'delete-folder-btn';
      delB.textContent = '✕';
      acts.append(addB, delB);
      div.append(nm, acts);
      const child = document.createElement('div');
      child.className = 'folder-children' + (isCol ? ' collapsed' : '');
      child.dataset.folderId = folder.id;
      container.append(div, child);
      renderFolderContents(folder.id, child, level + 1);
      div.addEventListener('click', (e) => {
        if (
          e.target.classList.contains('delete-folder-btn') ||
          e.target.classList.contains('folder-add-collection-btn')
        )
          return;

        // При поиске не трогаем папки
        if (searchQuery && searchExpandedFolders.has(folder.id)) return;

        // ОПТИМИЗАЦИЯ: toggle БЕЗ ререндера всего дерева
        folder.collapsed = !folder.collapsed;

        // Toggle классов напрямую (быстро)
        div.classList.toggle('collapsed', folder.collapsed);
        const childEl = div.nextElementSibling; // folder-children
        if (childEl && childEl.classList.contains('folder-children')) {
          childEl.classList.toggle('collapsed', folder.collapsed);
        }

        // Сохраняем в фоне через requestIdleCallback
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => saveData());
        } else {
          setTimeout(() => saveData(), 100);
        }
      });
      div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', 'folder:' + folder.id);
        e.dataTransfer.effectAllowed = 'move';
        div.classList.add('dragging');
      });
      div.addEventListener('dragend', () => div.classList.remove('dragging'));
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.dataTransfer.types.includes('text/plain')) return;
        div.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
      });
      div.addEventListener('dragleave', (e) => {
        if (!div.contains(e.relatedTarget)) div.classList.remove('drag-over');
      });
      div.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        div.classList.remove('drag-over');
        const d = e.dataTransfer.getData('text/plain');
        if (d === 'folder:' + folder.id) return;
        handleDropOnFolder(d, folder.id);
      });
      child.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.dataTransfer.types.includes('text/plain')) return;
        child.classList.add('drag-over');
        div.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
      });
      child.addEventListener('dragleave', (e) => {
        if (!child.contains(e.relatedTarget)) {
          child.classList.remove('drag-over');
          div.classList.remove('drag-over');
        }
      });
      child.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        child.classList.remove('drag-over');
        div.classList.remove('drag-over');
        const d = e.dataTransfer.getData('text/plain');
        if (d === 'folder:' + folder.id) return;
        handleDropOnFolder(d, folder.id);
      });
      delB.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await confirmDialog('Удалить папку', `Удалить "${folder.name}" и всё содержимое?`)) {
          const toDel = [];
          const collect = (pid) => {
            data.folders
              .filter((f) => f.parentId === pid)
              .forEach((f) => {
                toDel.push(f.id);
                collect(f.id);
              });
          };
          collect(folder.id);
          const ids = [folder.id, ...toDel];

          const collectionsInFolders = data.collections.filter((c) => ids.includes(c.folderId));
          const collectionIdsInFolders = collectionsInFolders.map((c) => c.id);

          data.collections = data.collections.filter((c) => !ids.includes(c.folderId));
          data.folders = data.folders.filter((f) => !ids.includes(f.id));

          // Remove closed collections from tabs
          openTabs = openTabs.filter((t) => !collectionIdsInFolders.includes(t.id));
          renderTabs();

          if (activeCollectionId && collectionIdsInFolders.includes(activeCollectionId)) {
            if (openTabs.length > 0) {
              selectCollection(openTabs[0].id);
            } else {
              activeCollectionId = null;
              activeCollection = null;
              showEmptyState();
            }
          }
          await saveData();
          renderTree();
          toast('Папка удалена', 'success');
        }
      });
      addB.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nc = { id: generateUniqueId(), name: 'Новая коллекция', steps: [], folderId: folder.id };
        data.collections.push(nc);
        await saveData();
        selectCollection(nc.id);
        renderTree();
      });
    });
  const filteredCollections = collections
    .filter((c) => c.folderId === folderId && matchesCollection(c))
    .map((col) => ({ col, score: collectionRelevance(col, searchQuery) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.col);
  filteredCollections.forEach((col) => renderCollectionItem(col, container, level + 1));
}
function handleDropOnFolder(d, target) {
  if (!d) return;
  if (d.startsWith('col:')) moveCollectionToFolder(d.slice(4), target);
  else if (d.startsWith('folder:')) {
    const fid = d.slice(7);
    if (fid !== target && !isDescendant(target, fid)) moveFolderToFolder(fid, target);
  }
}
function isDescendant(fid, anc) {
  const f = data.folders.find((x) => x.id === fid);
  if (!f) return false;
  if (f.parentId === anc) return true;
  if (!f.parentId) return false;
  return isDescendant(f.parentId, anc);
}
function renderFolderContents(fid, c, l) {
  renderFolderChildren(fid, c, l);
}

let treeListeners = false;
function renderTree() {
  prepareSearchState();
  treeContainer.innerHTML = '';
  if (searchQuery) {
    renderSearchResults();
  } else {
    renderFolderChildren(null, treeContainer, 0);
  }
  if (!treeListeners) {
    treeListeners = true;
    treeContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      treeContainer.classList.add('drag-over-root');
      e.dataTransfer.dropEffect = 'move';
    });
    treeContainer.addEventListener('dragleave', (e) => {
      if (!treeContainer.contains(e.relatedTarget)) treeContainer.classList.remove('drag-over-root');
    });
    treeContainer.addEventListener('drop', (e) => {
      if (e.target === treeContainer) {
        e.preventDefault();
        treeContainer.classList.remove('drag-over-root');
        const d = e.dataTransfer.getData('text/plain');
        if (d.startsWith('col:')) moveCollectionToFolder(d.slice(4), null);
        else if (d.startsWith('folder:')) moveFolderToFolder(d.slice(7), null);
      }
    });
  }
}
function renderSearchResults() {
  const allCollections = data.collections || [];
  const folders = data.folders || [];
  const results = allCollections
    .filter((col) => matchesCollection(col))
    .map((col) => {
      let folderPath = '';
      let currentFolderId = col.folderId;
      const pathParts = [];
      while (currentFolderId) {
        const folder = folders.find((f) => f.id === currentFolderId);
        if (folder) {
          pathParts.unshift(folder.name);
          currentFolderId = folder.parentId;
        } else break;
      }
      folderPath = pathParts.join(' / ');
      return { col, score: collectionRelevance(col, searchQuery), folderPath };
    })
    .sort((a, b) => b.score - a.score);
  results.forEach((result) => renderCollectionItemWithFolder(result.col, treeContainer, result.folderPath));
}
function renderCollectionItemWithFolder(col, container, folderPath) {
  const div = document.createElement('div');
  div.className = `collection-item search-result${activeCollectionId === col.id ? ' active' : ''}`;
  div.dataset.collectionId = col.id;
  div.draggable = true;
  const nm = document.createElement('span');
  nm.className = 'collection-name';
  nm.title = col.name || 'Без названия';
  const badge = getCollectionMethodBadge(col);
  if (badge) {
    const b = document.createElement('span');
    b.className = 'method-badge';
    b.dataset.method = badge === 'MIX' ? '' : badge;
    b.textContent = badge;
    nm.append(b, document.createTextNode(' '));
  }
  const icon = getCollectionIcon(col);
  if (icon) nm.appendChild(document.createTextNode(icon + ' '));
  nm.appendChild(document.createTextNode(truncateName(col.name)));
  const del = document.createElement('button');
  del.className = 'delete-collection-btn';
  del.textContent = '✕';
  div.append(nm, del);
  if (folderPath) {
    const pathLabel = document.createElement('div');
    pathLabel.className = 'search-folder-path';
    pathLabel.textContent = folderPath;
    div.appendChild(pathLabel);
  }
  div.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-collection-btn')) return;
    if (div.classList.contains('search-result')) {
      searchQuery = '';
      searchInput.value = '';
      expandParentsOf(col.id);
      saveData().then(() => {
        selectCollection(col.id);
        setTimeout(() => {
          const activeItem = document.querySelector(`.collection-item[data-collection-id="${col.id}"]`);
          if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            activeItem.classList.add('highlight-pulse');
            setTimeout(() => activeItem.classList.remove('highlight-pulse'), 1500);
          }
        }, 50);
      });
    } else {
      selectCollection(col.id);
    }
  });
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (await confirmDialog('Удалить коллекцию', 'Удалить эту коллекцию?')) {
      data.collections = data.collections.filter((c) => c.id !== col.id);

      // Remove from tabs if present
      const tabIdx = openTabs.findIndex((t) => t.id === col.id);
      if (tabIdx !== -1) {
        openTabs.splice(tabIdx, 1);
        renderTabs();
      }

      if (activeCollectionId === col.id) {
        if (openTabs.length > 0) {
          const nextTab = openTabs[Math.min(tabIdx, openTabs.length - 1)];
          selectCollection(nextTab.id);
        } else {
          activeCollectionId = null;
          activeCollection = null;
          showEmptyState();
        }
      }
      saveData();
      renderTree();
      toast('Коллекция удалена', 'success');
    }
  });
  nm.addEventListener('dblclick', async (e) => {
    e.stopPropagation();
    const n = await showInputModal('Новое название', col.name);
    if (n) {
      col.name = n;
      await saveData();
      renderTree();
      if (activeCollectionId === col.id) collectionNameInput.value = col.name;
      toast('Переименовано', 'success');
    }
  });
  div.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', 'col:' + col.id);
    e.dataTransfer.effectAllowed = 'move';
    div.classList.add('dragging');
  });
  div.addEventListener('dragend', () => div.classList.remove('dragging'));
  container.appendChild(div);
}
function renderCollectionItem(col, container, lvl) {
  const div = document.createElement('div');
  div.className = `collection-item${activeCollectionId === col.id ? ' active' : ''}`;
  div.dataset.collectionId = col.id;
  div.draggable = true;
  div.style.paddingLeft = lvl * 16 + 'px';
  const nm = document.createElement('span');
  nm.className = 'collection-name';
  nm.title = col.name || 'Без названия';
  const badge = getCollectionMethodBadge(col);
  if (badge) {
    const b = document.createElement('span');
    b.className = 'method-badge';
    b.dataset.method = badge === 'MIX' ? '' : badge;
    b.textContent = badge;
    nm.append(b, document.createTextNode(' '));
  }
  const icon = getCollectionIcon(col);
  if (icon) nm.appendChild(document.createTextNode(icon + ' '));
  nm.appendChild(document.createTextNode(truncateName(col.name)));
  const del = document.createElement('button');
  del.className = 'delete-collection-btn';
  del.textContent = '✕';
  div.append(nm, del);
  div.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-collection-btn')) return;
    selectCollection(col.id);
  });
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (await confirmDialog('Удалить коллекцию', 'Удалить эту коллекцию?')) {
      data.collections = data.collections.filter((c) => c.id !== col.id);
      if (activeCollectionId === col.id) {
        activeCollectionId = null;
        activeCollection = null;
        showEmptyState();
      }
      saveData();
      renderTree();
      toast('Коллекция удалена', 'success');
    }
  });
  nm.addEventListener('dblclick', async (e) => {
    e.stopPropagation();
    const n = await showInputModal('Новое название', col.name);
    if (n) {
      col.name = n;
      await saveData();
      renderTree();
      if (activeCollectionId === col.id) collectionNameInput.value = col.name;
      toast('Переименовано', 'success');
    }
  });
  div.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', 'col:' + col.id);
    e.dataTransfer.effectAllowed = 'move';
    div.classList.add('dragging');
  });
  div.addEventListener('dragend', () => div.classList.remove('dragging'));
  container.appendChild(div);
}
async function moveCollectionToFolder(cid, fid) {
  const c = data.collections.find((x) => x.id === cid);
  if (c) {
    c.folderId = fid;
    await saveData();
    renderTree();
  }
}
async function moveFolderToFolder(fid, pid) {
  const f = data.folders.find((x) => x.id === fid);
  if (f && fid !== pid) {
    f.parentId = pid;
    await saveData();
    renderTree();
  }
}
function cleanupEmptyCollection(cid) {
  const c = data.collections.find((x) => x.id === cid);
  if (!c) return;
  if (!c.steps?.length && (!c.name || c.name === 'Новая коллекция') && !c.results?.length) {
    data.collections = data.collections.filter((x) => x.id !== cid);
    saveData();
  }
}
function expandParentsOf(collectionId) {
  const col = data.collections.find((c) => c.id === collectionId);
  if (!col) return;
  let currentFolderId = col.folderId;
  const folders = data.folders || [];
  while (currentFolderId) {
    const folder = folders.find((f) => f.id === currentFolderId);
    if (folder) {
      folder.collapsed = false;
      currentFolderId = folder.parentId;
    } else break;
  }
}

function clampOpenTabsLimit(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_OPEN_TABS_LIMIT;
  return Math.min(MAX_OPEN_TABS_LIMIT, Math.max(MIN_OPEN_TABS_LIMIT, n));
}

function readOpenTabsLimit() {
  return clampOpenTabsLimit(localStorage.getItem(OPEN_TABS_LIMIT_KEY));
}

function setOpenTabsLimit(value) {
  openTabsLimit = clampOpenTabsLimit(value);
  localStorage.setItem(OPEN_TABS_LIMIT_KEY, String(openTabsLimit));
  if (workspaceTabsLimitInput) workspaceTabsLimitInput.value = String(openTabsLimit);
  limitOpenTabs();
  renderTabs();
}

function limitOpenTabs() {
  while (openTabs.length > openTabsLimit) {
    const removableIndex = openTabs.findIndex((tab) => tab.id !== activeCollectionId);
    openTabs.splice(removableIndex === -1 ? 0 : removableIndex, 1);
  }
}

function selectCollection(id) {
  const prev = activeCollectionId;
  if (prev && prev !== id) cleanupEmptyCollection(prev);
  activeCollectionId = id;
  activeCollection = data.collections.find((c) => c.id === id);
  if (!activeCollection) return;

  // Add to tabs if not already there
  if (!openTabs.find((t) => t.id === id)) {
    openTabs.push({ id: activeCollection.id, name: activeCollection.name });
  }
  limitOpenTabs();

  // Track collection view
  window.api.updateRecentCollection(activeCollection.id, 'viewed');

  renderCollectionEditor();
  renderTabs();
  renderTree();
}

function renderTabs() {
  if (!collectionTabsEl) return;
  collectionTabsEl.innerHTML = '';
  limitOpenTabs();

  if (workspaceTabsTitle) {
    workspaceTabsTitle.textContent = `Открытые запросы ${openTabs.length}/${openTabsLimit}`;
  }

  if (openTabs.length === 0) {
    if (workspaceTabsBar) workspaceTabsBar.style.display = 'none';
    return;
  }
  if (workspaceTabsBar) workspaceTabsBar.style.display = 'flex';
  collectionTabsEl.style.display = 'flex';

  openTabs.forEach((tab) => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab-item${activeCollectionId === tab.id ? ' active' : ''}`;
    tabEl.title = tab.name || 'Без названия';
    tabEl.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    tabEl.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'tab-name';
    nameEl.textContent = truncateName(tab.name);
    nameEl.onclick = () => selectCollection(tab.id);

    const closeEl = document.createElement('span');
    closeEl.className = 'tab-close';
    closeEl.textContent = '✕';
    closeEl.onclick = (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    };

    tabEl.append(nameEl, closeEl);
    collectionTabsEl.appendChild(tabEl);
  });
}

function closeTab(id) {
  const index = openTabs.findIndex((t) => t.id === id);
  if (index === -1) return;

  openTabs.splice(index, 1);

  if (activeCollectionId === id) {
    if (openTabs.length > 0) {
      const nextTab = openTabs[Math.min(index, openTabs.length - 1)];
      selectCollection(nextTab.id);
    } else {
      activeCollectionId = null;
      activeCollection = null;
      showEmptyState();
      renderTabs();
      renderTree();
    }
  } else {
    renderTabs();
  }
}
function showEmptyState() {
  collectionEditorEl.style.display = 'none';
  emptyStateEl.style.display = 'block';
}
function renderCollectionEditor() {
  emptyStateEl.style.display = 'none';
  collectionEditorEl.style.display = 'block';
  collectionNameInput.value = activeCollection.name || '';
  collectionNameInput.oninput = () => {
    activeCollection.name = collectionNameInput.value.trim() || 'Без названия';
    // Update tab name if open
    const tab = openTabs.find((t) => t.id === activeCollection.id);
    if (tab) tab.name = activeCollection.name;
    renderTabs();

    debouncedSave();
    renderTree();
  };
  if (activeCollection.results) renderRunnerTable(activeCollection.results);
  else runnerResultsBody.innerHTML = '';
  tabBtns.forEach((b) => b.classList.remove('active'));
  document.querySelector('[data-tab="runner"]').classList.add('active');
  runnerTab.style.display = 'block';
  historyTab.style.display = 'none';
  renderSteps();
}
function getCollectionIcon(c) {
  return !c.steps || !c.steps.length ? '' : '📄';
}
function getCollectionMethodBadge(c) {
  if (!c.steps || !c.steps.length) return null;
  const m = [...new Set(c.steps.map((s) => s.method).filter(Boolean))];
  return m.length === 1 ? m[0] : m.length > 1 ? 'MIX' : null;
}
function generateUniqueId() {
  let id = Date.now().toString();
  while (data.collections.some((c) => c.id === id) || data.folders.some((f) => f.id === id))
    id += '-' + Math.random().toString(36).slice(2, 7);
  return id;
}
// Step ids must be unique across every collection's steps (used to reference a
// login step for pre-request token chaining).
function generateStepId() {
  const used = new Set();
  (data.collections || []).forEach((c) => (c.steps || []).forEach((s) => s.id && used.add(s.id)));
  let id = 's-' + Date.now().toString(36);
  while (used.has(id)) id += Math.random().toString(36).slice(2, 5);
  return id;
}

// ================== Steps ==================
function renderSteps() {
  destroyAllEditors();

  stepsContainer.innerHTML = '';
  if (!activeCollection) return;
  if (!activeCollection.steps) activeCollection.steps = [];

  // Используем DocumentFragment для батч-вставки (быстрее)
  const fragment = document.createDocumentFragment();
  activeCollection.steps.forEach((s, i) => {
    fragment.appendChild(createStepCard(s, i));
  });
  stepsContainer.appendChild(fragment);

  // Refresh всех редакторов одним батчем
  requestAnimationFrame(() => {
    activeEditors.forEach(({ editor }) => {
      if (editor) editor.refresh();
    });
  });
}
function createStepCard(step, idx) {
  const card = document.createElement('div');
  card.className = 'step-card';
  card.dataset.index = idx;

  // ================== Header ==================
  const hdr = document.createElement('div');
  hdr.className = 'step-header';
  const stepTitle = step.name || `Шаг ${idx + 1}`;
  const nm = txt('span', truncateName(stepTitle, 48), 'step-name');
  nm.title = stepTitle;
  const acts = document.createElement('div');
  acts.className = 'step-actions';

  const sendB = document.createElement('button');
  sendB.className = 'send-btn';
  sendB.textContent = '▶ Send';
  sendB.onclick = () => openSendModal(step);

  const curlB = document.createElement('button');
  curlB.className = 'curl-import-btn';
  curlB.textContent = '📋 cURL';
  curlB.title = 'Импорт cURL';
  curlB.onclick = () => importStepFromCurl(step, idx);

  const delB = document.createElement('button');
  delB.className = 'danger';
  delB.style.cssText = 'padding:2px 8px;font-size:12px;';
  delB.textContent = 'Удалить';
  delB.onclick = async () => {
    if (await confirmDialog('Удалить шаг', 'Удалить этот шаг?')) {
      activeCollection.steps.splice(idx, 1);
      saveData();
      renderSteps();
      toast('Шаг удалён', 'success');
    }
  };

  acts.append(sendB, curlB, delB);
  hdr.append(nm, acts);
  card.appendChild(hdr);

  // ================== Name ==================
  const nf = document.createElement('div');
  nf.className = 'field';
  nf.appendChild(txt('label', 'Название шага'));
  const ni = document.createElement('input');
  ni.type = 'text';
  ni.className = 'step-name-input';
  ni.value = step.name || '';
  ni.placeholder = 'Например: Логин';
  nf.appendChild(ni);
  card.appendChild(nf);

  // ================== URL + Method ==================
  const umr = document.createElement('div');
  umr.className = 'url-method-row';

  const mf = document.createElement('div');
  mf.className = 'field';
  mf.appendChild(txt('label', 'Метод'));
  const md = document.createElement('div');
  md.className = 'method-dropdown';
  md.dataset.method = step.method || 'GET';
  const ms = document.createElement('div');
  ms.className = 'method-selected';
  ms.textContent = step.method || 'GET';
  const mo = document.createElement('div');
  mo.className = 'method-options';
  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach((m) => {
    const o = document.createElement('div');
    o.className = 'method-option';
    o.dataset.method = m;
    o.textContent = m;
    if (m === step.method) o.classList.add('selected');
    o.onclick = () => {
      ms.textContent = m;
      md.dataset.method = m;
      mo.querySelectorAll('.method-option').forEach((x) => x.classList.remove('selected'));
      o.classList.add('selected');
      md.classList.remove('open');
      md.dispatchEvent(new Event('input', { bubbles: true }));
    };
    mo.appendChild(o);
  });
  ms.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.method-dropdown.open').forEach((d) => {
      if (d !== md) d.classList.remove('open');
    });
    md.classList.toggle('open');
  };
  md.append(ms, mo);
  Object.defineProperty(md, 'value', { get: () => md.dataset.method });
  mf.appendChild(md);
  umr.appendChild(mf);

  const uf = document.createElement('div');
  uf.className = 'field';
  uf.appendChild(txt('label', 'URL'));
  const ui = document.createElement('input');
  ui.type = 'text';
  ui.className = 'step-url';
  ui.value = step.url || '';
  ui.placeholder = 'http://api.example.com/{{id}}';
  uf.appendChild(ui);
  umr.appendChild(uf);
  card.appendChild(umr);

  // ================== Tabs ==================
  const tc = document.createElement('div');
  tc.className = 'step-tabs';
  const tb = {},
    tbc = {};
  const crt = (id, lbl) => {
    const b = document.createElement('button');
    b.className = 'step-tab-btn';
    b.textContent = lbl;
    b.dataset.tab = id;
    const c = document.createElement('div');
    c.className = 'step-tab-content';
    c.dataset.tab = id;
    tb[id] = b;
    tbc[id] = c;
    tc.appendChild(b);
    return { b, c };
  };
  crt('headers', 'Headers');
  crt('auth', 'Authorization');
  crt('body', 'Body');
  crt('scripts', 'Scripts');
  card.appendChild(tc);

  Object.keys(tb).forEach((id) => {
    tb[id].onclick = () => {
      Object.values(tb).forEach((x) => x.classList.remove('active'));
      Object.values(tbc).forEach((x) => x.classList.remove('active'));
      tb[id].classList.add('active');
      tbc[id].classList.add('active');
      if (id === 'body') {
        requestAnimationFrame(() => {
          activeEditors.forEach(({ editor }) => {
            if (editor) editor.refresh();
          });
        });
      }
    };
  });
  tb.headers.classList.add('active');
  tbc.headers.classList.add('active');

  // ================== Headers Tab ==================
  let hArr = step.customHeaders;
  if (!Array.isArray(hArr)) {
    hArr =
      hArr && typeof hArr === 'object'
        ? Object.entries(hArr).map(([k, v]) => ({ key: k, value: String(v), enabled: true }))
        : [];
  }
  step.customHeaders = hArr;

  const ht = document.createElement('table');
  ht.className = 'headers-table';
  ht.innerHTML = `<thead><tr><th class="header-enabled"></th><th class="header-key">Ключ</th><th class="header-value">Значение</th><th class="header-actions"></th></tr></thead>`;
  const tbody = document.createElement('tbody');
  ht.appendChild(tbody);

  const dlId = 'hl-' + idx + '-' + Date.now();
  const dl = document.createElement('datalist');
  dl.id = dlId;
  ['Content-Type', 'Accept', 'Authorization', 'X-API-Key', 'User-Agent', 'Cache-Control', 'X-Request-ID'].forEach(
    (h) => {
      const o = document.createElement('option');
      o.value = h;
      dl.appendChild(o);
    },
  );
  tbc.headers.appendChild(dl);

  const renderHR = (hd, i) => {
    const tr = document.createElement('tr');
    tr.className = 'header-row' + (hd.enabled ? '' : ' disabled');

    const tdE = document.createElement('td');
    tdE.className = 'header-enabled';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = hd.enabled !== false;
    cb.onchange = () => {
      hd.enabled = cb.checked;
      tr.classList.toggle('disabled', !cb.checked);
      debouncedSave();
    };
    tdE.appendChild(cb);
    tr.appendChild(tdE);

    const tdK = document.createElement('td');
    tdK.className = 'header-key';
    const ki = document.createElement('input');
    ki.type = 'text';
    ki.setAttribute('list', dlId);
    ki.value = hd.key || '';
    ki.placeholder = 'Название';
    ki.autocomplete = 'off';
    ki.oninput = () => {
      hd.key = ki.value.trim();
      debouncedSave();
    };
    tdK.appendChild(ki);
    tr.appendChild(tdK);

    const tdV = document.createElement('td');
    tdV.className = 'header-value';
    const vi = document.createElement('input');
    vi.type = 'text';
    vi.value = hd.value || '';
    vi.placeholder = 'Значение';
    vi.oninput = () => {
      hd.value = vi.value;
      debouncedSave();
    };
    tdV.appendChild(vi);
    tr.appendChild(tdV);

    const tdA = document.createElement('td');
    tdA.className = 'header-actions';
    const rm = document.createElement('button');
    rm.className = 'header-remove-btn';
    rm.textContent = '✕';
    rm.title = 'Удалить';
    rm.onclick = () => {
      step.customHeaders.splice(i, 1);
      tr.style.opacity = '0';
      tr.style.transform = 'translateX(10px)';
      tr.style.transition = 'all 0.2s';
      setTimeout(() => {
        tr.remove();
        debouncedSave();
      }, 180);
    };
    tdA.appendChild(rm);
    tr.appendChild(tdA);
    tbody.appendChild(tr);
  };

  step.customHeaders.forEach((h, i) => renderHR(h, i));

  const addH = document.createElement('button');
  addH.className = 'add-header-btn';
  addH.textContent = 'Добавить заголовок';
  addH.onclick = () => {
    const nh = { key: '', value: '', enabled: true };
    step.customHeaders.push(nh);
    renderHR(nh, step.customHeaders.length - 1);
    debouncedSave();
  };
  tbc.headers.append(ht, addH);

  // ================== Authorization Tab ==================
  const authContainer = document.createElement('div');
  authContainer.className = 'auth-container';

  const authTypeRow = document.createElement('div');
  authTypeRow.className = 'auth-type-row';
  authTypeRow.appendChild(txt('label', 'Тип аутентификации'));

  const authTypeSelect = document.createElement('select');
  authTypeSelect.className = 'auth-type-select';
  const authTypes = [
    { value: 'noauth', label: 'No Auth' },
    { value: 'apikey', label: 'API Key' },
    { value: 'bearer', label: 'Bearer Token' },
    { value: 'jwt', label: 'JWT Bearer' },
    { value: 'basic', label: 'Basic Auth' },
    { value: 'digest', label: 'Digest Auth' },
    { value: 'oauth2', label: 'OAuth 2.0' },
    { value: 'oauth1', label: 'OAuth 1.0' },
    { value: 'hawk', label: 'Hawk Authentication' },
  ];
  authTypes.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = t.label;
    authTypeSelect.appendChild(opt);
  });

  // Миграция старых данных
  if (!step.authData) step.authData = {};
  if (!step.authType) {
    step.authType = step.auth && step.auth.trim() ? 'bearer' : 'noauth';
    if (step.authType === 'bearer') {
      step.authData.token = step.auth.trim();
    }
  }
  authTypeSelect.value = step.authType;
  authTypeRow.appendChild(authTypeSelect);
  authContainer.appendChild(authTypeRow);

  const authFormContainer = document.createElement('div');
  authFormContainer.className = 'auth-form-container';
  authContainer.appendChild(authFormContainer);

  const createAuthField = (label, key, placeholder = '', type = 'text', isPassword = false) => {
    const field = document.createElement('div');
    field.className = 'auth-field';
    field.appendChild(txt('label', label));
    const input = document.createElement('input');
    input.type = isPassword ? 'password' : type;
    input.value = step.authData[key] || '';
    input.placeholder = placeholder;
    input.addEventListener('input', () => {
      step.authData[key] = input.value;
      debouncedSave();
    });
    field.appendChild(input);
    return field;
  };

  const createAuthSelect = (label, key, options, defaultValue) => {
    const field = document.createElement('div');
    field.className = 'auth-field';
    field.appendChild(txt('label', label));
    const select = document.createElement('select');
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
    select.value = step.authData[key] || defaultValue;
    select.addEventListener('change', () => {
      step.authData[key] = select.value;
      debouncedSave();
    });
    field.appendChild(select);
    return field;
  };

  const renderAuthForm = () => {
    authFormContainer.innerHTML = '';
    const type = authTypeSelect.value;
    step.authType = type;

    switch (type) {
      case 'noauth': {
        const msg = document.createElement('div');
        msg.className = 'auth-info-msg';
        msg.innerHTML = 'ℹ️ Этот запрос не будет использовать аутентификацию.';
        authFormContainer.appendChild(msg);
        break;
      }
      case 'apikey':
        authFormContainer.appendChild(createAuthField('Key', 'key', 'api-key'));
        authFormContainer.appendChild(createAuthField('Value', 'value', 'your-api-key-value'));
        authFormContainer.appendChild(
          createAuthSelect(
            'Add to',
            'addTo',
            [
              { value: 'header', label: 'Header' },
              { value: 'query', label: 'Query Params' },
            ],
            'header',
          ),
        );
        break;
      case 'bearer':
        authFormContainer.appendChild(createAuthField('Token', 'token', 'Enter bearer token'));
        const bearerHint = document.createElement('div');
        bearerHint.className = 'auth-hint';
        bearerHint.textContent = 'Будет отправлен как: Authorization: Bearer <token>';
        authFormContainer.appendChild(bearerHint);
        break;
      case 'jwt':
        authFormContainer.appendChild(createAuthField('Token', 'token', 'Enter JWT token'));
        authFormContainer.appendChild(createAuthField('Header Prefix', 'prefix', 'Bearer'));
        const jwtHint = document.createElement('div');
        jwtHint.className = 'auth-hint';
        jwtHint.textContent = 'Отправится как: Authorization: <prefix> <token>';
        authFormContainer.appendChild(jwtHint);
        break;
      case 'basic':
        authFormContainer.appendChild(createAuthField('Username', 'username', 'Enter username'));
        authFormContainer.appendChild(createAuthField('Password', 'password', 'Enter password', 'text', true));
        const basicHint = document.createElement('div');
        basicHint.className = 'auth-hint';
        basicHint.textContent = 'Credentials будут закодированы в Base64.';
        authFormContainer.appendChild(basicHint);
        break;
      case 'digest':
        authFormContainer.appendChild(createAuthField('Username', 'username', 'Enter username'));
        authFormContainer.appendChild(createAuthField('Password', 'password', 'Enter password', 'text', true));
        authFormContainer.appendChild(createAuthField('Realm', 'realm', '(optional)'));
        authFormContainer.appendChild(createAuthField('Nonce', 'nonce', '(optional)'));
        authFormContainer.appendChild(createAuthField('Algorithm', 'algorithm', 'MD5'));
        authFormContainer.appendChild(createAuthField('qop', 'qop', 'auth'));
        authFormContainer.appendChild(createAuthField('Nonce Count', 'nonceCount', '00000001'));
        authFormContainer.appendChild(createAuthField('Client Nonce (cnonce)', 'cnonce', '(optional)'));
        authFormContainer.appendChild(createAuthField('Opaque', 'opaque', '(optional)'));
        const digestInfo = document.createElement('div');
        digestInfo.className = 'auth-info-msg';
        digestInfo.textContent =
          '⚠️ Digest Auth требует двусторонний обмен. Если сервер возвращает 401 с WWW-Authenticate, приложение автоматически вычислит ответ.';
        authFormContainer.appendChild(digestInfo);
        break;
      case 'oauth2':
        authFormContainer.appendChild(createAuthField('Access Token', 'accessToken', 'Enter access token'));
        authFormContainer.appendChild(createAuthField('Header Prefix', 'headerPrefix', 'Bearer'));
        authFormContainer.appendChild(
          createAuthSelect(
            'Add to',
            'addTo',
            [
              { value: 'header', label: 'Header' },
              { value: 'query', label: 'Query Params' },
            ],
            'header',
          ),
        );
        break;
      case 'oauth1':
        authFormContainer.appendChild(createAuthField('Consumer Key', 'consumerKey', 'Enter consumer key'));
        authFormContainer.appendChild(
          createAuthField('Consumer Secret', 'consumerSecret', 'Enter consumer secret', 'text', true),
        );
        authFormContainer.appendChild(createAuthField('Access Token', 'token', 'Enter access token'));
        authFormContainer.appendChild(
          createAuthField('Token Secret', 'tokenSecret', 'Enter token secret', 'text', true),
        );
        authFormContainer.appendChild(
          createAuthSelect(
            'Signature Method',
            'signatureMethod',
            [
              { value: 'HMAC-SHA1', label: 'HMAC-SHA1' },
              { value: 'HMAC-SHA256', label: 'HMAC-SHA256' },
              { value: 'RSA-SHA1', label: 'RSA-SHA1' },
              { value: 'PLAINTEXT', label: 'PLAINTEXT' },
            ],
            'HMAC-SHA1',
          ),
        );
        authFormContainer.appendChild(createAuthField('Timestamp', 'timestamp', '(auto-generated if empty)'));
        authFormContainer.appendChild(createAuthField('Nonce', 'nonce', '(auto-generated if empty)'));
        authFormContainer.appendChild(createAuthField('Version', 'version', '1.0'));
        authFormContainer.appendChild(createAuthField('Realm', 'realm', '(optional)'));
        authFormContainer.appendChild(
          createAuthSelect(
            'Add to',
            'addTo',
            [
              { value: 'header', label: 'Header' },
              { value: 'query', label: 'Query Params' },
            ],
            'header',
          ),
        );
        const oauth1Info = document.createElement('div');
        oauth1Info.className = 'auth-info-msg';
        oauth1Info.textContent = '✅ Полная поддержка OAuth 1.0 с HMAC-SHA1/SHA256 подписью.';
        authFormContainer.appendChild(oauth1Info);
        break;
      case 'hawk':
        authFormContainer.appendChild(createAuthField('Hawk ID', 'hawkId', 'Enter hawk ID'));
        authFormContainer.appendChild(createAuthField('Hawk Key', 'hawkKey', 'Enter hawk key', 'text', true));
        authFormContainer.appendChild(
          createAuthSelect(
            'Algorithm',
            'algorithm',
            [
              { value: 'sha256', label: 'sha256' },
              { value: 'sha1', label: 'sha1' },
            ],
            'sha256',
          ),
        );
        authFormContainer.appendChild(createAuthField('User', 'user', '(optional)'));
        authFormContainer.appendChild(createAuthField('Nonce', 'nonce', '(auto-generated if empty)'));
        authFormContainer.appendChild(createAuthField('Extra Data (ext)', 'ext', '(optional)'));
        authFormContainer.appendChild(createAuthField('App', 'app', '(optional)'));
        authFormContainer.appendChild(createAuthField('Delegation (dlg)', 'dlg', '(optional)'));
        authFormContainer.appendChild(createAuthField('Timestamp', 'timestamp', '(auto-generated if empty)'));
        const hawkInfo = document.createElement('div');
        hawkInfo.className = 'auth-info-msg';
        hawkInfo.textContent = '✅ Полная поддержка Hawk с HMAC подписью.';
        authFormContainer.appendChild(hawkInfo);
        break;
    }
    debouncedSave();
  };

  authTypeSelect.addEventListener('change', renderAuthForm);
  renderAuthForm();
  tbc.auth.appendChild(authContainer);

  // ================== Scripts Tab ==================
  const scriptsContainer = document.createElement('div');
  scriptsContainer.className = 'scripts-tabs-container';

  const scriptsTabs = document.createElement('div');
  scriptsTabs.className = 'sub-tabs';
  const preBtn = txt('button', 'Pre-request', 'sub-tab-btn active');
  const postBtn = txt('button', 'Post-response', 'sub-tab-btn');
  scriptsTabs.append(preBtn, postBtn);

  const preContent = document.createElement('div');
  preContent.className = 'sub-tab-content active';
  const postContent = document.createElement('div');
  postContent.className = 'sub-tab-content';

  const preHint = txt(
    'div',
    'API: pm.env.get/set, pm.request.headers.set/get/remove, pm.request.body.set/get, await pm.sendRequest({ method, url, headers, body })',
    'body-hint',
  );
  const postHint = txt('div', 'API: pm.response, pm.env.get/set, pm.request, await pm.sendRequest(...)', 'body-hint');
  preContent.appendChild(preHint);
  postContent.appendChild(postHint);

  const normalizeScript = (script) => {
    if (!script || typeof script !== 'object' || Array.isArray(script)) return { code: '', timeout: 5000 };
    const rawCode = script.code;
    const code = rawCode == null || rawCode === 'undefined' ? '' : String(rawCode);
    return { ...script, code, timeout: script.timeout || 5000 };
  };

  step.scripts = {
    prerequest: normalizeScript(step.scripts?.prerequest),
    postresponse: normalizeScript(step.scripts?.postresponse),
  };

  const createScriptEditor = (parent, type) => {
    const editorId = `cm-script-${type}-${idx}-${Date.now()}`;
    const textarea = document.createElement('textarea');
    textarea.value = step.scripts[type].code;
    const { wrapper, editor } = createCodeMirrorEditor(textarea, step.scripts[type].code, 'javascript');
    activeEditors.set(editorId, { editor, wrapper });

    if (editor) {
      editor.on('change', () => {
        step.scripts[type].code = editor.getValue();
        debouncedSave();
      });
    }
    parent.appendChild(wrapper);
    return { editor };
  };

  const preEditorInfo = createScriptEditor(preContent, 'prerequest');
  const postEditorInfo = createScriptEditor(postContent, 'postresponse');

  preBtn.onclick = () => {
    preBtn.classList.add('active');
    postBtn.classList.remove('active');
    preContent.classList.add('active');
    postContent.classList.remove('active');
    if (preEditorInfo.editor) preEditorInfo.editor.refresh();
  };
  postBtn.onclick = () => {
    postBtn.classList.add('active');
    preBtn.classList.remove('active');
    postContent.classList.add('active');
    preContent.classList.remove('active');
    if (postEditorInfo.editor) postEditorInfo.editor.refresh();
  };

  scriptsContainer.append(scriptsTabs, preContent, postContent);
  tbc.scripts.appendChild(scriptsContainer);

  // ================== Body Tab ==================
  const bodyContainer = document.createElement('div');
  bodyContainer.className = 'body-container';

  // Миграция старых данных
  if (!step.bodyType) {
    if (step.body && step.body.trim()) {
      step.bodyType = 'raw';
      step.rawType = 'json';
    } else {
      step.bodyType = 'none';
    }
  }
  if (!step.formData) step.formData = [];
  if (!step.urlencoded) step.urlencoded = [];
  if (!step.graphql) step.graphql = { query: '', variables: '' };
  if (!step.rawType) step.rawType = 'json';

  // Радио-кнопки типов
  const bodyTypeRow = document.createElement('div');
  bodyTypeRow.className = 'body-type-row';

  const bodyTypes = [
    { value: 'none', label: 'None', icon: '∅', hint: 'Без тела' },
    { value: 'form-data', label: 'Form-data', icon: '▦', hint: 'Поля и файлы' },
    { value: 'urlencoded', label: 'URL Encoded', icon: '≡', hint: 'HTML form' },
    { value: 'raw', label: 'Raw', icon: '{}', hint: 'JSON, XML, Text' },
    { value: 'binary', label: 'Binary', icon: '⬡', hint: 'Файл' },
    { value: 'graphql', label: 'GraphQL', icon: '◆', hint: 'Query' },
  ];

  const rawEditorId = 'cm-raw-' + idx + '-' + Date.now();
  bodyTypes.forEach((t) => {
    const lbl = document.createElement('label');
    lbl.className = 'body-type-radio';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `bodyType-${idx}`;
    radio.value = t.value;
    radio.checked = step.bodyType === t.value;
    radio.addEventListener('change', () => {
      // Сохраняем данные из текущего raw-редактора перед переключением
      const existingEditor = activeEditors.get(rawEditorId);
      if (existingEditor && existingEditor.editor) {
        step.body = existingEditor.editor.getValue();
      }
      step.bodyType = t.value;
      renderBodyForm();
      debouncedSave();
    });
    const icon = document.createElement('span');
    icon.className = 'body-type-icon';
    icon.textContent = t.icon;
    const text = document.createElement('span');
    text.className = 'body-type-text';
    const name = document.createElement('span');
    name.className = 'body-type-name';
    name.textContent = t.label;
    const hint = document.createElement('span');
    hint.className = 'body-type-hint';
    hint.textContent = t.hint;
    text.append(name, hint);
    lbl.append(radio, icon, text);
    bodyTypeRow.appendChild(lbl);
  });

  bodyContainer.appendChild(bodyTypeRow);

  const bodyFormContainer = document.createElement('div');
  bodyFormContainer.className = 'body-form-container';
  bodyContainer.appendChild(bodyFormContainer);

  // ===== Хелпер: таблица ключ-значение =====
  const renderKeyValueTable = (arr, valuePlaceholder = 'Значение', showType = false) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'key-value-table-wrapper';

    const table = document.createElement('table');
    table.className = 'key-value-table';
    table.innerHTML = `<thead><tr>
            <th class="kv-enabled"></th>
            <th class="kv-key">Ключ</th>
            <th class="kv-value">Значение</th>
            ${showType ? '<th class="kv-type">Тип</th>' : ''}
            <th class="kv-actions"></th>
        </tr></thead>`;
    const tBody = document.createElement('tbody');
    table.appendChild(tBody);

    const renderRow = (item, i) => {
      const tr = document.createElement('tr');
      tr.className = 'kv-row' + (item.enabled ? '' : ' disabled');

      const tdE = document.createElement('td');
      tdE.className = 'kv-enabled';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = item.enabled !== false;
      cb.onchange = () => {
        item.enabled = cb.checked;
        tr.classList.toggle('disabled', !cb.checked);
        debouncedSave();
      };
      tdE.appendChild(cb);
      tr.appendChild(tdE);

      const tdK = document.createElement('td');
      tdK.className = 'kv-key';
      const ki = document.createElement('input');
      ki.type = 'text';
      ki.value = item.key || '';
      ki.placeholder = 'Ключ';
      ki.oninput = () => {
        item.key = ki.value.trim();
        debouncedSave();
      };
      tdK.appendChild(ki);
      tr.appendChild(tdK);

      const tdV = document.createElement('td');
      tdV.className = 'kv-value';

      if (showType && item.type === 'file') {
        const fileWrap = document.createElement('div');
        fileWrap.className = 'file-input-wrap';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'kv-file-input';
        fileInput.onchange = () => {
          if (fileInput.files[0]) {
            item.filePath = fileInput.files[0].path;
            item.fileName = fileInput.files[0].name;
            debouncedSave();
          }
        };
        const fileName = document.createElement('span');
        fileName.className = 'kv-file-name';
        fileName.textContent = item.fileName || 'Выберите файл';
        fileWrap.append(fileInput, fileName);
        tdV.appendChild(fileWrap);
      } else {
        const vi = document.createElement('input');
        vi.type = 'text';
        vi.value = item.value || '';
        vi.placeholder = valuePlaceholder;
        vi.oninput = () => {
          item.value = vi.value;
          debouncedSave();
        };
        tdV.appendChild(vi);
      }
      tr.appendChild(tdV);

      if (showType) {
        const tdT = document.createElement('td');
        tdT.className = 'kv-type';
        const sel = document.createElement('select');
        ['text', 'file'].forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          sel.appendChild(o);
        });
        sel.value = item.type || 'text';
        sel.onchange = () => {
          item.type = sel.value;
          debouncedSave();
          tBody.innerHTML = '';
          arr.forEach((it, idx) => renderRow(it, idx));
        };
        tdT.appendChild(sel);
        tr.appendChild(tdT);
      }

      const tdA = document.createElement('td');
      tdA.className = 'kv-actions';
      const rm = document.createElement('button');
      rm.className = 'kv-remove-btn';
      rm.textContent = '✕';
      rm.onclick = () => {
        arr.splice(i, 1);
        tr.style.opacity = '0';
        setTimeout(() => {
          tr.remove();
          debouncedSave();
        }, 150);
      };
      tdA.appendChild(rm);
      tr.appendChild(tdA);
      tBody.appendChild(tr);
    };

    arr.forEach((item, i) => renderRow(item, i));

    const addBtn = document.createElement('button');
    addBtn.className = 'add-kv-btn';
    addBtn.textContent = '+ Добавить';
    addBtn.onclick = () => {
      const newItem = showType
        ? { key: '', value: '', type: 'text', enabled: true }
        : { key: '', value: '', enabled: true };
      arr.push(newItem);
      renderRow(newItem, arr.length - 1);
      debouncedSave();
    };

    wrapper.append(table, addBtn);
    return wrapper;
  };

  // ===== Рендер формы тела запроса =====
  const renderBodyForm = () => {
    // ВАЖНО: Перед уничтожением формы — сохранить данные из текущего raw-редактора
    const existingEditor = activeEditors.get(rawEditorId);
    if (existingEditor && existingEditor.editor) {
      step.body = existingEditor.editor.getValue();
      try {
        existingEditor.editor.toTextArea();
      } catch {
        /* ignore */
      }
      activeEditors.delete(rawEditorId);
    }

    bodyFormContainer.innerHTML = '';
    const type = step.bodyType;

    switch (type) {
      case 'none': {
        const msg = document.createElement('div');
        msg.className = 'body-info-msg';
        msg.innerHTML = 'ℹ️ Этот запрос не будет иметь тела.';
        bodyFormContainer.appendChild(msg);
        break;
      }

      case 'form-data': {
        const hint = document.createElement('div');
        hint.className = 'body-hint';
        hint.textContent = 'Content-Type: multipart/form-data (устанавливается автоматически с boundary)';
        bodyFormContainer.appendChild(hint);
        bodyFormContainer.appendChild(renderKeyValueTable(step.formData, 'Значение', true));
        break;
      }

      case 'urlencoded': {
        const hint = document.createElement('div');
        hint.className = 'body-hint';
        hint.textContent = 'Content-Type: application/x-www-form-urlencoded';
        bodyFormContainer.appendChild(hint);
        bodyFormContainer.appendChild(renderKeyValueTable(step.urlencoded));
        break;
      }

      case 'raw': {
        // Подвыбор raw типа (JSON/JavaScript/XML/HTML/Text)
        const rawTypeRow = document.createElement('div');
        rawTypeRow.className = 'raw-type-row';
        const rawTypes = [
          { value: 'json', label: 'JSON', icon: '{}', contentType: 'application/json' },
          { value: 'javascript', label: 'JavaScript', icon: 'JS', contentType: 'application/javascript' },
          { value: 'xml', label: 'XML', icon: '<>', contentType: 'application/xml' },
          { value: 'html', label: 'HTML', icon: '</>', contentType: 'text/html' },
          { value: 'text', label: 'Text', icon: 'T', contentType: 'text/plain' },
        ];

        rawTypes.forEach((rt) => {
          const lbl = document.createElement('label');
          lbl.className = 'raw-type-radio';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = `rawType-${idx}`;
          radio.value = rt.value;
          radio.checked = step.rawType === rt.value;
          radio.addEventListener('change', () => {
            step.rawType = rt.value;
            step.contentType = rt.contentType;

            // Обновляем режим подсветки CodeMirror
            const editorInfo = activeEditors.get(rawEditorId);
            if (editorInfo && editorInfo.editor) {
              const modeMap = {
                json: { name: 'javascript', json: true },
                javascript: 'javascript',
                xml: 'xml',
                html: 'htmlmixed',
                text: 'text',
              };
              editorInfo.editor.setOption('mode', modeMap[rt.value] || 'text');
              editorInfo.editor.refresh();
            }
            debouncedSave();
          });
          const icon = document.createElement('span');
          icon.className = 'raw-type-icon';
          icon.textContent = rt.icon;
          const span = document.createElement('span');
          span.textContent = rt.label;
          lbl.append(radio, icon, span);
          rawTypeRow.appendChild(lbl);
        });
        bodyFormContainer.appendChild(rawTypeRow);

        // CodeMirror editor для raw
        const bf = document.createElement('div');
        bf.className = 'field';
        const blr = document.createElement('div');
        blr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
        blr.appendChild(txt('label', 'Тело запроса (Ctrl+/ для комментариев)'));
        const fmtB = document.createElement('button');
        fmtB.className = 'secondary';
        fmtB.style.cssText = 'padding:2px 10px;font-size:12px;';
        fmtB.textContent = '🎨 Форматировать';
        blr.appendChild(fmtB);

        const bta = document.createElement('textarea');
        bta.className = 'step-body';
        bta.value = step.body || '';

        const modeMap = {
          json: { name: 'javascript', json: true },
          javascript: 'javascript',
          xml: 'xml',
          html: 'htmlmixed',
          text: 'text',
        };

        const { wrapper: cw, editor: ce } = createCodeMirrorEditor(
          bta,
          step.body || '',
          modeMap[step.rawType] || 'text',
          '540px',
        );
        activeEditors.set(rawEditorId, { editor: ce, wrapper: cw });

        // ===== АВТОФОРМАТИРОВАНИЕ JSON ПРИ ПЕРВОМ ОТКРЫТИИ =====
        if (ce) {
          if (!step._wasFormatted && step.rawType === 'json' && step.body && step.body.trim()) {
            requestAnimationFrame(() => {
              try {
                const currentText = ce.getValue().trim();
                if (currentText) {
                  const parsed = JSON.parse(currentText);
                  const formatted = JSON.stringify(parsed, null, 2);
                  if (formatted !== currentText) {
                    ce.setValue(formatted);
                    step.body = formatted;
                    debouncedSave();
                  }
                }
                step._wasFormatted = true;
              } catch {
                // JSON невалидный — помечаем, чтобы не пытаться снова
                step._wasFormatted = true;
              }
            });
          }

          // Автосохранение step.body при каждом изменении
          ce.on('change', () => {
            step.body = ce.getValue();
            bta.value = step.body;
            debouncedSave();
          });
        }

        fmtB.onclick = (e) => {
          e.stopPropagation();
          formatCurrentEditor(rawEditorId);
        };
        bf.append(blr, cw);
        bodyFormContainer.appendChild(bf);

        // Refresh после рендера (убирает баг с "невидимым" текстом)
        requestAnimationFrame(() => {
          if (ce) {
            ce.refresh();
          }
        });

        // Устанавливаем contentType автоматически
        const currentRaw = rawTypes.find((r) => r.value === step.rawType);
        if (currentRaw) step.contentType = currentRaw.contentType;
        break;
      }

      case 'binary': {
        const hint = document.createElement('div');
        hint.className = 'body-hint';
        hint.textContent = 'Отправит файл как бинарные данные (application/octet-stream)';
        bodyFormContainer.appendChild(hint);

        const fileField = document.createElement('div');
        fileField.className = 'binary-file-field';
        fileField.appendChild(txt('label', 'Выберите файл'));

        const fileRow = document.createElement('div');
        fileRow.className = 'binary-file-row';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'binary-file-input';
        fileInput.id = `binary-file-${idx}-${Date.now()}`;
        fileInput.onchange = () => {
          if (fileInput.files[0]) {
            step.binaryPath = fileInput.files[0].path;
            step.binaryName = fileInput.files[0].name;
            fileNameSpan.textContent = step.binaryName;
            fileRow.classList.add('has-file');
            debouncedSave();
          }
        };

        const pickBtn = document.createElement('label');
        pickBtn.className = 'binary-file-pick';
        pickBtn.htmlFor = fileInput.id;
        pickBtn.innerHTML = '<span class="binary-file-pick-icon">📎</span><span>Выбрать файл</span>';

        const fileNameSpan = document.createElement('span');
        fileNameSpan.className = 'binary-file-name';
        fileNameSpan.textContent = step.binaryName || 'Файл не выбран';
        if (step.binaryName) fileRow.classList.add('has-file');

        const clearBtn = document.createElement('button');
        clearBtn.className = 'secondary binary-file-clear';
        clearBtn.textContent = 'Очистить';
        clearBtn.onclick = () => {
          step.binaryPath = '';
          step.binaryName = '';
          fileInput.value = '';
          fileNameSpan.textContent = 'Файл не выбран';
          fileRow.classList.remove('has-file');
          debouncedSave();
        };

        fileRow.append(fileInput, pickBtn, fileNameSpan, clearBtn);
        fileField.appendChild(fileRow);
        bodyFormContainer.appendChild(fileField);
        break;
      }

      case 'graphql': {
        const hint = document.createElement('div');
        hint.className = 'body-hint';
        hint.textContent = 'Content-Type: application/json (GraphQL query + variables)';
        bodyFormContainer.appendChild(hint);

        // Query textarea
        const queryField = document.createElement('div');
        queryField.className = 'field';
        queryField.appendChild(txt('label', 'GraphQL Query'));
        const queryTA = document.createElement('textarea');
        queryTA.className = 'graphql-query';
        queryTA.placeholder = 'query {\n  user(id: 1) {\n    name\n    email\n  }\n}';
        queryTA.value = step.graphql.query || '';
        queryTA.style.minHeight = '150px';
        queryTA.oninput = () => {
          step.graphql.query = queryTA.value;
          debouncedSave();
        };
        queryField.appendChild(queryTA);
        bodyFormContainer.appendChild(queryField);

        // Variables textarea (JSON)
        const varsField = document.createElement('div');
        varsField.className = 'field';
        varsField.appendChild(txt('label', 'GraphQL Variables (JSON)'));
        const varsTA = document.createElement('textarea');
        varsTA.className = 'graphql-variables';
        varsTA.placeholder = '{\n  "id": 1\n}';
        varsTA.value = step.graphql.variables || '';
        varsTA.style.minHeight = '80px';
        varsTA.oninput = () => {
          step.graphql.variables = varsTA.value;
          debouncedSave();
        };
        varsField.appendChild(varsTA);
        bodyFormContainer.appendChild(varsField);

        step.contentType = 'application/json';
        break;
      }
    }

    debouncedSave();
  };

  renderBodyForm();
  tbc.body.appendChild(bodyContainer);

  card.append(tbc.headers, tbc.auth, tbc.body, tbc.scripts);

  // ================== Save Logic ==================
  const save = () => {
    step.name = ni.value.trim();
    step.url = ui.value.trim();
    step.method = md.value;
    md.dataset.method = step.method;
    nm.textContent = truncateName(step.name || `Шаг ${idx + 1}`, 48);
    nm.title = step.name || `Шаг ${idx + 1}`;
    debouncedSave();
  };
  [ni, ui, md].forEach((el) => el.addEventListener('input', save));

  return card;
}

// ================== Runner ==================
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
  const invalidStep = activeCollection.steps.find((step) => !prepareRawJsonBody(step));
  if (invalidStep) {
    toast(`Проверьте Body в шаге: ${invalidStep.name || 'без названия'}`, 'error', 6000);
    return;
  }
  if (stopCollectionBtn) {
    stopCollectionBtn.style.display = 'flex';
    runCollectionBtn.style.display = 'none';
  }
  isRunning = true;
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
  progressEl.innerHTML =
    '<div style="color: var(--accent); font-style: italic; padding: 8px 0;">⏳ Запуск и выполнение запросов...</div>';
  try {
    const result = await window.api.runCollection(
      activeCollection.steps,
      items,
      delay,
      activeCollection.name,
      getActiveEnvironment(),
    );
    progressEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; background: var(--success-bg); padding: 16px; border-radius: var(--radius-md); border-left: 4px solid var(--success); margin-top: 12px;">
                <div style="font-weight: 700; color: var(--success); font-size: 15px; display: flex; align-items: center; gap: 8px;">✅ Выполнение завершено!</div>
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
  } catch (e) {
    progressEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; background: var(--error-bg); padding: 16px; border-radius: var(--radius-md); border-left: 4px solid var(--danger); margin-top: 12px;">
                <div style="font-weight: 700; color: var(--danger); font-size: 15px;">❌ Критическая ошибка выполнения</div>
                <div style="color: var(--text-primary);">${escapeHtml(e.message)}</div>
            </div>
        `;
    toast('Ошибка: ' + e.message, 'error');
  }
  if (stopCollectionBtn) {
    stopCollectionBtn.style.display = 'none';
    runCollectionBtn.style.display = 'flex';
  }
  isRunning = false;
  dataFileInput.value = '';
  selectedFileName.textContent = 'Файл не выбран';
});

if (stopCollectionBtn) {
  stopCollectionBtn.addEventListener('click', async () => {
    if (await confirmDialog('Остановить выполнение', 'Прервать выполнение коллекции?')) {
      stopCollectionBtn.disabled = true;
      stopCollectionBtn.textContent = 'Остановка...';
      const result = await window.api.stopCollection();
      if (result.success) {
        progressEl.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; background: var(--warning); padding: 16px; border-radius: var(--radius-md); border-left: 4px solid var(--warning); margin-top: 12px;">
                        <div style="font-weight: 700; color: var(--warning); font-size: 15px;">⏹ Выполнение остановлено пользователем</div>
                    </div>
                `;
        toast('Выполнение остановлено', 'warning');
      }
      stopCollectionBtn.disabled = false;
      stopCollectionBtn.textContent = '⏹ Остановить';
      stopCollectionBtn.style.display = 'none';
      runCollectionBtn.style.display = 'flex';
    }
  });
}

if (window.api.onStop) {
  window.api.onStop(() => {
    progressEl.innerHTML = `<div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; background: var(--warning); padding: 16px; border-radius: var(--radius-md); border-left: 4px solid var(--warning); margin-top: 12px;"><div style="font-weight: 700; color: var(--warning); font-size: 15px;">⏹ Выполнение остановлено</div></div>`;
    if (stopCollectionBtn) {
      stopCollectionBtn.style.display = 'none';
      runCollectionBtn.style.display = 'flex';
    }
    isRunning = false;
    toast('Выполнение остановлено', 'warning');
  });
}

window.api.onProgress((progressData) => {
  const {
    item,
    stepName,
    success,
    status,
    error,
    response,
    requestNumber,
    totalRequests,
    requestDuration,
    elapsedMs,
    etaMs,
    avgRequestTime,
    requestBody,
    requestHeaders,
  } = progressData;
  const row = document.createElement('tr');
  row.className = success ? 'success' : 'error';
  row.dataset.responseData = response ? JSON.stringify(response) : '';
  row.dataset.error = error || '';
  row.dataset.item = item;
  row.dataset.stepName = stepName;
  row.dataset.requestDuration = requestDuration || '';
  row.dataset.requestBody = requestBody || '';
  row.dataset.requestHeaders = requestHeaders ? JSON.stringify(requestHeaders) : '';
  row.appendChild(txt('td', `${requestNumber}/${totalRequests}`));
  row.appendChild(txt('td', item));
  row.appendChild(txt('td', stepName));
  const td3 = document.createElement('td');
  const badge = txt(
    'span',
    success ? `✓ ${status}` : `✗ ${status || 'ERROR'}`,
    `status-badge ${success ? 'status-success' : 'status-error'}`,
  );
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
      id: generateUniqueId(),
      timestamp: new Date().toISOString(),
      item,
      stepName,
      success,
      status,
      error,
      responseData: row.dataset.responseData,
      requestBody: row.dataset.requestBody,
      requestHeaders: row.dataset.requestHeaders,
      requestDuration,
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
  res.forEach((r, index) => {
    const row = document.createElement('tr');
    row.className = r.success ? 'success' : 'error';
    row.dataset.responseData = r.responseData || '';
    row.dataset.error = r.error || '';
    row.dataset.item = r.item;
    row.dataset.stepName = r.stepName;
    row.dataset.requestDuration = r.requestDuration || '';
    row.dataset.requestBody = r.requestBody || '';
    row.dataset.requestHeaders = r.requestHeaders || '';
    row.appendChild(txt('td', `${index + 1}/${res.length}`));
    row.appendChild(txt('td', r.item || ''));
    row.appendChild(txt('td', r.stepName || ''));
    const td = document.createElement('td');
    td.appendChild(
      txt(
        'span',
        r.success ? `✓ ${r.status}` : `✗ ${r.status || 'ERROR'}`,
        `status-badge ${r.success ? 'status-success' : 'status-error'}`,
      ),
    );
    row.appendChild(td);
    const tdTime = document.createElement('td');
    tdTime.textContent = r.requestDuration ? `${r.requestDuration}ms` : '—';
    row.appendChild(tdTime);
    row.addEventListener('dblclick', () => showResponseDetails(row));
    runnerResultsBody.appendChild(row);
  });
}

// ================== Send ==================
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
    if (typeof value === 'string') scanString(value);
    else if (Array.isArray(value)) value.forEach(scanJsonValue);
    else if (value && typeof value === 'object') Object.values(value).forEach(scanJsonValue);
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
      if (inLineComment) {
        if (c === '\n') {
          inLineComment = false;
          result += c;
        }
        continue;
      }
      if (inBlockComment) {
        if (c === '*' && next === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }
      if (inString) {
        result += c;
        if (c === '\\' && i + 1 < str.length) {
          result += str[++i];
          continue;
        }
        if (c === stringChar) inString = false;
        continue;
      }
      if (c === '"' || c === "'") {
        inString = true;
        stringChar = c;
        result += c;
        continue;
      }
      if (c === '/' && next === '/') {
        inLineComment = true;
        i++;
        continue;
      }
      if (c === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
      result += c;
    }
    return result;
  };
  scanString(step.url);
  scanString(step.auth);
  if (Array.isArray(step.customHeaders)) {
    step.customHeaders.forEach((h) => {
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
    } catch {
      scanString(step.body);
    }
  }
  return { dataVars: Array.from(dataVars).sort(), envVars: Array.from(envVars).sort() };
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
      envVars.forEach((varName) => {
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
      dataVars.forEach((varName) => {
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
  if (noVarsMsg) noVarsMsg.style.display = envVars.length === 0 && dataVars.length === 0 ? 'block' : 'none';
  updateRawJsonFromInputs();
  if (dataContainer) {
    dataContainer.querySelectorAll('.send-var-input').forEach((input) => {
      input.addEventListener('input', updateRawJsonFromInputs);
    });
  }
}
function updateRawJsonFromInputs() {
  const dataContainer = document.getElementById('sendDataVarsContainer');
  if (!dataContainer || !testDataInput) return;
  const obj = {};
  dataContainer.querySelectorAll('.send-var-input').forEach((input) => {
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

function prepareRawJsonBody(step) {
  if (!step || step.bodyType !== 'raw' || step.rawType !== 'json' || !step.body || !step.body.trim()) return true;
  try {
    const repaired = repairJsonText(step.body);
    if (repaired !== step.body) {
      step.body = repaired;
      debouncedSave();
      toast('Body исправлен автоматически', 'info', 1800);
    }
    return true;
  } catch (e) {
    toast('Ошибка JSON body: ' + e.message, 'error', 6000);
    return false;
  }
}

sendSingleBtn.addEventListener('click', async () => {
  if (!currentStepForSend) return;
  if (!prepareRawJsonBody(currentStepForSend)) return;
  const td = testDataInput.value.trim();
  try {
    if (td) JSON.parse(td);
  } catch {
    toast('Некорректный JSON', 'error');
    return;
  }
  sendSingleBtn.disabled = true;
  sendSingleBtn.textContent = 'Отправка...';
  try {
    const res = await window.api.sendSingleRequest(
      currentStepForSend,
      td || '{}',
      activeCollection?.name || '',
      getActiveEnvironment(),
      activeCollection?.steps || [],
    );
    sendSingleBtn.disabled = false;
    sendSingleBtn.textContent = '▶ Отправить';
    sendRequestModal.classList.remove('active');
    const rd = { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data, url: res.url };
    buildDetailContent({
      responseData: JSON.stringify(rd),
      error: res.success ? null : res.statusText,
      url: res.url,
      requestBody: res.requestBody,
      requestHeaders: res.requestHeaders,
      item: `Данные: ${td || '{}'}`,
      stepName: currentStepForSend.name || 'Одиночный запрос',
    });
    detailModalTitle.textContent = `Результат: ${currentStepForSend.name || 'Одиночный запрос'}`;
    detailModal.classList.add('active');
    toast(res.success ? 'Успешно' : `Ошибка: ${res.statusText}`, res.success ? 'success' : 'error');
  } catch (e) {
    sendSingleBtn.disabled = false;
    sendSingleBtn.textContent = '▶ Отправить';
    toast('Ошибка: ' + e.message, 'error');
  }
});

// ================== History ==================
async function loadHistory() {
  fullHistory = await window.api.getHistory();
  updateHistoryFilter();
  renderFilteredHistory();
}
function updateHistoryFilter() {
  historyFilter.innerHTML = '<option value="">Все коллекции</option>';
  [...new Set(fullHistory.map((h) => h.collection).filter(Boolean))].forEach((n) => {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    historyFilter.appendChild(o);
  });
}
// Замените renderFilteredHistory на эту версию
function renderFilteredHistory() {
  const v = historyFilter.value;
  const filtered = v ? fullHistory.filter((h) => h.collection === v) : fullHistory;

  historyTableBody.innerHTML = '';

  // Если записей мало (<50) — рендерим все
  if (filtered.length < 50) {
    filtered.forEach((e) => renderHistoryRow(e, historyTableBody));
    return;
  }

  // Виртуальный скролл: рендерим только первые 50 + добавляем по скроллу
  const INITIAL_RENDER = 50;
  const BATCH_SIZE = 25;
  let renderedCount = 0;

  const renderBatch = () => {
    const fragment = document.createDocumentFragment();
    const end = Math.min(renderedCount + BATCH_SIZE, filtered.length);
    for (let i = renderedCount; i < end; i++) {
      renderHistoryRow(filtered[i], fragment);
    }
    historyTableBody.appendChild(fragment);
    renderedCount = end;
  };

  // Первый батч
  for (let i = 0; i < INITIAL_RENDER && i < filtered.length; i++) {
    renderHistoryRow(filtered[i], historyTableBody);
  }
  renderedCount = INITIAL_RENDER;

  // Lazy loading при скролле
  const scrollContainer = historyTableBody.closest('.history-table-container') || historyTableBody.parentElement;
  const onScroll = () => {
    if (renderedCount >= filtered.length) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      renderBatch();
    }
  };
  scrollContainer.addEventListener('scroll', onScroll);
}

function renderHistoryRow(e, container) {
  const row = document.createElement('tr');
  row.className = e.success ? 'success' : 'error';
  row.append(
    txt('td', new Date(e.timestamp).toLocaleString()),
    txt('td', e.collection || '—'),
    txt('td', e.type === 'single' ? 'Send' : 'Runner'),
    txt('td', e.item),
    txt('td', e.stepName),
  );
  const tu = txt('td', e.url);
  tu.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  row.appendChild(tu);
  const ts = document.createElement('td');
  ts.appendChild(
    txt(
      'span',
      e.success ? `✓ ${e.status}` : `✗ ${e.status}`,
      `status-badge ${e.success ? 'status-success' : 'status-error'}`,
    ),
  );
  row.appendChild(ts);
  row.addEventListener('dblclick', () => showHistoryDetail(e));
  container.appendChild(row);
}
function showHistoryDetail(e) {
  const rd = { status: e.status, statusText: '', headers: e.responseHeaders || {}, data: e.responseData, url: e.url };
  buildDetailContent({
    responseData: JSON.stringify(rd),
    error: e.success ? null : e.error,
    url: e.url,
    requestBody: e.requestBody,
    requestHeaders: e.requestHeaders,
    item: e.item,
    stepName: e.stepName,
  });
  detailModalTitle.textContent = `История: ${e.stepName}`;
  detailModal.classList.add('active');
}
refreshHistoryBtn.addEventListener('click', loadHistory);
historyFilter.addEventListener('change', renderFilteredHistory);

// ================== Details ==================
function showResponseDetails(row) {
  buildDetailContent({
    responseData: row.dataset.responseData,
    error: row.dataset.error,
    item: row.dataset.item,
    stepName: row.dataset.stepName,
    url: row.dataset.url,
    requestBody: row.dataset.requestBody,
    requestHeaders: row.dataset.requestHeaders,
  });
  detailModalTitle.textContent = `Детали: ${row.dataset.stepName}`;
  detailModal.classList.add('active');
}
function formatJsonBlock(data) {
  if (data == null) return '<span style="color:var(--text-secondary)">Пусто</span>';
  let str = typeof data === 'string' ? data : JSON.stringify(data);
  let fmt = str,
    isJ = false;
  try {
    const p = JSON.parse(str);
    fmt = JSON.stringify(p, null, 2);
    isJ = true;
  } catch {
    /* ignore */
  }
  return `<pre class="${isJ ? 'json-display' : 'text-display'}">${escapeHtml(fmt)}</pre>`;
}
function buildDetailContent({ responseData, error, item, stepName, url, requestBody, requestHeaders }) {
  if (typeof requestHeaders === 'string' && requestHeaders.trim()) {
    try {
      requestHeaders = JSON.parse(requestHeaders);
    } catch {
      requestHeaders = { raw: requestHeaders };
    }
  }
  let html = '';
  if (responseData && responseData !== 'null' && responseData !== 'undefined') {
    try {
      const resp = JSON.parse(responseData);
      const st = resp.status || '';
      const cls = st >= 200 && st < 300 ? 'success' : 'error';
      html += `<div class="detail-section"><h3>Статус</h3><span class="detail-status ${cls}">${escapeHtml(String(st))} ${escapeHtml(resp.statusText || '')}</span></div>`;
      html += `<div class="detail-section"><h3>Общая информация</h3>`;
      if (item)
        html += `<div class="detail-field"><div class="detail-field-label">Элемент</div><div class="detail-field-value">${escapeHtml(item)}</div></div>`;
      if (stepName)
        html += `<div class="detail-field"><div class="detail-field-label">Шаг</div><div class="detail-field-value">${escapeHtml(stepName)}</div></div>`;
      if (resp.url || url) {
        const u = resp.url || url;
        html += `<div class="detail-field"><div class="detail-field-label">URL</div><div class="detail-field-value">${escapeHtml(u)}<button class="copy-btn" data-copy="${escapeHtml(u)}">📋 Копировать</button></div></div>`;
      }
      html += `</div>`;
      if (requestHeaders && Object.keys(requestHeaders).length)
        html += `<div class="detail-section"><h3>Заголовки запроса</h3><div class="detail-field-value">${formatJsonBlock(requestHeaders)}<button class="copy-btn" data-copy="${escapeHtml(JSON.stringify(requestHeaders, null, 2))}">📋 Копировать</button></div></div>`;
      if (requestBody)
        html += `<div class="detail-section"><h3>Тело запроса</h3><div class="detail-field-value">${formatJsonBlock(requestBody)}<button class="copy-btn" data-copy="${escapeHtml(typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody))}">📋 Копировать</button></div></div>`;
      if (resp.headers)
        html += `<div class="detail-section"><h3>Заголовки ответа</h3><div class="detail-field-value">${formatJsonBlock(resp.headers)}<button class="copy-btn" data-copy="${escapeHtml(JSON.stringify(resp.headers, null, 2))}">📋 Копировать</button></div></div>`;
      html += `<div class="detail-section"><h3>Тело ответа</h3><div class="detail-field-value">${formatJsonBlock(resp.data)}<button class="copy-btn" data-copy="${escapeHtml(JSON.stringify(resp.data, null, 2))}">📋 Копировать</button></div></div>`;
    } catch {
      html += `<div class="detail-section"><h3>Ответ</h3><div class="detail-field-value">${formatJsonBlock(responseData)}</div></div>`;
    }
  } else html += `<div class="detail-section"><h3>Ответ</h3><div class="detail-field-value">Нет данных</div></div>`;
  if (error) {
    html += `<div class="detail-section"><h3>Ошибка</h3><div class="detail-field-value" style="color:var(--danger);">${escapeHtml(error)}`;
    try {
      if (responseData) {
        const p = JSON.parse(responseData);
        if (p.data?.errors?.[0]) {
          const s = p.data.errors[0];
          html += `<br><br><strong>Детали от сервера:</strong><br><strong>Статус:</strong> ${escapeHtml(s.status || '')}<br><strong>Заголовок:</strong> ${escapeHtml(s.title || '')}`;
          if (s.detail) html += `<br><strong>Описание:</strong> ${escapeHtml(s.detail)}<br>`;
        }
      }
    } catch {
      /* ignore */
    }
    html += `</div></div>`;
  }
  detailContent.innerHTML = html;
  detailContent.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.onclick = () => {
      const t = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(t).then(() => {
        const o = btn.textContent;
        btn.textContent = '✓ Скопировано';
        setTimeout(() => (btn.textContent = o), 2000);
      });
    };
  });
}

// ================== Global History ==================
if (globalHistoryBtn)
  globalHistoryBtn.addEventListener('click', async () => {
    await loadGlobalHistory();
    globalHistoryModal.classList.add('active');
  });
async function loadGlobalHistory() {
  fullHistory = await window.api.getHistory();
  updateGlobalHistoryFilter();
  renderGlobalHistoryTable();
}
function updateGlobalHistoryFilter() {
  globalHistoryFilter.innerHTML = '<option value="">Все коллекции</option>';
  [...new Set(fullHistory.map((h) => h.collection).filter(Boolean))].forEach((n) => {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    globalHistoryFilter.appendChild(o);
  });
}
function renderGlobalHistoryTable() {
  globalHistoryTableBody.innerHTML = '';
  const v = globalHistoryFilter.value;
  (v ? fullHistory.filter((h) => h.collection === v) : fullHistory).forEach((e) => {
    const row = document.createElement('tr');
    row.className = e.success ? 'success' : 'error';
    row.append(
      txt('td', new Date(e.timestamp).toLocaleString()),
      txt('td', e.collection || '—'),
      txt('td', e.type === 'single' ? 'Send' : 'Runner'),
      txt('td', e.item),
      txt('td', e.stepName),
    );
    const tu = txt('td', e.url);
    tu.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    row.appendChild(tu);
    const ts = document.createElement('td');
    ts.appendChild(
      txt(
        'span',
        e.success ? `✓ ${e.status}` : `✗ ${e.status}`,
        `status-badge ${e.success ? 'status-success' : 'status-error'}`,
      ),
    );
    row.appendChild(ts);
    row.addEventListener('dblclick', () => showHistoryDetail(e));
    globalHistoryTableBody.appendChild(row);
  });
}
globalHistoryFilter.addEventListener('change', renderGlobalHistoryTable);
if (refreshGlobalHistoryBtn) refreshGlobalHistoryBtn.addEventListener('click', loadGlobalHistory);

// ================== Clear History ==================
clearHistoryBtn.addEventListener('click', async () => {
  if (await confirmDialog('Очистить всю историю', 'Удалить ВСЕ записи?')) {
    await window.api.clearHistory();
    fullHistory = [];
    historyTableBody.innerHTML = '';
    if (globalHistoryTableBody) globalHistoryTableBody.innerHTML = '';
    toast('История очищена', 'success');
  }
});
if (clearGlobalHistoryBtn)
  clearGlobalHistoryBtn.addEventListener('click', async () => {
    if (await confirmDialog('Очистить всю историю', 'Удалить ВСЕ записи?')) {
      await window.api.clearHistory();
      fullHistory = [];
      historyTableBody.innerHTML = '';
      if (globalHistoryTableBody) globalHistoryTableBody.innerHTML = '';
      toast('История очищена', 'success');
    }
  });
if (clearHistoryFilterBtn)
  clearHistoryFilterBtn.addEventListener('click', () => {
    clearHistoryModal.classList.add('active');
    updateClearHistoryPreview();
  });
if (clearGlobalHistoryFilterBtn)
  clearGlobalHistoryFilterBtn.addEventListener('click', () => {
    clearHistoryModal.classList.add('active');
    updateClearHistoryPreview();
  });
[clearHistoryTimeFilter, clearHistoryTypeFilter, clearHistoryMethodFilter, clearHistoryStatusFilter].forEach((f) => {
  if (f) f.addEventListener('change', updateClearHistoryPreview);
});
function updateClearHistoryPreview() {
  const tf = clearHistoryTimeFilter.value,
    tyf = clearHistoryTypeFilter.value,
    mf = clearHistoryMethodFilter.value,
    sf = clearHistoryStatusFilter.value;
  let cnt = 0,
    now = Date.now();
  fullHistory.forEach((e) => {
    if (tf !== 'all') {
      const age = (now - new Date(e.timestamp).getTime()) / 3600000;
      const days = age / 24;
      if (
        (tf === '1h' && age > 1) ||
        (tf === '24h' && age > 24) ||
        (tf === '7d' && days > 7) ||
        (tf === '30d' && days > 30) ||
        (tf === '90d' && days > 90)
      )
        return;
    }
    if (tyf !== 'all' && e.type !== tyf) return;
    if (mf !== 'all' && e.method !== mf) return;
    if (sf === 'success' && !e.success) return;
    if (sf === 'error' && e.success) return;
    cnt++;
  });
  clearHistoryPreview.textContent = cnt;
}
if (applyClearHistoryBtn)
  applyClearHistoryBtn.addEventListener('click', async () => {
    const f = {
      timeFilter: clearHistoryTimeFilter.value,
      typeFilter: clearHistoryTypeFilter.value,
      methodFilter: clearHistoryMethodFilter.value,
      statusFilter: clearHistoryStatusFilter.value,
    };
    if (await confirmDialog('Подтвердите удаление', `Удалить ${clearHistoryPreview.textContent} записей?`)) {
      await window.api.clearHistoryFiltered(f);
      await loadHistory();
      clearHistoryModal.classList.remove('active');
      toast('История очищена', 'success');
    }
  });

// ================== JSON Generator ==================
if (jsonGeneratorBtn) {
  jsonGeneratorBtn.addEventListener('click', () => {
    jsonModal.classList.add('active');
    if (fieldsContainer.children.length === 0) {
      addFieldBtn.click();
    }
  });
}

if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    jsonModal.classList.remove('active');
  });
}

if (addFieldBtn) {
  addFieldBtn.addEventListener('click', () => {
    const fieldRow = document.createElement('div');
    fieldRow.className = 'field-row';

    fieldRow.innerHTML = `
            <div class="field-inputs">
                <input type="text" class="field-name" placeholder="Имя поля (например: type)">
                <textarea class="field-values" placeholder="Значения (каждое с новой строки)&#10;string&#10;number&#10;boolean"></textarea>
            </div>
            <div class="field-controls">
                <label class="checkbox-label">
                    <input type="checkbox" class="field-constant">
                    <span>Константа</span>
                </label>
                <button class="remove-field-btn">✕ Удалить</button>
            </div>
        `;

    const removeBtn = fieldRow.querySelector('.remove-field-btn');
    removeBtn.addEventListener('click', () => {
      fieldRow.remove();
    });

    fieldsContainer.appendChild(fieldRow);
  });
}

if (generateJsonBtn) {
  generateJsonBtn.addEventListener('click', () => {
    const fields = [];
    const fieldRows = fieldsContainer.querySelectorAll('.field-row');

    for (let row of fieldRows) {
      const nameInput = row.querySelector('.field-name');
      const valuesTextarea = row.querySelector('.field-values');
      const constantCheckbox = row.querySelector('.field-constant');

      const name = nameInput.value.trim();
      const valuesText = valuesTextarea.value.trim();
      const isConstant = constantCheckbox.checked;

      if (!name) {
        toast('Все поля должны иметь имя', 'error');
        return;
      }

      if (!valuesText) {
        toast(`Поле "${name}" не содержит значений`, 'error');
        return;
      }

      const values = valuesText
        .split('\n')
        .map((v) => v.trim())
        .filter((v) => v);

      if (values.length === 0) {
        toast(`Поле "${name}" не содержит значений`, 'error');
        return;
      }

      fields.push({ name, values, isConstant });
    }

    if (fields.length === 0) {
      toast('Добавьте хотя бы одно поле', 'error');
      return;
    }

    let maxLength = 1;
    for (let field of fields) {
      if (!field.isConstant) {
        maxLength = Math.max(maxLength, field.values.length);
      }
    }

    const result = [];
    for (let i = 0; i < maxLength; i++) {
      const obj = {};

      for (let field of fields) {
        let value;

        if (field.isConstant) {
          value = field.values[0];
        } else {
          const index = Math.min(i, field.values.length - 1);
          value = field.values[index];
        }

        obj[field.name] = parseJsonValue(value);
      }

      result.push(obj);
    }

    const jsonString = JSON.stringify(result, null, 2);
    jsonPreview.style.display = 'block';
    jsonPreviewContent.textContent = jsonString;

    copyJsonBtn.style.display = 'inline-block';
    saveJsonBtn.style.display = 'inline-block';

    window.generatedJson = jsonString;

    toast(`Сгенерировано ${result.length} объектов`, 'success');
  });
}

if (copyJsonBtn) {
  copyJsonBtn.addEventListener('click', () => {
    if (window.generatedJson) {
      navigator.clipboard.writeText(window.generatedJson);
      toast('JSON скопирован в буфер обмена', 'success');
    }
  });
}

if (saveJsonBtn) {
  saveJsonBtn.addEventListener('click', () => {
    if (window.generatedJson) {
      const blob = new Blob([window.generatedJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'generated-data.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Файл сохранен', 'success');
    }
  });
}
// ================== cURL Import ==================
function importStepFromCurl(step, idx) {
  curlInput.value = '';
  curlModal.classList.add('active');
  window._curlTarget = { step, idx };
}
if (parseCurlBtn)
  parseCurlBtn.addEventListener('click', () => {
    const txt = curlInput.value.trim();
    if (!txt) {
      toast('Введите cURL', 'warning');
      return;
    }
    const p = parseCurl(txt);
    if (!p) {
      toast('Не распознано', 'error');
      return;
    }
    if (window._curlTarget) {
      const { step } = window._curlTarget;
      step.url = p.url;
      step.method = p.method;
      step.contentType = p.headers['Content-Type'] || step.contentType || 'application/json';
      step.auth = p.headers['Authorization'] || step.auth || '';
      step.body = p.body || step.body || '';
      delete p.headers['Authorization'];
      delete p.headers['Content-Type'];
      step.customHeaders = { ...step.customHeaders, ...p.headers };
      window._curlTarget = null;
      saveData();
      renderSteps();
      curlModal.classList.remove('active');
      toast('Шаг обновлён', 'success');
      return;
    }
    const ns = {
      id: generateStepId(),
      name: '',
      url: p.url,
      method: p.method,
      contentType: p.headers['Content-Type'] || 'application/json',
      auth: p.headers['Authorization'] || '',
      body: p.body || '',
      customHeaders: {},
    };
    delete p.headers['Authorization'];
    delete p.headers['Content-Type'];
    ns.customHeaders = p.headers;
    activeCollection.steps.push(ns);
    saveData();
    renderSteps();
    curlModal.classList.remove('active');
    toast('Шаг импортирован', 'success');
  });
if (importCurlBtn)
  importCurlBtn.addEventListener('click', () => {
    if (!activeCollection) {
      toast('Выберите коллекцию', 'warning');
      return;
    }
    curlInput.value = '';
    curlModal.classList.add('active');
  });

// ================== Global Buttons & Shortcuts ==================
newRootCollectionBtn.addEventListener('click', async () => {
  const nc = { id: generateUniqueId(), name: 'Новая коллекция', steps: [], folderId: null };
  data.collections.push(nc);
  await saveData();
  selectCollection(nc.id);
  renderTree();
});
newFolderBtn.addEventListener('click', async () => {
  const n = await showInputModal('Название папки', 'Новая папка');
  if (n) {
    data.folders.push({ id: generateUniqueId(), name: n, parentId: null, collapsed: false });
    await saveData();
    renderTree();
    toast('Папка создана', 'success');
  }
});
addStepBtn.addEventListener('click', () => {
  if (!activeCollection) return;
  activeCollection.steps.push({
    id: generateStepId(),
    name: '',
    url: '',
    method: 'GET',
    contentType: 'application/json',
    auth: '',
    body: '',
    customHeaders: [],
  });
  saveData();
  renderSteps();
});
tabBtns.forEach((b) => {
  b.addEventListener('click', () => {
    tabBtns.forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    runnerTab.style.display = b.dataset.tab === 'runner' ? 'block' : 'none';
    historyTab.style.display = b.dataset.tab === 'history' ? 'block' : 'none';
    if (b.dataset.tab === 'history') loadHistory();
  });
});
function readDataFile() {
  return new Promise((res, rej) => {
    const f = dataFileInput.files[0];
    if (!f) {
      rej(new Error('Файл не выбран'));
      return;
    }
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const it = cachedJsonParse(e.target.result);
        if (!Array.isArray(it)) rej(new Error('Ожидается массив'));
        else res(it);
      } catch (err) {
        rej(new Error('Ошибка JSON: ' + err.message));
      }
    };
    r.onerror = () => rej(new Error('Ошибка чтения'));
    r.readAsText(f);
  });
}
dataFileInput.addEventListener('change', () => {
  selectedFileName.textContent = dataFileInput.files.length ? dataFileInput.files[0].name : 'Файл не выбран';
});

// Themes
const themes = ['dark', 'light', 'red-white', 'red-black'];
const themeNames = { dark: 'Тёмная', light: 'Светлая', 'red-white': 'Sakura', 'red-black': 'Cyberpunk' };
const themeIcons = { dark: '🌙', light: '☀️', 'red-white': '🌸', 'red-black': '🔥' };
const themeToggle = document.getElementById('themeToggle');
function applyTheme(t) {
  document.body.classList.remove('light-theme', 'red-white-theme', 'red-black-theme');
  if (t !== 'dark') document.body.classList.add(`${t}-theme`);
  themeNameEl.textContent = themeNames[t];
  themeToggleBtn.textContent = themeIcons[t];
  themeToggle.dataset.tooltip = `Тема: ${themeNames[t]}`;
  localStorage.setItem('ab-runner-theme', t);
  updateEditorsTheme();
  themeToggleBtn.classList.remove('spinning');
  void themeToggleBtn.offsetWidth;
  themeToggleBtn.classList.add('spinning');
  setTimeout(() => themeToggleBtn.classList.remove('spinning'), 500);
}
applyTheme(localStorage.getItem('ab-runner-theme') || 'dark');
if (themeToggle)
  themeToggle.addEventListener('click', () => {
    const cur = localStorage.getItem('ab-runner-theme') || 'dark';
    applyTheme(themes[(themes.indexOf(cur) + 1) % themes.length]);
  });

// Data
async function loadData() {
  try {
    data = await window.api.getData();
    if (!data.folders) data.folders = [];
    if (!data.collections) data.collections = [];
    if (!data.environments) data.environments = [];
    data.folders.forEach((f) => {
      if (f.parentId === undefined) f.parentId = null;
      if (f.collapsed === undefined) f.collapsed = false;
    });
    data.collections.forEach((c) => {
      if (c.folderId === undefined) c.folderId = null;
      if (!c.steps) c.steps = [];
      if (!c.results) c.results = [];
      c.steps.forEach((s) => {
        if (!s.id) s.id = generateStepId();
        normalizeStepScripts(s);
      });
    });
    console.log('✅ Данные загружены:', {
      folders: data.folders.length,
      collections: data.collections.length,
      environments: data.environments.length,
    });
    renderTree();
    renderTabs();
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
    environments: data.environments?.length,
  });
  if (!data.environments) {
    console.error('⚠️ ВНИМАНИЕ: data.environments отсутствует!');
    data.environments = [];
  }
  await window.api.saveData(data);
}

// Shortcuts
document.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    await forceSave();
    toast('Сохранено', 'success', 1500);
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach((m) => {
      m.classList.remove('active');
      m.style.zIndex = '';
    });
    currentStepForSend = null;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && sendRequestModal.classList.contains('active'))
    sendSingleBtn.click();
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
document.addEventListener('click', (e) => {
  if (!e.target.closest('.method-dropdown') && !e.target.closest('.import-dropdown'))
    document.querySelectorAll('.method-dropdown.open').forEach((d) => d.classList.remove('open'));
});
window.addEventListener('beforeunload', () => {
  if (activeCollectionId) cleanupEmptyCollection(activeCollectionId);
});

// Global Buttons
const gJson = document.getElementById('globalJsonGeneratorBtn');
const eNew = document.getElementById('emptyStateNewCollectionBtn');
const eJson = document.getElementById('emptyStateJsonGeneratorBtn');
const ePost = document.getElementById('emptyStateImportPostmanBtn');
if (gJson) gJson.addEventListener('click', () => jsonModal.classList.add('active'));
if (eNew) eNew.addEventListener('click', () => newRootCollectionBtn.click());
if (eJson) eJson.addEventListener('click', () => jsonModal.classList.add('active'));
if (ePost)
  ePost.addEventListener('click', async () => {
    const files = await window.api.openPostmanDialog();
    if (files && files.length > 0) await processPostmanFiles(files);
  });

// Z-Index Observer
const zIndexObs = new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    if (m.type === 'attributes' && m.attributeName === 'class') {
      const el = m.target;
      if (el.classList.contains('modal') && el.classList.contains('active')) {
        let maxZ = 1000;
        document.querySelectorAll('.modal.active').forEach((mm) => {
          if (mm !== el) {
            const z = parseInt(window.getComputedStyle(mm).zIndex) || 1000;
            if (z > maxZ) maxZ = z;
          }
        });
        el.style.zIndex = maxZ + 10;
      }
    }
  });
});
document
  .querySelectorAll('.modal')
  .forEach((m) => zIndexObs.observe(m, { attributes: true, attributeFilter: ['class'] }));
const bodyObs = new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    m.addedNodes.forEach((n) => {
      if (n.nodeType === 1 && n.classList && n.classList.contains('modal'))
        zIndexObs.observe(n, { attributes: true, attributeFilter: ['class'] });
    });
  });
});
bodyObs.observe(document.body, { childList: true });

// Init
renderAppVersion();
loadData();
showEmptyState();
