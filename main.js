// main.js – полная финальная версия со Splash Screen, автообновлениями и всеми типами Auth/Body
const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');
const FormData = require('form-data');
const { stripJsonComments } = require('./src/shared/strings');
const { replacePlaceholders } = require('./src/shared/placeholders');
const { buildHeaders } = require('./src/shared/auth');

// Принудительно включаем темную тему для нативных меню Electron
nativeTheme.themeSource = 'dark';

let mainWindow;
let splashWindow;

const dataPath = path.join(app.getPath('userData'), 'ab-runner-data.json');
const historyPath = path.join(app.getPath('userData'), 'ab-runner-history.json');
const oldCollectionsPath = path.join(app.getPath('userData'), 'ab-runner-collections.json');

let history = [];

// ================== Splash Screen ==================
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const iconPath = path.join(__dirname, 'assets', 'icon.ico').replace(/\\/g, '/');

  splashWindow.loadURL(`data:text/html;charset=utf-8,
<!DOCTYPE html>
<html>
<head>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            width: 100vw; height: 100vh;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: #1a1a2e; border-radius: 20px; overflow: hidden;
            -webkit-app-region: drag;
        }
        .icon-container { width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; animation: pulse 2s ease-in-out infinite; }
        .icon-container img { width: 180px; height: 180px; object-fit: contain; filter: drop-shadow(0 0 30px rgba(108, 99, 255, 0.6)); }
        .app-name { margin-top: 24px; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 28px; font-weight: 700; color: #e0e0e0; letter-spacing: 2px; text-transform: uppercase; }
        .loading-bar { margin-top: 20px; width: 160px; height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; }
        .loading-bar-fill { width: 40%; height: 100%; background: linear-gradient(90deg, #6c63ff, #ff4d6d); border-radius: 2px; animation: loading 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.9; } }
        @keyframes loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
    </style>
</head>
<body>
    <div class="icon-container"><img src="file://${iconPath}" alt="AB Runner" onerror="this.style.display='none'"></div>
    <div class="app-name">AB Runner</div>
    <div class="loading-bar"><div class="loading-bar-fill"></div></div>
</body>
</html>`);

  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
}

// ================== Main Window ==================
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#1a1a2e',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    title: 'AB Runner',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('renderer.html');

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ================== Auto Updater ==================
function initAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => console.log('Проверка обновлений...'));
  autoUpdater.on('update-available', (info) => console.log('Доступно обновление:', info.version));
  autoUpdater.on('update-not-available', () => console.log('Обновлений нет'));
  autoUpdater.on('error', (err) => console.error('Ошибка автообновления:', err));
  autoUpdater.on('download-progress', (p) => console.log(`Загрузка: ${Math.round(p.percent)}%`));
  autoUpdater.on('update-downloaded', () => console.log('Обновление загружено'));

  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error('Ошибка проверки обновлений:', err);
  });
}

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { success: false, error: 'Not packaged' };
  return await autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

// ================== App Lifecycle ==================
app.whenReady().then(() => {
  loadHistory();
  migrateOldData();
  createSplashWindow();
  createMainWindow();
  initAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
    createMainWindow();
  }
});

// ================== Request Body ==================
function buildRequestBody(step, item, env) {
  const bodyType = step.bodyType || 'raw';

  switch (bodyType) {
    case 'none':
      return { data: undefined, headers: {} };
    case 'form-data': {
      const form = new FormData();
      if (Array.isArray(step.formData)) {
        step.formData.forEach(field => {
          if (field.enabled === false || !field.key) return;
          const key = replacePlaceholders(field.key, item, env);
          if (field.type === 'file' && field.filePath) {
            try { form.append(key, fs.createReadStream(field.filePath)); } catch (e) { console.error('Ошибка чтения файла:', field.filePath, e); }
          } else {
            form.append(key, replacePlaceholders(field.value || '', item, env));
          }
        });
      }
      return { data: form, headers: form.getHeaders() };
    }
    case 'urlencoded': {
      const params = new URLSearchParams();
      if (Array.isArray(step.urlencoded)) {
        step.urlencoded.forEach(field => {
          if (field.enabled === false || !field.key) return;
          params.append(replacePlaceholders(field.key, item, env), replacePlaceholders(field.value || '', item, env));
        });
      }
      return { data: params, headers: {} };
    }
    case 'raw': {
      let body = stripJsonComments(replacePlaceholders(step.body || '', item, env, { toJson: true }));
      let data;
      if (step.rawType === 'json') { try { data = JSON.parse(body); } catch { data = body; } }
      else { data = body; }
      return { data, headers: {} };
    }
    case 'binary': {
      if (step.binaryPath && fs.existsSync(step.binaryPath)) return { data: fs.readFileSync(step.binaryPath), headers: {} };
      return { data: undefined, headers: {} };
    }
    case 'graphql': {
      const query = replacePlaceholders(step.graphql?.query || '', item, env);
      let variables = {};
      if (step.graphql?.variables && step.graphql.variables.trim()) {
        try {
          variables = JSON.parse(replacePlaceholders(step.graphql.variables, item, env, { toJson: true }));
        } catch (e) {
          console.error('GraphQL variables parse error:', e.message);
        }
      }
      return { data: { query, variables }, headers: {} };
    }
    default:
      return { data: undefined, headers: {} };
  }
}

// ================== History ==================
function loadHistory() {
  try {
    if (fs.existsSync(historyPath)) history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  } catch { history = []; }
}

function saveHistory() {
  try { fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8'); } catch (e) { console.error('Ошибка сохранения истории:', e); }
}

function addToHistory(entry) {
  history.unshift(entry);
  saveHistory();
}

// ================== Data (Async Write) ==================
function migrateOldData() {
  if (fs.existsSync(dataPath)) return;
  const data = { folders: [], collections: [], environments: [] };
  if (fs.existsSync(oldCollectionsPath)) {
    try {
      const old = JSON.parse(fs.readFileSync(oldCollectionsPath, 'utf8'));
      if (Array.isArray(old)) data.collections = old.map(c => ({ ...c, folderId: null }));
      fs.renameSync(oldCollectionsPath, oldCollectionsPath + '.backup');
    } catch (e) { console.error('Ошибка миграции старых данных:', e); }
  }
  writeData(data);
}

function readData() {
  try {
    const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    if (!d.folders) d.folders = [];
    if (!d.collections) d.collections = [];
    if (!d.environments) d.environments = [];
    return d;
  } catch { return { folders: [], collections: [], environments: [] }; }
}

let lastWrittenJson = '';
let writePromise = null;

async function writeData(data) {
  const json = JSON.stringify(data, null, 2);

  // ЗАЩИТА: Не сохраняем пустые данные, если раньше что-то было
  const isEmpty = (!data.folders || data.folders.length === 0) &&
    (!data.collections || data.collections.length === 0);

  if (isEmpty && lastWrittenJson && lastWrittenJson.length > 100) {
    console.warn('⚠️ Попытка сохранить пустые данные — игнорируем!');
    return;
  }

  // Не пишем если данные не изменились
  if (json === lastWrittenJson) return;

  // Ждём завершения предыдущей записи
  if (writePromise) await writePromise;

  writePromise = (async () => {
    try {
      // Backup перед записью
      if (fs.existsSync(dataPath)) {
        const backupPath = dataPath + '.backup';
        await fs.promises.copyFile(dataPath, backupPath);
      }
      // Асинхронная запись
      await fs.promises.writeFile(dataPath, json, 'utf8');
      lastWrittenJson = json;
    } catch (e) {
      console.error('Ошибка записи данных:', e);
      throw e;
    } finally {
      writePromise = null;
    }
  })();

  await writePromise;
}

ipcMain.handle('get-data', async () => readData());
ipcMain.handle('save-data', async (event, d) => { await writeData(d); return { success: true }; });

// ================== Run Collection ==================
let currentRun = null;

// Safely send to the renderer; the window may have been closed mid-run.
function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

ipcMain.handle('run-collection', async (event, { steps, items, delay, collectionName, environment }) => {
  if (!Array.isArray(items)) return { success: false, error: 'Данные должны быть массивом' };

  const abortController = new AbortController();
  currentRun = { controller: abortController, cancelled: false };

  const env = environment || {};
  let counter = 0;
  let wasCancelled = false;
  const totalRequests = items.length * steps.length;
  const startTime = Date.now();
  const requestTimes = [];

  try {
    for (let i = 0; i < items.length; i++) {
      if (currentRun?.cancelled) break;
      const item = items[i];
      for (let j = 0; j < steps.length; j++) {
        if (currentRun?.cancelled) break;

        const step = steps[j];
        const stepName = step.name || `Шаг ${j + 1}`;
        const currentUrl = replacePlaceholders(step.url, item, env);
        const requestNumber = counter + 1;
        const requestStartTime = Date.now();

        try {
          const { data, headers: bodyHeaders } = buildRequestBody(step, item, env);
          const headers = { ...buildHeaders(step, currentUrl, step.method), ...bodyHeaders };
          const requestBody = typeof data === 'string' ? data : (data ? JSON.stringify(data) : null);

          const response = await axios({
            method: step.method, url: currentUrl, headers, data,
            signal: abortController.signal, timeout: 30000,
          });

          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);

          addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: step.method, status: response.status, success: true, responseData: response.data, responseHeaders: response.headers, requestBody, requestHeaders: headers });

          const avgTime = requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
          sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: true, status: response.status, requestBody, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: Math.round(avgTime), response: { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl } });
        } catch (e) {
          if (e.name === 'CanceledError' || e.message === 'canceled') break;
          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);
          const status = e.response ? e.response.status : e.message;

          addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: step.method, status, success: false, error: e.message, responseData: e.response?.data, responseHeaders: e.response?.headers });

          const avgTime = requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
          sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: false, status, error: e.message, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: Math.round(avgTime), response: e.response ? { status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: currentUrl } : null });
        }

        if (delay > 0) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, delay);
            abortController.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('cancelled')); });
          }).catch(() => { });
        }
      }
    }
  } finally {
    wasCancelled = currentRun?.cancelled || false;
    currentRun = null;
  }

  return { success: !wasCancelled, totalExecuted: counter, totalTime: Date.now() - startTime, avgTime: requestTimes.length > 0 ? Math.round(requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length) : 0, cancelled: wasCancelled };
});

// ================== Stop Collection ==================
ipcMain.handle('stop-collection', async () => {
  if (currentRun?.controller) {
    // Mark cancelled and abort, but let run-collection clear currentRun in its
    // finally block so the run loop still observes the cancelled flag.
    currentRun.cancelled = true;
    currentRun.controller.abort();
    sendToRenderer('collection-stopped');
    return { success: true };
  }
  return { success: false, error: 'Нет активного выполнения' };
});

// ================== Clear History Filtered ==================
ipcMain.handle('clear-history-filtered', async (event, filters) => {
  const { timeFilter, typeFilter, methodFilter, statusFilter } = filters;
  const now = Date.now();
  const beforeCount = history.length;

  const filteredHistory = history.filter(entry => {
    if (timeFilter !== 'all') {
      const age = (now - new Date(entry.timestamp).getTime()) / 3600000;
      const days = age / 24;
      if ((timeFilter === '1h' && age > 1) || (timeFilter === '24h' && age > 24) || (timeFilter === '7d' && days > 7) || (timeFilter === '30d' && days > 30) || (timeFilter === '90d' && days > 90)) return true;
    }
    if (typeFilter !== 'all' && entry.type !== typeFilter) return true;
    if (methodFilter !== 'all' && entry.method !== methodFilter) return true;
    if (statusFilter === 'success' && !entry.success) return true;
    if (statusFilter === 'error' && entry.success) return true;
    return false;
  });

  history = filteredHistory;
  saveHistory();
  return { success: true, deleted: beforeCount - filteredHistory.length };
});

// ================== Single Request ==================
ipcMain.handle('send-single-request', async (event, { step, testData, collectionName, environment }) => {
  const env = environment || {};
  try {
    const item = testData ? JSON.parse(testData) : {};
    const currentUrl = replacePlaceholders(step.url, item, env);
    const { data, headers: bodyHeaders } = buildRequestBody(step, item, env);
    const requestHeaders = { ...buildHeaders(step, currentUrl, step.method), ...bodyHeaders };
    const requestBody = typeof data === 'string' ? data : (data ? JSON.stringify(data) : null);

    const response = await axios({ method: step.method, url: currentUrl, headers: requestHeaders, data });

    addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || 'Одиночный запрос', url: currentUrl, method: step.method, status: response.status, success: true, responseData: response.data, responseHeaders: response.headers, requestBody, requestHeaders });

    return { success: true, status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl, requestBody, requestHeaders };
  } catch (e) {
    const err = e.response ? { success: false, status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: e.config?.url || '', requestBody: e.config?.data || null, requestHeaders: e.config?.headers || {} } : { success: false, status: 0, statusText: e.message, headers: {}, data: null, url: '', requestBody: null, requestHeaders: {} };

    addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || 'Одиночный запрос', url: err.url, method: step.method, status: err.status, success: false, error: e.message, responseData: err.data, responseHeaders: err.headers });
    return err;
  }
});

// ================== History IPC ==================
ipcMain.handle('get-history', async () => history);
ipcMain.handle('clear-history', async () => { history = []; saveHistory(); return { success: true }; });

// ================== Save File Dialog ==================
ipcMain.handle('save-file-dialog', async (event, content, defaultName = 'data.json') => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, { title: 'Сохранить JSON-файл', defaultPath: defaultName, filters: [{ name: 'JSON Files', extensions: ['json'] }] });
  if (filePath) { fs.writeFileSync(filePath, content, 'utf8'); return { success: true, filePath }; }
  return { success: false };
});

// ================== Postman Import ==================
ipcMain.handle('open-postman-dialog', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Выберите JSON-файлы Postman', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile', 'multiSelections'] });
    if (!filePaths || filePaths.length === 0) return [];
    const results = [];
    for (const p of filePaths) {
      try { results.push({ fileName: path.basename(p), data: JSON.parse(fs.readFileSync(p, 'utf8')) }); }
      catch (e) { results.push({ fileName: path.basename(p), error: e.message }); }
    }
    return results;
  } catch (e) {
    console.error('Postman import dialog error:', e.message);
    return [];
  }
});

ipcMain.handle('open-postman-folder-dialog', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Выберите папку с JSON-файлами Postman', properties: ['openDirectory'] });
    if (!filePaths || filePaths.length === 0) return [];
    const dirPath = filePaths[0];
    const allJsonFiles = [];
    function readJsonFilesRecursive(dir, fileList = []) {
      try {
        fs.readdirSync(dir).forEach(file => {
          const filePath = path.join(dir, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) readJsonFilesRecursive(filePath, fileList);
            else if (stat.isFile() && file.toLowerCase().endsWith('.json')) fileList.push(filePath);
          } catch (e) {
            console.error('Postman import: cannot stat', filePath, e.message);
          }
        });
      } catch (e) {
        console.error('Postman import: cannot read directory', dir, e.message);
      }
      return fileList;
    }
    readJsonFilesRecursive(dirPath, allJsonFiles);
    if (allJsonFiles.length === 0) return [];
    const results = [];
    for (const filePath of allJsonFiles) {
      try { results.push({ fileName: path.basename(filePath), data: JSON.parse(fs.readFileSync(filePath, 'utf8')) }); }
      catch (e) { results.push({ fileName: path.basename(filePath), error: e.message }); }
    }
    return results;
  } catch (e) {
    console.error('Postman folder import dialog error:', e.message);
    return [];
  }
});