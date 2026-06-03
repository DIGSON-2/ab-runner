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
  mainWindow.maximize(); // <--- ДОБАВЬТЕ ЭТУ СТРОКУ

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

// ------------------- Запуск коллекции (с поддержкой остановки) -------------------
let currentRun = null; // Храним контроллер для текущей операции

ipcMain.handle('run-collection', async (event, { steps, items, delay, collectionName, environment }) => {
  if (!Array.isArray(items)) return { success: false, error: 'Данные должны быть массивом' };

  // Создаем AbortController для отмены запросов
  const abortController = new AbortController();
  currentRun = { controller: abortController, cancelled: false };

  const env = environment || {};
  let counter = 0;
  const totalRequests = items.length * steps.length;
  const startTime = Date.now();
  const requestTimes = [];

  try {
    for (let i = 0; i < items.length; i++) {
      // Проверяем, не отменили ли выполнение
      if (currentRun?.cancelled) break;

      const item = items[i];
      for (let j = 0; j < steps.length; j++) {
        // Проверяем отмену перед каждым запросом
        if (currentRun?.cancelled) break;

        const step = steps[j];
        const stepName = step.name || `Шаг ${j + 1}`;
        const currentUrl = replacePlaceholders(step.url, item, env);
        let requestBody = null;
        const requestNumber = counter + 1;
        const requestStartTime = Date.now();

        try {
          let data = undefined;
          if (step.body) {
            requestBody = stripJsonComments(replacePlaceholders(step.body, item, env, { toJson: true }));
            if (/json/.test(step.contentType || '')) {
              try { data = JSON.parse(requestBody); } catch (e) { data = requestBody; }
            } else {
              data = requestBody;
            }
          }

          const headers = buildHeaders(step);

          // Передаем signal в axios для возможности отмены
          const response = await axios({
            method: step.method,
            url: currentUrl,
            headers,
            data,
            signal: abortController.signal,
            timeout: 30000, // 30 секунд таймаут на запрос
          });

          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);

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

          const avgTime = requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
          const remainingRequests = totalRequests - counter;
          const etaMs = remainingRequests * avgTime;
          const elapsedMs = Date.now() - startTime;

          mainWindow.webContents.send('progress', {
            itemIndex: i, stepIndex: j,
            item: JSON.stringify(item),
            stepName,
            success: true,
            status: response.status,
            requestBody,
            requestNumber,
            totalRequests,
            requestDuration,
            elapsedMs,
            etaMs,
            avgRequestTime: Math.round(avgTime),
            response: {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              data: response.data,
              url: currentUrl,
            },
          });
        } catch (e) {
          // Проверяем, была ли это отмена
          if (e.name === 'CanceledError' || e.message === 'canceled') {
            break; // Выходим из цикла без ошибки
          }

          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);

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

          const avgTime = requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
          const remainingRequests = totalRequests - counter;
          const etaMs = remainingRequests * avgTime;
          const elapsedMs = Date.now() - startTime;

          mainWindow.webContents.send('progress', {
            itemIndex: i, stepIndex: j,
            item: JSON.stringify(item),
            stepName,
            success: false,
            status,
            error: e.message,
            requestBody: requestBody || null,
            requestNumber,
            totalRequests,
            requestDuration,
            elapsedMs,
            etaMs,
            avgRequestTime: Math.round(avgTime),
            response: e.response ? {
              status: e.response.status,
              statusText: e.response.statusText,
              headers: e.response.headers,
              data: e.response.data,
              url: currentUrl,
            } : null,
          });
        }

        if (delay > 0) {
          // Проверяем отмену во время задержки
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, delay);
            abortController.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('cancelled'));
            });
          }).catch(() => { }); // Игнорируем ошибку отмены задержки
        }
      }
    }
  } finally {
    // Очищаем текущий запуск
    currentRun = null;
  }

  const totalTime = Date.now() - startTime;
  return {
    success: !currentRun?.cancelled,
    totalExecuted: counter,
    totalTime,
    avgTime: requestTimes.length > 0 ? Math.round(requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length) : 0,
    cancelled: currentRun?.cancelled || false
  };
});

// ------------------- Остановка коллекции -------------------
ipcMain.handle('stop-collection', async () => {
  if (currentRun?.controller) {
    currentRun.cancelled = true;
    currentRun.controller.abort();
    mainWindow.webContents.send('collection-stopped');
    currentRun = null;
    return { success: true };
  }
  return { success: false, error: 'Нет активного выполнения' };
});
// ------------------- Очистка истории с фильтрами -------------------
ipcMain.handle('clear-history-filtered', async (event, filters) => {
  const { timeFilter, typeFilter, methodFilter, statusFilter } = filters;
  const now = Date.now();

  const filteredHistory = history.filter(entry => {
    // Фильтр по времени
    if (timeFilter !== 'all') {
      const entryTime = new Date(entry.timestamp).getTime();
      const age = now - entryTime;
      const hours = age / (1000 * 60 * 60);
      const days = hours / 24;

      if (timeFilter === '1h' && hours > 1) return true; // Оставляем
      if (timeFilter === '24h' && hours > 24) return true;
      if (timeFilter === '7d' && days > 7) return true;
      if (timeFilter === '30d' && days > 30) return true;
      if (timeFilter === '90d' && days > 90) return true;
    }

    // Фильтр по типу
    if (typeFilter !== 'all' && entry.type !== typeFilter) return true;

    // Фильтр по методу
    if (methodFilter !== 'all' && entry.method !== methodFilter) return true;

    // Фильтр по статусу
    if (statusFilter === 'success' && !entry.success) return true;
    if (statusFilter === 'error' && entry.success) return true;

    return false; // Удаляем
  });

  history = filteredHistory;
  saveHistory();
  return { success: true, deleted: history.length - filteredHistory.length };
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

// ------------------- Импорт Postman (только файлы) -------------------
ipcMain.handle('open-postman-dialog', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите JSON-файлы Postman',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile', 'multiSelections']
    });
    if (!filePaths || filePaths.length === 0) return [];

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
  } catch (e) {
    console.error('open-postman-dialog error:', e);
    return [];
  }
});

// ------------------- Импорт Postman (только папка) -------------------
ipcMain.handle('open-postman-folder-dialog', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите папку с JSON-файлами Postman',
      properties: ['openDirectory']
    });
    if (!filePaths || filePaths.length === 0) return [];

    const dirPath = filePaths[0];
    const allJsonFiles = [];

    // Рекурсивно собираем все JSON файлы из папки
    function readJsonFilesRecursive(dir, fileList = []) {
      try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              readJsonFilesRecursive(filePath, fileList);
            } else if (stat.isFile() && file.toLowerCase().endsWith('.json')) {
              fileList.push(filePath);
            }
          } catch (e) {
            console.warn('Пропущен файл:', filePath, e.message);
          }
        });
      } catch (e) {
        console.warn('Не удалось прочитать папку:', dir, e.message);
      }
      return fileList;
    }

    readJsonFilesRecursive(dirPath, allJsonFiles);

    if (allJsonFiles.length === 0) {
      return [];
    }

    const results = [];
    for (const filePath of allJsonFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(content);
        results.push({ fileName: path.basename(filePath), data: json });
      } catch (e) {
        console.error('Ошибка парсинга файла:', filePath, e);
        results.push({ fileName: path.basename(filePath), error: e.message });
      }
    }
    return results;
  } catch (e) {
    console.error('open-postman-folder-dialog error:', e);
    return [];
  }
});