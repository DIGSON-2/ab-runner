// main.js – финальная версия с поддержкой Postman Environments
const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron'); // <--- Добавлено nativeTheme
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');
// Принудительно включаем темную тему для всего приложения (включая меню File/Edit/View)
nativeTheme.themeSource = 'dark';
let mainWindow;
const dataPath = path.join(app.getPath('userData'), 'ab-runner-data.json');
const historyPath = path.join(app.getPath('userData'), 'ab-runner-history.json');
const oldCollectionsPath = path.join(app.getPath('userData'), 'ab-runner-collections.json');
let history = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('renderer.html');
}

// ------------------- Автообновление -------------------
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('checking-for-update', () => console.log('Проверка обновлений...'));
autoUpdater.on('update-available', (info) => console.log('Доступно обновление:', info.version));
autoUpdater.on('update-not-available', () => console.log('Обновлений нет'));
autoUpdater.on('error', (err) => console.error('Ошибка автообновления:', err));
autoUpdater.on('download-progress', (p) => console.log(`Загрузка: ${p.percent}%`));
autoUpdater.on('update-downloaded', () => console.log('Обновление загружено'));
ipcMain.handle('check-for-updates', async () => await autoUpdater.checkForUpdatesAndNotify());
ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());

app.whenReady().then(() => {
  loadHistory();
  createWindow();
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ------------------- Очистка строки -------------------
function cleanString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/^\uFEFF/, '').replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
}

// ------------------- Удаление комментариев из JSON -------------------
function stripJsonComments(str) {
  if (typeof str !== 'string') return str;
  let result = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i + 1];

    if (inLineComment) {
      if (c === '\n') { inLineComment = false; result += c; }
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      result += c;
      if (c === '\\' && i + 1 < str.length) { result += str[++i]; continue; }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; result += c; continue; }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    result += c;
  }
  return result;
}

// ------------------- Замена плейсхолдеров -------------------
function replacePlaceholders(template, item, environment = {}, options = {}) {
  if (!template) return template;
  const cleaned = cleanString(template);
  const { toJson = false } = options;
  const env = environment && typeof environment === 'object' ? environment : {};

  if (item === null || typeof item !== 'object') {
    return cleaned.replace(/\{([^{}]+)\}/g, (match, pathStr) => {
      if (pathStr === 'id') return String(item ?? '');
      if (pathStr in env) {
        const v = env[pathStr];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return toJson ? JSON.stringify(v) : match;
        return String(v);
      }
      return match;
    });
  }

  return cleaned.replace(/\{([^{}]+)\}/g, (match, pathStr) => {
    const keys = pathStr.split('.');
    let value = item;
    let foundInItem = true;
    for (const key of keys) {
      if (value === null || value === undefined) { foundInItem = false; break; }
      if (typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        foundInItem = false;
        break;
      }
    }

    if (foundInItem && value !== undefined) {
      if (value === null) return '';
      if (typeof value === 'object') return toJson ? JSON.stringify(value) : match;
      return String(value);
    }

    if (pathStr in env) {
      const v = env[pathStr];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return toJson ? JSON.stringify(v) : match;
      return String(v);
    }

    return match;
  });
}

// ------------------- Формирование заголовков -------------------
function buildHeaders(step) {
  const headers = {};
  if (step.auth && step.auth.trim()) headers['Authorization'] = step.auth.trim();
  if (step.contentType && step.contentType.trim()) headers['Content-Type'] = step.contentType.trim();
  if (Array.isArray(step.customHeaders)) {
    step.customHeaders.forEach(h => {
      if (h && h.enabled !== false && h.key && h.key.trim()) {
        headers[h.key.trim()] = h.value || '';
      }
    });
  } else if (step.customHeaders && typeof step.customHeaders === 'object') {
    Object.entries(step.customHeaders).forEach(([key, value]) => {
      if (key && key.trim()) headers[key.trim()] = value || '';
    });
  }
  return headers;
}

// ------------------- История -------------------
function loadHistory() {
  try {
    if (fs.existsSync(historyPath)) {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    }
  } catch (e) { history = []; }
}

function saveHistory() {
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
}

function addToHistory(entry) {
  history.unshift(entry);
  saveHistory();
}

// ------------------- Данные -------------------
function migrateOldData() {
  if (fs.existsSync(dataPath)) return;
  const data = { folders: [], collections: [], environments: [] };
  if (fs.existsSync(oldCollectionsPath)) {
    try {
      const old = JSON.parse(fs.readFileSync(oldCollectionsPath, 'utf8'));
      if (Array.isArray(old)) data.collections = old.map(c => ({ ...c, folderId: null }));
      fs.renameSync(oldCollectionsPath, oldCollectionsPath + '.backup');
    } catch (e) { }
  }
  writeData(data);
}

function readData() {
  migrateOldData();
  try {
    const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    if (!d.environments) d.environments = [];
    return d;
  } catch (e) { }
  return { folders: [], collections: [], environments: [] };
}

function writeData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

ipcMain.handle('get-data', async () => readData());
ipcMain.handle('save-data', async (event, d) => {
  writeData(d);
  return { success: true };
});

// ------------------- Запуск коллекции -------------------
ipcMain.handle('run-collection', async (event, { steps, items, delay, collectionName, environment }) => {
  if (!Array.isArray(items)) return { success: false, error: 'Данные должны быть массивом' };
  const env = environment || {};
  let counter = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    for (let j = 0; j < steps.length; j++) {
      const step = steps[j];
      const stepName = step.name || `Шаг ${j + 1}`;
      const currentUrl = replacePlaceholders(step.url, item, env);
      let requestBody = null;

      try {
        let data = undefined;
        if (step.body) {
          requestBody = stripJsonComments(replacePlaceholders(step.body, item, env, { toJson: true }));
          // Безопасный парсинг JSON
          if (/json/.test(step.contentType || '')) {
            try { data = JSON.parse(requestBody); } catch (e) { data = requestBody; }
          } else {
            data = requestBody;
          }
        }

        const headers = buildHeaders(step);
        const response = await axios({
          method: step.method,
          url: currentUrl,
          headers,
          data,
        });

        counter++;
        addToHistory({
          timestamp: new Date().toISOString(),
          collection: collectionName,
          type: 'collection',
          item: JSON.stringify(item),
          stepName,
          url: currentUrl,
          method: step.method,
          status: response.status,
          success: true,
          responseData: response.data,
          responseHeaders: response.headers,
          requestBody,
          requestHeaders: headers,
        });

        mainWindow.webContents.send('progress', {
          itemIndex: i, stepIndex: j,
          item: JSON.stringify(item),
          stepName,
          success: true,
          status: response.status,
          requestBody,
          response: {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data,
            url: currentUrl,
          },
        });
      } catch (e) {
        const status = e.response ? e.response.status : e.message;
        addToHistory({
          timestamp: new Date().toISOString(),
          collection: collectionName,
          type: 'collection',
          item: JSON.stringify(item),
          stepName,
          url: currentUrl,
          method: step.method,
          status,
          success: false,
          error: e.message,
          responseData: e.response?.data,
          responseHeaders: e.response?.headers,
        });

        mainWindow.webContents.send('progress', {
          itemIndex: i, stepIndex: j,
          item: JSON.stringify(item),
          stepName,
          success: false,
          status,
          error: e.message,
          requestBody: requestBody || null,
          response: e.response ? {
            status: e.response.status,
            statusText: e.response.statusText,
            headers: e.response.headers,
            data: e.response.data,
            url: currentUrl,
          } : null,
        });
      }

      if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }
  }

  return { success: true, totalExecuted: counter };
});

// ------------------- Одиночный запрос -------------------
ipcMain.handle('send-single-request', async (event, { step, testData, collectionName, environment }) => {
  const env = environment || {};
  try {
    const item = testData ? JSON.parse(testData) : {};
    const currentUrl = replacePlaceholders(step.url, item, env);
    let requestBody = null;
    if (step.body) {
      requestBody = stripJsonComments(replacePlaceholders(step.body, item, env, { toJson: true }));
    }

    let data = undefined;
    if (requestBody) {
      data = /json/.test(step.contentType || '') ? JSON.parse(requestBody) : requestBody;
    }

    const requestHeaders = buildHeaders(step);
    const response = await axios({
      method: step.method,
      url: currentUrl,
      headers: requestHeaders,
      data,
    });

    addToHistory({
      timestamp: new Date().toISOString(),
      collection: collectionName || '',
      type: 'single',
      item: testData || '{}',
      stepName: step.name || 'Одиночный запрос',
      url: currentUrl,
      method: step.method,
      status: response.status,
      success: true,
      responseData: response.data,
      responseHeaders: response.headers,
      requestBody,
      requestHeaders,
    });

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      url: currentUrl,
      requestBody,
      requestHeaders,
    };
  } catch (e) {
    const err = e.response ? {
      success: false,
      status: e.response.status,
      statusText: e.response.statusText,
      headers: e.response.headers,
      data: e.response.data,
      url: e.config?.url || '',
      requestBody: e.config?.data || null,
      requestHeaders: e.config?.headers || {},
    } : {
      success: false,
      status: 0,
      statusText: e.message,
      headers: {},
      data: null,
      url: '',
      requestBody: null,
      requestHeaders: {},
    };

    addToHistory({
      timestamp: new Date().toISOString(),
      collection: collectionName || '',
      type: 'single',
      item: testData || '{}',
      stepName: step.name || 'Одиночный запрос',
      url: err.url,
      method: step.method,
      status: err.status,
      success: false,
      error: e.message,
      responseData: err.data,
      responseHeaders: err.headers,
    });

    return err;
  }
});

// ------------------- История -------------------
ipcMain.handle('get-history', async () => history);
ipcMain.handle('clear-history', async () => {
  history = [];
  saveHistory();
  return { success: true };
});

// ------------------- Сохранение файла -------------------
ipcMain.handle('save-file-dialog', async (event, content, defaultName = 'data.json') => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Сохранить JSON-файл',
    defaultPath: defaultName,
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, filePath };
  }
  return { success: false };
});

// ------------------- Импорт Postman -------------------
ipcMain.handle('open-postman-dialog', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Импорт из Postman (коллекции и окружения)',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile', 'multiSelections']
    });
    if (filePaths && filePaths.length > 0) {
      const results = [];
      for (const p of filePaths) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          const json = JSON.parse(content);
          results.push({ fileName: path.basename(p), data: json });
        } catch (e) {
          console.error('Ошибка парсинга файла:', p, e);
          results.push({ fileName: path.basename(p), error: e.message });
        }
      }
      return results;
    }
    return [];
  } catch (e) {
    console.error('open-postman-dialog error:', e);
    return [];
  }
});