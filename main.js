// main.js – полная финальная версия со Splash Screen, автообновлениями и всеми типами Auth/Body
const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');
const FormData = require('form-data');
const { repairJsonText } = require('./src/shared/strings');
const { replacePlaceholders } = require('./src/shared/placeholders');
const { buildHeaders } = require('./src/shared/auth');
const { executeScript } = require('./src/shared/scriptRunner');

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
function sendUpdaterEvent(channel, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function initAutoUpdater() {
  if (!app.isPackaged) {
    console.log('Auto updater disabled: app is not packaged');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
    sendUpdaterEvent('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    sendUpdaterEvent('update-available', info);
    sendUpdaterEvent('update-status', { status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('No updates available');
    sendUpdaterEvent('update-not-available', info);
    sendUpdaterEvent('update-status', { status: 'current' });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto update error:', err);
    sendUpdaterEvent('update-error', { message: err.message || String(err) });
    sendUpdaterEvent('update-status', { status: 'error', message: err.message || String(err) });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent || 0);
    console.log(`Update download: ${percent}%`);
    sendUpdaterEvent('update-download-progress', { percent });
    sendUpdaterEvent('update-status', { status: 'downloading', percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded');
    sendUpdaterEvent('update-downloaded', info);
    sendUpdaterEvent('update-status', { status: 'downloaded' });
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('Update check error:', err);
    sendUpdaterEvent('update-error', { message: err.message || String(err) });
  });
}

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return { success: false, error: 'Auto updates work only in packaged builds' };
  }

  try {
    const result = await autoUpdater.checkForUpdatesAndNotify();
    return { success: true, updateInfo: result?.updateInfo || null };
  } catch (e) {
    console.error('Manual update check error:', e);
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
  return { success: true };
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
      let body = replacePlaceholders(step.body || '', item, env, { toJson: true });
      let data;
      if (step.rawType === 'json') {
        body = repairJsonText(body);
        data = JSON.parse(body);
      } else {
        data = body;
      }
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

// ================== History (Batched) ==================
let historyWritePending = false;
let historyWriteTimer = null;
const HISTORY_BATCH_SIZE = 50;
const HISTORY_BATCH_MS = 5000;

function loadHistory() {
  try {
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, 'utf8');
      history = JSON.parse(raw);
      // Trim history to last 500 entries on load to manage file size
      if (history.length > 500) {
        history = history.slice(0, 500);
        saveHistorySync();
      }
    }
  } catch { history = []; }
}

function saveHistorySync() {
  try { fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8'); } catch (e) { console.error('Ошибка сохранения истории:', e); }
}

function scheduleHistorySave() {
  if (historyWriteTimer) clearTimeout(historyWriteTimer);
  historyWriteTimer = setTimeout(() => {
    saveHistorySync();
    historyWritePending = false;
    historyWriteTimer = null;
  }, HISTORY_BATCH_MS);
}

function addToHistory(entry) {
  history.unshift(entry);

  // Batch: save only every N entries or after timeout
  if (!historyWritePending || history.length % HISTORY_BATCH_SIZE === 0) {
    historyWritePending = true;
    scheduleHistorySave();
  }
}

// ================== Recent Collections ==================
function updateRecentCollection(collectionId, reason = 'viewed') {
  if (!collectionId) return;

  const data = readData();
  if (!data.recentCollections) data.recentCollections = [];

  const now = Date.now();
  const existing = data.recentCollections.findIndex(r => r.collectionId === collectionId);

  if (existing >= 0) {
    // Update existing entry
    data.recentCollections[existing].timestamp = now;
    data.recentCollections[existing].reason = reason;
  } else {
    // Add new entry
    data.recentCollections.push({
      collectionId,
      timestamp: now,
      reason
    });
  }

  // Keep only 20 most recent
  data.recentCollections.sort((a, b) => b.timestamp - a.timestamp);
  data.recentCollections = data.recentCollections.slice(0, 20);

  writeData(data);
}

function cleanExpiredRecentCollections(data) {
  if (!data.recentCollections) return;
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  data.recentCollections = data.recentCollections.filter(r => r.timestamp > thirtyDaysAgo);
}

ipcMain.handle('update-recent-collection', async (event, collectionId, reason) => {
  updateRecentCollection(collectionId, reason);
  return { success: true };
});

ipcMain.handle('get-recent-collections', async () => {
  const data = readData();
  return data.recentCollections || [];
});

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
    if (!d.recentCollections) d.recentCollections = [];
    cleanExpiredRecentCollections(d);

    // Initialize scripts field for all steps (backward compatibility)
    d.collections.forEach(c => {
      if (!Array.isArray(c.steps)) c.steps = [];
      c.steps.forEach(step => {
        if (!step.scripts) {
          step.scripts = {
            prerequest: { enabled: false, code: '', timeout: 5000 },
            postresponse: { enabled: false, code: '', timeout: 5000 }
          };
        }
      });
    });

    return d;
  } catch { return { folders: [], collections: [], environments: [], recentCollections: [] }; }
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

function normalizeImportedAppData(input) {
  const importedData = input && input.data && typeof input.data === 'object' ? input.data : input;
  if (!importedData || typeof importedData !== 'object') throw new Error('File is not an AB Runner backup');

  return {
    folders: Array.isArray(importedData.folders) ? importedData.folders : [],
    collections: Array.isArray(importedData.collections) ? importedData.collections : [],
    environments: Array.isArray(importedData.environments) ? importedData.environments : [],
    activeEnvironmentId: importedData.activeEnvironmentId || '',
    recentCollections: Array.isArray(importedData.recentCollections) ? importedData.recentCollections : [],
  };
}

ipcMain.handle('export-app-backup', async () => {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const backup = {
      app: 'AB Runner',
      version: app.getVersion(),
      exportedAt: new Date().toISOString(),
      data: readData(),
      history,
    };
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save AB Runner backup',
      defaultPath: `ab-runner-backup-${stamp}.json`,
      filters: [{ name: 'AB Runner Backup', extensions: ['json'] }],
    });
    if (!filePath) return { success: false, cancelled: true };
    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf8');
    return { success: true, filePath };
  } catch (e) {
    console.error('Backup export error:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('import-app-backup', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select AB Runner backup',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true };

    const parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    const nextData = normalizeImportedAppData(parsed);
    const nextHistory = Array.isArray(parsed.history) ? parsed.history : [];

    await writeData(nextData);
    history = nextHistory;
    saveHistorySync();

    return {
      success: true,
      filePath: filePaths[0],
      counts: {
        folders: nextData.folders.length,
        collections: nextData.collections.length,
        environments: nextData.environments.length,
        history: nextHistory.length,
      },
    };
  } catch (e) {
    console.error('Backup import error:', e);
    return { success: false, error: e.message };
  }
});

// ================== Run Collection ==================
let currentRun = null;

// Safely send to the renderer; the window may have been closed mid-run.
function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// Calculate average time once per progress update
function getAvgTime(requestTimes) {
  return requestTimes.length > 0 ? Math.round(requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length) : 0;
}

function serializeRequestBody(data) {
  return typeof data === 'string' ? data : (data == null ? null : JSON.stringify(data));
}

function buildStepRequestState(step, item, env) {
  const url = replacePlaceholders(step.url, item, env);
  const { data, headers: bodyHeaders } = buildRequestBody(step, item, env);
  return {
    method: step.method || 'GET',
    url,
    headers: { ...buildHeaders(step, url, step.method, item, env), ...bodyHeaders },
    body: data,
  };
}

function applyRequestStatePlaceholders(state, item, env) {
  state.url = replacePlaceholders(state.url, item, env);
  Object.keys(state.headers || {}).forEach((key) => {
    state.headers[key] = replacePlaceholders(state.headers[key], item, env);
  });
}

async function sendScriptRequest(options, item, env, signal) {
  const requestOptions = options || {};
  const headers = { ...(requestOptions.headers || {}) };
  const method = requestOptions.method || 'GET';
  const url = replacePlaceholders(requestOptions.url || '', item, env);
  const data = requestOptions.data !== undefined ? requestOptions.data : requestOptions.body;

  Object.keys(headers).forEach((key) => {
    headers[key] = replacePlaceholders(headers[key], item, env);
  });

  try {
    const res = await axios({
      method,
      url,
      headers,
      data,
      timeout: requestOptions.timeout || 30000,
      signal,
    });
    return { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data };
  } catch (err) {
    if (err.response) {
      return {
        status: err.response.status,
        statusText: err.response.statusText,
        headers: err.response.headers,
        data: err.response.data,
      };
    }
    throw err;
  }
}

async function runStepForScript(stepId, data, steps, env, signal) {
  const targetStep = (steps || []).find((s) => s.id === stepId);
  if (!targetStep) throw new Error(`Step ${stepId} not found`);
  const state = buildStepRequestState(targetStep, data || {}, env);
  applyRequestStatePlaceholders(state, data || {}, env);
  return await sendScriptRequest(state, data || {}, env, signal);
}

function createScriptCallbacks(steps, item, env, signal) {
  return {
    runStep: async (stepId, data) => runStepForScript(stepId, data || item || {}, steps, env, signal),
    sendRequest: async (options) => sendScriptRequest(options, item || {}, env, signal),
  };
}

function getScriptCode(step, type) {
  const code = step?.scripts?.[type]?.code;
  return code == null || code === 'undefined' ? '' : String(code);
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
        let currentUrl = replacePlaceholders(step.url, item, env);
        const requestNumber = counter + 1;
        const requestStartTime = Date.now();
        let requestBody = null;
        let requestHeaders = {};
        let requestMethod = step.method;

        try {
          const stepEnv = env;
          const requestState = buildStepRequestState(step, item, stepEnv);
          currentUrl = requestState.url;

          // Execute pre-request script if enabled
          const prerequestCode = getScriptCode(step, 'prerequest');
          if (prerequestCode) {
            const scriptResult = await executeScript(
              prerequestCode,
              {
                env: stepEnv,
                step,
                data: item,
                request: requestState,
                callbacks: createScriptCallbacks(steps, item, stepEnv, abortController.signal),
              },
              step.scripts.prerequest.timeout || 5000
            );

            if (!scriptResult.success) {
              counter++;
              const requestDuration = Date.now() - requestStartTime;
              requestTimes.push(requestDuration);
              addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: step.method, status: 0, success: false, error: `Pre-request script error: ${scriptResult.error}`, responseData: null, responseHeaders: {} });
              const avgTime = getAvgTime(requestTimes);
              sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: false, status: 0, error: `Script: ${scriptResult.error}`, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: null });
              continue;
            }

            if (scriptResult.skipRequest) {
              counter++;
              const requestDuration = Date.now() - requestStartTime;
              requestTimes.push(requestDuration);
              addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: step.method, status: 0, success: true, responseData: { skipped: true }, responseHeaders: {} });
              const avgTime = getAvgTime(requestTimes);
              sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: true, status: 0, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: { status: 0, statusText: 'Skipped', headers: {}, data: { skipped: true }, url: currentUrl } });
              continue;
            }

            if (scriptResult.abortCollection) {
              throw new Error(`Collection aborted: ${scriptResult.error}`);
            }

            // Update env with any changes made by script
            if (scriptResult.env) Object.assign(stepEnv, scriptResult.env);
          }

          applyRequestStatePlaceholders(requestState, item, stepEnv);
          currentUrl = requestState.url;
          requestBody = serializeRequestBody(requestState.body);
          requestHeaders = requestState.headers;
          requestMethod = requestState.method;

          const response = await axios({
            method: requestState.method,
            url: requestState.url,
            headers: requestState.headers,
            data: requestState.body,
            signal: abortController.signal, timeout: 30000,
          });

          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);

          // Execute post-response script if enabled
          const postresponseCode = getScriptCode(step, 'postresponse');
          if (postresponseCode) {
            try {
              const scriptResult = await executeScript(
                postresponseCode,
                {
                  env: stepEnv,
                  step,
                  data: item,
                  response: { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data },
                  request: requestState,
                  callbacks: createScriptCallbacks(steps, item, stepEnv, abortController.signal),
                },
                step.scripts.postresponse.timeout || 5000
              );

              if (!scriptResult.success) {
                console.error('Post-response script error:', scriptResult.error);
              }
            } catch (scriptErr) {
              console.error('Post-response script execution error:', scriptErr);
            }
          }

          addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: requestState.method, status: response.status, success: true, responseData: response.data, responseHeaders: response.headers, requestBody, requestHeaders: requestState.headers });

          const avgTime = getAvgTime(requestTimes);
          sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: true, status: response.status, requestBody, requestHeaders, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl } });
        } catch (e) {
          if (e.name === 'CanceledError' || e.message === 'canceled') break;
          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);
          const status = e.response ? e.response.status : e.message;

          addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: requestMethod, status, success: false, error: e.message, responseData: e.response?.data, responseHeaders: e.response?.headers, requestBody, requestHeaders });

          const avgTime = getAvgTime(requestTimes);
          sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: false, status, error: e.message, requestBody, requestHeaders, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: e.response ? { status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: currentUrl } : null });
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

  // Track collection usage
  updateRecentCollection(collectionName, 'executed');

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
  saveHistorySync();
  return { success: true, deleted: beforeCount - filteredHistory.length };
});

// ================== Single Request ==================
ipcMain.handle('send-single-request', async (event, { step, testData, collectionName, environment, collectionSteps }) => {
  const env = environment || {};
  try {
    const item = testData ? JSON.parse(testData) : {};
    const requestState = buildStepRequestState(step, item, env);
    let currentUrl = requestState.url;

    const prerequestCode = getScriptCode(step, 'prerequest');
    if (prerequestCode) {
      const scriptResult = await executeScript(
        prerequestCode,
        {
          env,
          step,
          data: item,
          request: requestState,
          callbacks: createScriptCallbacks(collectionSteps || [], item, env, undefined),
        },
        step.scripts.prerequest.timeout || 5000
      );

      if (!scriptResult.success) {
        if (scriptResult.abortCollection) throw new Error(`Aborted: ${scriptResult.error}`);
        return { success: false, status: 0, statusText: `Pre-request script error: ${scriptResult.error}`, headers: {}, data: null, url: currentUrl, requestBody: null, requestHeaders: {} };
      }

      if (scriptResult.skipRequest) {
        const requestBody = serializeRequestBody(requestState.body);
        addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || '��������� ������', url: currentUrl, method: requestState.method, status: 0, success: true, responseData: { skipped: true }, responseHeaders: {}, requestBody, requestHeaders: requestState.headers });
        if (collectionName) updateRecentCollection(collectionName, 'executed');
        return { success: true, status: 0, statusText: 'Skipped', headers: {}, data: { skipped: true }, url: currentUrl, requestBody, requestHeaders: requestState.headers };
      }

      if (scriptResult.env) Object.assign(env, scriptResult.env);
    }

    applyRequestStatePlaceholders(requestState, item, env);
    currentUrl = requestState.url;
    const requestBody = serializeRequestBody(requestState.body);
    const response = await axios({ method: requestState.method, url: requestState.url, headers: requestState.headers, data: requestState.body, timeout: 30000 });

    const postresponseCode = getScriptCode(step, 'postresponse');
    if (postresponseCode) {
      try {
        const scriptResult = await executeScript(
          postresponseCode,
          {
            env,
            step,
            data: item,
            request: requestState,
            response: { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data },
            callbacks: createScriptCallbacks(collectionSteps || [], item, env, undefined),
          },
          step.scripts.postresponse.timeout || 5000
        );

        if (!scriptResult.success) console.error('Post-response script error:', scriptResult.error);
      } catch (scriptErr) {
        console.error('Post-response script execution error:', scriptErr);
      }
    }

    addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || '��������� ������', url: currentUrl, method: requestState.method, status: response.status, success: true, responseData: response.data, responseHeaders: response.headers, requestBody, requestHeaders: requestState.headers });

    if (collectionName) updateRecentCollection(collectionName, 'executed');

    return { success: true, status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl, requestBody, requestHeaders: requestState.headers };
  } catch (e) {
    const err = e.response ? { success: false, status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: e.config?.url || '', requestBody: e.config?.data || null, requestHeaders: e.config?.headers || {} } : { success: false, status: 0, statusText: e.message, headers: {}, data: null, url: '', requestBody: null, requestHeaders: {} };

    addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || '��������� ������', url: err.url, method: step.method, status: err.status, success: false, error: e.message, responseData: err.data, responseHeaders: err.headers, requestBody: err.requestBody, requestHeaders: err.requestHeaders });

    if (collectionName) updateRecentCollection(collectionName, 'executed');

    return err;
  }
});

// ================== History IPC ==================
ipcMain.handle('get-history', async () => history);
ipcMain.handle('clear-history', async () => { history = []; saveHistorySync(); return { success: true }; });

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
