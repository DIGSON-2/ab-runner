// main.js – полная финальная версия со Splash Screen, автообновлениями и всеми типами Auth/Body
const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');
const crypto = require('crypto');
const FormData = require('form-data');

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

// ================== String Utilities ==================
function cleanString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200C\u200D\u2060\u2061\u2062\u2063]/g, '')
    .replace(/[\uFFF0-\uFFFF]/g, '')
    .replace(/[\u00AD]/g, '')
    .replace(/[\u180E]/g, '');
}

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

// ================== Placeholders ==================
function replacePlaceholders(template, item, environment = {}, options = {}) {
  if (!template) return template;
  const cleaned = cleanString(template);
  const { toJson = false } = options;
  const env = environment && typeof environment === 'object' ? environment : {};

  if (item === null || typeof item !== 'object') {
    return cleaned.replace(/{([^{}]+)}/g, (match, pathStr) => {
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

  return cleaned.replace(/{([^{}]+)}/g, (match, pathStr) => {
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

// ================== Headers & Auth ==================
function buildHeaders(step, url = '', method = 'GET') {
  const headers = {};

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

  const bodyType = step.bodyType || (step.body ? 'raw' : 'none');
  const rawType = step.rawType || 'json';

  switch (bodyType) {
    case 'none': break;
    case 'form-data': break;
    case 'urlencoded':
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      break;
    case 'raw':
      if (!headers['Content-Type']) {
        const rawContentTypes = { json: 'application/json', javascript: 'application/javascript', xml: 'application/xml', html: 'text/html', text: 'text/plain' };
        headers['Content-Type'] = rawContentTypes[rawType] || step.contentType || 'application/json';
      }
      break;
    case 'binary':
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/octet-stream';
      break;
    case 'graphql':
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      break;
    default:
      if (step.contentType && step.contentType.trim() && !headers['Content-Type']) headers['Content-Type'] = step.contentType.trim();
  }

  const authType = step.authType || (step.auth && step.auth.trim() ? 'bearer' : 'noauth');
  const authData = step.authData || {};
  const legacyToken = step.auth && step.auth.trim() ? step.auth.trim() : '';

  switch (authType) {
    case 'noauth': break;
    case 'apikey':
      if (authData.key && authData.addTo === 'header') headers[authData.key] = authData.value || '';
      break;
    case 'bearer':
      if (authData.token || legacyToken) headers['Authorization'] = `Bearer ${authData.token || legacyToken}`;
      break;
    case 'jwt':
      if (authData.token) headers['Authorization'] = `${authData.prefix || 'Bearer'} ${authData.token}`;
      break;
    case 'basic':
      if (authData.username || authData.password) {
        headers['Authorization'] = `Basic ${Buffer.from(`${authData.username || ''}:${authData.password || ''}`).toString('base64')}`;
      }
      break;
    case 'digest': {
      const { username, password, realm, nonce, qop = 'auth', nonceCount = '00000001', opaque } = authData;
      const algorithm = (authData.algorithm || 'MD5').toLowerCase();
      const cnonce = authData.cnonce || crypto.randomBytes(8).toString('hex');

      if (username && password && realm && nonce) {
        try {
          let uri = url;
          try { uri = new URL(url).pathname + new URL(url).search; } catch (e) { }

          let ha1 = crypto.createHash(algorithm).update(`${username}:${realm}:${password}`).digest('hex');
          if (algorithm === 'md5-sess') ha1 = crypto.createHash('md5').update(`${ha1}:${nonce}:${cnonce}`).digest('hex');

          let ha2 = crypto.createHash(algorithm).update(`${method.toUpperCase()}:${uri}`).digest('hex');
          if (qop === 'auth-int') {
            const bodyHash = crypto.createHash(algorithm).update(step.body || '').digest('hex');
            ha2 = crypto.createHash(algorithm).update(`${method.toUpperCase()}:${uri}:${bodyHash}`).digest('hex');
          }

          let response;
          if (qop === 'auth' || qop === 'auth-int') {
            response = crypto.createHash(algorithm).update(`${ha1}:${nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`).digest('hex');
          } else {
            response = crypto.createHash(algorithm).update(`${ha1}:${nonce}:${ha2}`).digest('hex');
          }

          let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", algorithm=${algorithm.toUpperCase()}, response="${response}"`;
          if (qop) authHeader += `, qop=${qop}, nc=${nonceCount}, cnonce="${cnonce}"`;
          if (opaque) authHeader += `, opaque="${opaque}"`;
          headers['Authorization'] = authHeader;
        } catch (e) { console.error('Digest Auth error:', e); }
      }
      break;
    }
    case 'oauth2':
      if (authData.accessToken && authData.addTo === 'header') headers['Authorization'] = `${authData.headerPrefix || 'Bearer'} ${authData.accessToken}`;
      break;
    case 'oauth1': {
      const { consumerKey, consumerSecret, token, tokenSecret, signatureMethod = 'HMAC-SHA1', realm, addTo = 'header' } = authData;
      const timestamp = authData.timestamp || Math.floor(Date.now() / 1000).toString();
      const nonce = authData.nonce || crypto.randomBytes(16).toString('hex');
      const version = authData.version || '1.0';

      if (consumerKey && addTo === 'header') {
        try {
          const params = { oauth_consumer_key: consumerKey, oauth_nonce: nonce, oauth_signature_method: signatureMethod, oauth_timestamp: timestamp, oauth_version: version };
          if (token) params.oauth_token = token;
          if (realm) params.realm = realm;

          let baseUrl = url;
          try {
            const urlObj = new URL(url);
            baseUrl = urlObj.origin + urlObj.pathname;
            urlObj.searchParams.forEach((value, key) => { params[key] = value; });
          } catch (e) { }

          const sortedParams = Object.keys(params).filter(k => k !== 'realm').sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
          const baseString = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(sortedParams)}`;
          const signingKey = `${encodeURIComponent(consumerSecret || '')}&${encodeURIComponent(tokenSecret || '')}`;

          let signature;
          if (signatureMethod === 'HMAC-SHA1') signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
          else if (signatureMethod === 'HMAC-SHA256') signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64');
          else if (signatureMethod === 'PLAINTEXT') signature = signingKey;
          else signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

          params.oauth_signature = signature;
          let authHeader = 'OAuth ';
          if (realm) authHeader += `realm="${encodeURIComponent(realm)}", `;
          authHeader += Object.keys(params).filter(k => k !== 'realm').map(key => `${encodeURIComponent(key)}="${encodeURIComponent(params[key])}"`).join(', ');
          headers['Authorization'] = authHeader;
        } catch (e) { console.error('OAuth 1.0 error:', e); }
      }
      break;
    }
    case 'hawk': {
      const { hawkId: id, hawkKey: key, algorithm = 'sha256', ext, app, dlg } = authData;
      const nonce = authData.nonce || crypto.randomBytes(6).toString('hex');
      const timestamp = authData.timestamp || Math.floor(Date.now() / 1000).toString();

      if (id && key) {
        try {
          const urlObj = new URL(url);
          const host = urlObj.hostname;
          const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
          const resource = urlObj.pathname + urlObj.search;

          let normalized = `hawk.1.header\n${timestamp}\n${nonce}\n${method.toUpperCase()}\n${resource}\n${host}\n${port}\n`;
          if (step.body) {
            const contentType = headers['Content-Type'] || '';
            const payloadHash = crypto.createHash(algorithm).update(`hawk.1.payload\n${contentType}\n${step.body}`).digest('base64');
            normalized += `${payloadHash}\n`;
          } else {
            normalized += '\n';
          }
          normalized += `${ext || ''}\n`;
          if (app) normalized += `${app}\n${dlg || ''}\n`;

          const mac = crypto.createHmac(algorithm, key).update(normalized).digest('base64');
          let authHeader = `Hawk id="${id}", ts="${timestamp}", nonce="${nonce}", mac="${mac}"`;
          if (ext) authHeader += `, ext="${ext.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
          if (app) {
            authHeader += `, app="${app}"`;
            if (dlg) authHeader += `, dlg="${dlg}"`;
          }
          headers['Authorization'] = authHeader;
        } catch (e) { console.error('Hawk Auth error:', e); }
      }
      break;
    }
    default:
      if (legacyToken) headers['Authorization'] = `Bearer ${legacyToken}`;
  }

  return headers;
}

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
      if (step.rawType === 'json') { try { data = JSON.parse(body); } catch (e) { data = body; } }
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
        try { variables = JSON.parse(replacePlaceholders(step.graphql.variables, item, env, { toJson: true })); } catch (e) { }
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
  } catch (e) { history = []; }
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
  } catch (e) { return { folders: [], collections: [], environments: [] }; }
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

ipcMain.handle('run-collection', async (event, { steps, items, delay, collectionName, environment }) => {
  if (!Array.isArray(items)) return { success: false, error: 'Данные должны быть массивом' };

  const abortController = new AbortController();
  currentRun = { controller: abortController, cancelled: false };

  const env = environment || {};
  let counter = 0;
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
          mainWindow.webContents.send('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: true, status: response.status, requestBody, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: Math.round(avgTime), response: { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl } });
        } catch (e) {
          if (e.name === 'CanceledError' || e.message === 'canceled') break;
          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);
          const status = e.response ? e.response.status : e.message;

          addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: step.method, status, success: false, error: e.message, responseData: e.response?.data, responseHeaders: e.response?.headers });

          const avgTime = requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
          mainWindow.webContents.send('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: false, status, error: e.message, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: Math.round(avgTime), response: e.response ? { status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: currentUrl } : null });
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
    currentRun = null;
  }

  return { success: !currentRun?.cancelled, totalExecuted: counter, totalTime: Date.now() - startTime, avgTime: requestTimes.length > 0 ? Math.round(requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length) : 0, cancelled: currentRun?.cancelled || false };
});

// ================== Stop Collection ==================
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

// ================== Clear History Filtered ==================
ipcMain.handle('clear-history-filtered', async (event, filters) => {
  const { timeFilter, typeFilter, methodFilter, statusFilter } = filters;
  const now = Date.now();

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
  return { success: true, deleted: history.length - filteredHistory.length };
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
  } catch (e) { return []; }
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
          } catch (e) { }
        });
      } catch (e) { }
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
  } catch (e) { return []; }
});