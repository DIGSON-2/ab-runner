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
const {
  extractToken,
  isTokenValid,
  makeCacheEntry,
  cacheKey,
} = require('./src/shared/tokenProvider');
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

// ================== Pre-request token chaining ==================
// Token cache shared across runs and single sends, keyed by scope + variable.
const tokenCache = new Map();

// Resolve the auto-token for a step, returning an environment augmented with the
// token variable. Runs the referenced login step (with caching/TTL) only when no
// valid cached token exists. Throws on misconfiguration so the caller records it
// as a failed step.
async function resolveTokenEnv(step, allSteps, item, env, scope, signal) {
  const cfg = step && step.tokenAuth;
  if (!cfg || !cfg.enabled) return env;

  const tokenVar = (cfg.tokenVar && cfg.tokenVar.trim()) || 'token';
  const key = cacheKey(scope, tokenVar);
  const now = Date.now();

  let token;
  const cached = tokenCache.get(key);
  if (isTokenValid(cached, now)) {
    token = cached.value;
  } else {
    const login = (allSteps || []).find((s) => s.id && s.id === cfg.loginStepId);
    if (!login) throw new Error('Шаг логина для авто-токена не найден');
    if (login === step) throw new Error('Шаг логина не может ссылаться сам на себя');

    const loginUrl = replacePlaceholders(login.url, item, env);
    const { data, headers: bodyHeaders } = buildRequestBody(login, item, env);
    const loginHeaders = { ...buildHeaders(login, loginUrl, login.method), ...bodyHeaders };
    const resp = await axios({
      method: login.method,
      url: loginUrl,
      headers: loginHeaders,
      data,
      signal,
      timeout: 30000,
    });
    token = extractToken(resp.data, cfg.tokenPath);
    if (token == null) {
      throw new Error(`Токен не найден по пути "${cfg.tokenPath}" в ответе логина`);
    }
    tokenCache.set(key, makeCacheEntry(token, cfg.ttlSeconds ?? 3600, now));
  }

  const nextEnv = { ...env, [tokenVar]: token };
  return nextEnv;
}

// Optionally inject "Authorization: Bearer <token>" when the step opted in.
function applyBearerToken(headers, step, stepEnv) {
  const cfg = step && step.tokenAuth;
  if (!cfg || !cfg.enabled || !cfg.asBearer) return;
  const tokenVar = (cfg.tokenVar && cfg.tokenVar.trim()) || 'token';
  const token = stepEnv && stepEnv[tokenVar];
  if (token) headers['Authorization'] = `Bearer ${token}`;
}

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

        try {
          const stepEnv = await resolveTokenEnv(step, steps, item, env, collectionName, abortController.signal);
          currentUrl = replacePlaceholders(step.url, item, stepEnv);
          const { data, headers: bodyHeaders } = buildRequestBody(step, item, stepEnv);
          const headers = { ...buildHeaders(step, currentUrl, step.method, item, stepEnv), ...bodyHeaders };
          applyBearerToken(headers, step, stepEnv);
          const requestBody = typeof data === 'string' ? data : (data ? JSON.stringify(data) : null);

          // Execute pre-request script if enabled
          if (step.scripts?.prerequest?.enabled && step.scripts.prerequest.code) {
            const scriptResult = await executeScript(
              step.scripts.prerequest.code,
              {
                env: stepEnv,
                step,
                data: item,
                callbacks: {
                  runStep: async (stepId, data) => {
                    const targetStep = (steps || []).find((s) => s.id === stepId);
                    if (!targetStep) throw new Error(`Step ${stepId} not found`);
                    const loginUrl = replacePlaceholders(targetStep.url, data, env);
                    const { data: bodyData, headers: bodyHeaders } = buildRequestBody(targetStep, data, env);
                    const loginHeaders = { ...buildHeaders(targetStep, loginUrl, targetStep.method, data, env), ...bodyHeaders };
                    const res = await axios({
                      method: targetStep.method,
                      url: loginUrl,
                      headers: loginHeaders,
                      data: bodyData,
                      signal: abortController.signal,
                      timeout: 30000,
                    });
                    return { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data };
                  },
                  sendRequest: async (options) => {
                    try {
                      const res = await axios({
                        ...options,
                        timeout: options.timeout || 30000,
                        signal: abortController.signal,
                      });
                      return {
                        status: res.status,
                        statusText: res.statusText,
                        headers: res.headers,
                        data: res.data,
                      };
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
                  },
                },
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

          const response = await axios({
            method: step.method, url: currentUrl, headers, data,
            signal: abortController.signal, timeout: 30000,
          });

          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);

          // Execute post-response script if enabled
          if (step.scripts?.postresponse?.enabled && step.scripts.postresponse.code) {
            try {
              const scriptResult = await executeScript(
                step.scripts.postresponse.code,
                {
                  env: stepEnv,
                  step,
                  data: item,
                  response: response.data,
                  callbacks: {
                    runStep: async (stepId, data) => {
                      const targetStep = (steps || []).find((s) => s.id === stepId);
                      if (!targetStep) throw new Error(`Step ${stepId} not found`);
                      const loginUrl = replacePlaceholders(targetStep.url, data, env);
                      const { data: bodyData, headers: bodyHeaders } = buildRequestBody(targetStep, data, env);
                      const loginHeaders = { ...buildHeaders(targetStep, loginUrl, targetStep.method, data, env), ...bodyHeaders };
                      const res = await axios({
                        method: targetStep.method,
                        url: loginUrl,
                        headers: loginHeaders,
                        data: bodyData,
                        signal: abortController.signal,
                        timeout: 30000,
                      });
                      return { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data };
                    },
                    sendRequest: async (options) => {
                      try {
                        const res = await axios({
                          ...options,
                          timeout: options.timeout || 30000,
                          signal: abortController.signal,
                        });
                        return {
                          status: res.status,
                          statusText: res.statusText,
                          headers: res.headers,
                          data: res.data,
                        };
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
                    },
                  },
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

          addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: step.method, status: response.status, success: true, responseData: response.data, responseHeaders: response.headers, requestBody, requestHeaders: headers });

          const avgTime = getAvgTime(requestTimes);
          sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: true, status: response.status, requestBody, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl } });
        } catch (e) {
          if (e.name === 'CanceledError' || e.message === 'canceled') break;
          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);
          const status = e.response ? e.response.status : e.message;

          addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: step.method, status, success: false, error: e.message, responseData: e.response?.data, responseHeaders: e.response?.headers });

          const avgTime = getAvgTime(requestTimes);
          sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: false, status, error: e.message, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: e.response ? { status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: currentUrl } : null });
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
  const baseEnv = environment || {};
  try {
    const item = testData ? JSON.parse(testData) : {};
    const env = await resolveTokenEnv(step, collectionSteps || [], item, baseEnv, collectionName, undefined);
    const currentUrl = replacePlaceholders(step.url, item, env);
    const { data, headers: bodyHeaders } = buildRequestBody(step, item, env);
    const requestHeaders = { ...buildHeaders(step, currentUrl, step.method, item, env), ...bodyHeaders };
    applyBearerToken(requestHeaders, step, env);
    const requestBody = typeof data === 'string' ? data : (data ? JSON.stringify(data) : null);

    // Execute pre-request script if enabled
    if (step.scripts?.prerequest?.enabled && step.scripts.prerequest.code) {
      const scriptResult = await executeScript(
        step.scripts.prerequest.code,
        {
          env,
          step,
          data: item,
          callbacks: {
          runStep: async (stepId, data) => {
            const targetStep = (collectionSteps || []).find((s) => s.id === stepId);
            if (!targetStep) throw new Error(`Step ${stepId} not found`);
            const loginUrl = replacePlaceholders(targetStep.url, data, env);
            const { data: bodyData, headers: bodyHeaders } = buildRequestBody(targetStep, data, env);
            const loginHeaders = { ...buildHeaders(targetStep, loginUrl, targetStep.method, data, env), ...bodyHeaders };
            const res = await axios({ method: targetStep.method, url: loginUrl, headers: loginHeaders, data: bodyData, timeout: 30000 });
            return { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data };
          },
            sendRequest: async (options) => {
              const res = await axios({ ...options, timeout: options.timeout || 30000 });
              return { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data };
            },
          },
        },
        step.scripts.prerequest.timeout || 5000
      );

      if (!scriptResult.success) {
        if (scriptResult.abortCollection) {
          throw new Error(`Aborted: ${scriptResult.error}`);
        }
        return { success: false, status: 0, statusText: `Pre-request script error: ${scriptResult.error}`, headers: {}, data: null, url: currentUrl, requestBody: null, requestHeaders: {} };
      }

      if (scriptResult.skipRequest) {
        addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || 'Одиночный запрос', url: currentUrl, method: step.method, status: 0, success: true, responseData: { skipped: true }, responseHeaders: {} });
        if (collectionName) updateRecentCollection(collectionName, 'executed');
        return { success: true, status: 0, statusText: 'Skipped', headers: {}, data: { skipped: true }, url: currentUrl, requestBody, requestHeaders };
      }

      if (scriptResult.env) Object.assign(env, scriptResult.env);
    }

    const response = await axios({ method: step.method, url: currentUrl, headers: requestHeaders, data });

    // Execute post-response script if enabled
    if (step.scripts?.postresponse?.enabled && step.scripts.postresponse.code) {
      try {
        const scriptResult = await executeScript(
          step.scripts.postresponse.code,
          {
            env,
            step,
            data: item,
            response: response.data,
            callbacks: {
              runStep: async (stepId, data) => {
                const targetStep = (collectionSteps || []).find((s) => s.id === stepId);
                if (!targetStep) throw new Error(`Step ${stepId} not found`);
                const loginUrl = replacePlaceholders(targetStep.url, data, env);
                const { data: bodyData, headers: bodyHeaders } = buildRequestBody(targetStep, data, env);
                const loginHeaders = { ...buildHeaders(targetStep, loginUrl, targetStep.method, data, env), ...bodyHeaders };
                const res = await axios({ method: targetStep.method, url: loginUrl, headers: loginHeaders, data: bodyData, timeout: 30000 });
                return { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data };
              },
              sendRequest: async (options) => {
                const res = await axios({ ...options, timeout: options.timeout || 30000 });
                return { status: res.status, statusText: res.statusText, headers: res.headers, data: res.data };
              },
            },
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

    addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || 'Одиночный запрос', url: currentUrl, method: step.method, status: response.status, success: true, responseData: response.data, responseHeaders: response.headers, requestBody, requestHeaders });

    // Track collection usage
    if (collectionName) updateRecentCollection(collectionName, 'executed');

    return { success: true, status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl, requestBody, requestHeaders };
  } catch (e) {
    const err = e.response ? { success: false, status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: e.config?.url || '', requestBody: e.config?.data || null, requestHeaders: e.config?.headers || {} } : { success: false, status: 0, statusText: e.message, headers: {}, data: null, url: '', requestBody: null, requestHeaders: {} };

    addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || 'Одиночный запрос', url: err.url, method: step.method, status: err.status, success: false, error: e.message, responseData: err.data, responseHeaders: err.headers });

    // Track collection usage even on error
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