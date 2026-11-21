// main.js – полная финальная версия со Splash Screen, автообновлениями и всеми типами Auth/Body
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');
const { replacePlaceholders } = require('./src/shared/placeholders');
const { executeScript, classifyScriptResult } = require('./src/shared/scriptRunner');
const { emptyAppData, normalizeAppData, prepareDataForDisk } = require('./src/shared/appData');
const { waitForDelay } = require('./src/shared/wait');
const { clampInt, clampDelay, clampScriptTimeout } = require('./src/shared/numbers');
const { compareVersions } = require('./src/shared/version');
const {
  serializeRequestBody,
  buildStepRequestState,
  buildStepScriptRequestState,
  finalizeStepRequestState,
  applyRequestStatePlaceholders,
} = require('./src/shared/requestState');

app.commandLine.appendSwitch('disable-http2');

// ================== Startup compatibility (Chromium sandbox) ==================
// На части Windows-машин (RDP, виртуальные адаптеры, ограниченные окружения)
// дочерние процессы Chromium падают с 0x80000003, и приложение закрывается:
//   GPU process isn't usable. Goodbye.
//   Renderer process crashed
// В этом случае включаем режим совместимости: Chromium sandbox отключается.
// В собранном приложении он включается автоматически после падения при запуске
// и запоминается в userData; отключить/включить принудительно можно переменными
// AB_RUNNER_NO_SANDBOX=1 и AB_RUNNER_GPU_SANDBOX=1, сбросить память режима —
// AB_RUNNER_RESET_COMPAT=1.
const IS_WINDOWS = process.platform === 'win32';
const compatConfigPath = path.join(app.getPath('userData'), 'startup-compat.json');
const startupCrashMarkerPath = path.join(app.getPath('userData'), '.startup-crash');

const sandboxForcedOn = process.env.AB_RUNNER_GPU_SANDBOX === '1';
const sandboxForcedOff = process.env.AB_RUNNER_NO_SANDBOX === '1';

if (process.env.AB_RUNNER_RESET_COMPAT === '1') {
  try { fs.rmSync(compatConfigPath, { force: true }); } catch { /* ignore */ }
}

let startupCompat = null;
try {
  startupCompat = JSON.parse(fs.readFileSync(compatConfigPath, 'utf8'));
} catch {
  startupCompat = null;
}
const previousLaunchCrashed = fs.existsSync(startupCrashMarkerPath);
// В dev-режиме (npm start) сразу используем режим совместимости: он часто
// запускается из контейнеров/ограниченных терминалов, где sandbox не работает.
const devNeedsCompat = !app.isPackaged && IS_WINDOWS;
const autoCompat = IS_WINDOWS && previousLaunchCrashed && !sandboxForcedOn && !sandboxForcedOff;
const compatEnabled =
  IS_WINDOWS && !sandboxForcedOn && (sandboxForcedOff || devNeedsCompat || autoCompat || startupCompat?.noSandbox === true);

if (compatEnabled) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  if (devNeedsCompat && !startupCompat?.noSandbox) {
    console.log('Startup compatibility (dev): Chromium sandbox disabled. Set AB_RUNNER_GPU_SANDBOX=1 to enable it.');
  } else if (autoCompat) {
    console.warn('Startup compatibility: previous launch crashed, Chromium sandbox disabled for this run.');
  } else if (startupCompat?.noSandbox === true) {
    console.log('Startup compatibility: Chromium sandbox disabled (remembered from a previous launch).');
  }
} else if (IS_WINDOWS && !devNeedsCompat && startupCompat?.noSandbox !== true) {
  // Маркер живёт до первого успешного показа окна: если он остался, значит
  // прошлый запуск упал, и следующий запуск включит режим совместимости.
  try { fs.writeFileSync(startupCrashMarkerPath, new Date().toISOString(), 'utf8'); } catch { /* ignore */ }
}

function rememberStartupSuccess() {
  try { fs.rmSync(startupCrashMarkerPath, { force: true }); } catch { /* ignore */ }
  // Если помогло отключение sandbox — запоминаем режим, чтобы не падать снова.
  if (app.isPackaged && IS_WINDOWS && autoCompat) {
    try {
      fs.writeFileSync(
        compatConfigPath,
        JSON.stringify({ noSandbox: true, savedAt: new Date().toISOString() }, null, 2),
        'utf8',
      );
    } catch (e) {
      console.warn('Cannot save startup compatibility config:', e.message);
    }
  }
}

// Принудительно включаем темную тему для нативных меню Electron
nativeTheme.themeSource = 'dark';

let mainWindow;
let splashWindow;

const dataPath = path.join(app.getPath('userData'), 'ab-runner-data.json');
const historyPath = path.join(app.getPath('userData'), 'ab-runner-history.json');
const oldCollectionsPath = path.join(app.getPath('userData'), 'ab-runner-collections.json');

let history = [];
let lastWrittenJson = '';
let writePromise = null;

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
        .icon-container { width: 250px; height: 250px; display: flex; align-items: center; justify-content: center; animation: pulse 2s ease-in-out infinite; }
        .icon-container img { width: 230px; height: 230px; object-fit: contain; filter: drop-shadow(0 0 34px rgba(108, 99, 255, 0.7)); }
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
    // Окно показалось — значит запуск удался: снимаем маркер падения и, если
    // помог режим совместимости, запоминаем его для следующих запусков.
    rememberStartupSuccess();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ================== Application Menu ==================
// Своё меню вместо стандартного: стандартное вешает Ctrl+W на «Закрыть окно»,
// а это сочетание должно закрывать вкладку запроса в renderer. Остальные
// пункты повторяют привычное поведение (копирование, масштаб, DevTools).
function closeFocusedWindow() {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win && !win.isDestroyed()) win.close();
}

function buildApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];

  if (isMac) template.push({ role: 'appMenu' });
  else {
    template.push({
      label: 'Файл',
      submenu: [{ role: 'quit', label: 'Выход' }],
    });
  }

  template.push({ role: 'editMenu' });
  template.push({ role: 'viewMenu' });
  template.push({
    label: 'Окно',
    submenu: [
      { role: 'minimize' },
      ...(isMac ? [{ role: 'zoom' }] : []),
      { type: 'separator' },
      { label: 'Закрыть окно', click: closeFocusedWindow },
    ],
  });
  template.push({
    label: 'Помощь',
    submenu: [
      { label: 'Горячие клавиши', click: () => sendToRenderer('show-hotkeys') },
      {
        label: 'Страница проекта',
        click: () => shell.openExternal('https://github.com/DIGSON-2/ab-runner'),
      },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ================== Auto Updater ==================
// Проверки выполняются автоматически: через 10 секунд после запуска и далее
// каждые UPDATE_CHECK_INTERVAL_MS (с разбросом, чтобы не бить GitHub синхронно).
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Ручная проверка не должна спамить GitHub: не чаще раза в минуту.
const UPDATE_MANUAL_COOLDOWN_MS = 60 * 1000;
// После ошибки повторяем позже (429 → растущая пауза, сеть → 10 минут).
const UPDATE_RETRY_MIN_MS = 30 * 60 * 1000;
const UPDATE_RETRY_MAX_MS = 3 * 60 * 60 * 1000;
const UPDATE_RETRY_DEFAULT_MS = 10 * 60 * 1000;
const GITHUB_OWNER = 'DIGSON-2';
const GITHUB_REPO = 'ab-runner';
// Переопределение адресов (зеркало GitHub API, корпоративный прокси, тесты).
const GITHUB_RELEASES_API =
  process.env.AB_RUNNER_RELEASES_API || `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const RELEASES_PAGE =
  process.env.AB_RUNNER_RELEASES_PAGE || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

let lastUpdateStatus = { status: 'idle', message: 'Обновления: не проверялись' };
let updateCheckInFlight = null;
let lastUpdateCheckAt = 0;
let updateRetryAt = 0;
let updateRetryDelayMs = 0;
let autoUpdateTimer = null;

function sendUpdaterEvent(channel, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// Статус хранится, чтобы UI мог его запросить после перезагрузки (события,
// отправленные до готовности renderer, иначе теряются).
function publishUpdateStatus(status) {
  lastUpdateStatus = { ...status, checkedAt: lastUpdateCheckAt || undefined };
  sendUpdaterEvent('update-status', lastUpdateStatus);
  return lastUpdateStatus;
}

function isRateLimitError(err) {
  const message = err?.message || String(err || '');
  return /429|too many requests|rate limit/i.test(message);
}

function formatUpdaterError(err) {
  const message = err?.message || String(err);
  if (isRateLimitError(err)) {
    return 'GitHub временно ограничил проверки обновлений (429 Too Many Requests). Проверка повторится автоматически позже; установщик можно скачать с GitHub Releases вручную.';
  }
  if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|Cannot find latest\.yml/i.test(message)) {
    return 'В последнем релизе на GitHub нет latest.yml, поэтому автообновление недоступно. Скачайте установщик с GitHub Releases вручную.';
  }
  if (/ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION|ERR_INTERNET_DISCONNECTED|ENOTFOUND|ETIMEDOUT|timeout/i.test(message)) {
    return 'Не удалось связаться с GitHub. Проверьте интернет или скачайте установщик вручную с GitHub Releases.';
  }
  if (/404/.test(message)) {
    return 'Релиз не найден на GitHub. Скачайте установщик с GitHub Releases вручную.';
  }
  return message;
}

// Лёгкая проверка через API GitHub: 60 запросов/час на IP и отдельный лимит,
// в отличие от неавторизованных HTML/atom-эндпоинтов github.com, которые
// GitHub часто режет по secondary rate limit (429).
async function fetchLatestReleaseFromApi() {
  try {
    const response = await axios.get(GITHUB_RELEASES_API, {
      timeout: 15000,
      validateStatus: () => true,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `AB Runner/${app.getVersion()}`,
      },
    });
    if (response.status !== 200 || !response.data || typeof response.data !== 'object') {
      console.warn('Update API check failed with status', response.status);
      return null;
    }
    const tag = response.data.tag_name;
    if (!tag) return null;
    const assets = Array.isArray(response.data.assets) ? response.data.assets : [];
    const installer =
      assets.find((asset) => /setup.*\.exe$/i.test(String(asset?.name || ''))) ||
      assets.find((asset) => /\.exe$/i.test(String(asset?.name || ''))) ||
      null;
    return {
      version: String(tag).replace(/^v/i, ''),
      tag: String(tag),
      pageUrl: typeof response.data.html_url === 'string' ? response.data.html_url : RELEASES_PAGE,
      downloadUrl: installer && typeof installer.browser_download_url === 'string' ? installer.browser_download_url : null,
      notes: typeof response.data.body === 'string' ? response.data.body : '',
    };
  } catch (e) {
    console.warn('Update API check failed:', e.message);
    return null;
  }
}

function buildManualFallback(latest) {
  return {
    version: latest?.version || null,
    pageUrl: latest?.pageUrl || RELEASES_PAGE,
    downloadUrl: latest?.downloadUrl || null,
  };
}

async function checkForUpdatesSafely(options = {}) {
  const manual = options.manual !== false;
  const now = Date.now();

  if (updateCheckInFlight) {
    return { success: false, busy: true, error: 'Проверка обновлений уже выполняется' };
  }
  if (manual && lastUpdateCheckAt && now - lastUpdateCheckAt < UPDATE_MANUAL_COOLDOWN_MS) {
    return {
      success: false,
      cooldown: true,
      rateLimited: true,
      retryAfterMs: UPDATE_MANUAL_COOLDOWN_MS - (now - lastUpdateCheckAt),
      error: 'Проверка уже выполнялась только что. Попробуйте через минуту.',
    };
  }
  if (manual && updateRetryAt > now) {
    const waitMinutes = Math.max(1, Math.ceil((updateRetryAt - now) / 60000));
    return {
      success: false,
      rateLimited: true,
      retryAfterMs: updateRetryAt - now,
      error: `GitHub временно ограничил проверки. Автопроверка повторится позже, а можно попробовать через ${waitMinutes} мин или скачать установщик вручную.`,
      fallback: buildManualFallback(null),
    };
  }

  updateCheckInFlight = (async () => {
    publishUpdateStatus({ status: 'checking' });
    try {
      const latest = await fetchLatestReleaseFromApi();

      // API уже знает, что обновления нет — не дёргаем нестабильные эндпоинты.
      if (latest && compareVersions(latest.version, app.getVersion()) <= 0) {
        lastUpdateCheckAt = Date.now();
        updateRetryAt = 0;
        updateRetryDelayMs = 0;
        publishUpdateStatus({ status: 'current', version: app.getVersion(), checkedVia: 'api' });
        return { success: true, upToDate: true, version: app.getVersion(), checkedVia: 'api' };
      }

      try {
        // Штатный механизм нужен для загрузки и установки (latest.yml + blockmap).
        const checkResult = await autoUpdater.checkForUpdates();
        lastUpdateCheckAt = Date.now();
        updateRetryAt = 0;
        updateRetryDelayMs = 0;
        if (checkResult?.isUpdateAvailable) {
          return {
            success: true,
            updateInfo: checkResult.updateInfo,
            latest: latest ? { version: latest.version, pageUrl: latest.pageUrl } : null,
          };
        }
        // API говорит, что версия новее, а electron-updater её не увидел
        // (например, latest.yml не загрузился в релиз).
        if (latest) {
          const fallback = buildManualFallback(latest);
          publishUpdateStatus({ status: 'available-manual', version: latest.version, fallback });
          return { success: true, manualUpdate: fallback };
        }
        publishUpdateStatus({ status: 'current', version: checkResult?.updateInfo?.version || app.getVersion() });
        return { success: true, upToDate: true, version: checkResult?.updateInfo?.version || app.getVersion() };
      } catch (e) {
        // Печатаем только сообщение: в теле ответа GitHub приходит HTML на килобайты.
        console.error('Update check error:', e?.message || e);
        const message = formatUpdaterError(e);
        updateRetryDelayMs = isRateLimitError(e)
          ? Math.min(UPDATE_RETRY_MAX_MS, Math.max(UPDATE_RETRY_MIN_MS, updateRetryDelayMs * 2))
          : UPDATE_RETRY_DEFAULT_MS;
        updateRetryAt = Date.now() + updateRetryDelayMs;
        const fallback = buildManualFallback(latest);
        const hasNewerVersion = latest && compareVersions(latest.version, app.getVersion()) > 0;
        publishUpdateStatus({
          status: hasNewerVersion ? 'available-manual' : 'error',
          version: latest?.version,
          message,
          fallback,
          retryAfterMs: updateRetryDelayMs,
        });
        return {
          success: false,
          error: message,
          retryAfterMs: updateRetryDelayMs,
          fallback,
          latestVersion: latest?.version || null,
        };
      }
    } finally {
      updateCheckInFlight = null;
    }
  })();

  return await updateCheckInFlight;
}

function initAutoUpdater() {
  if (!app.isPackaged) {
    console.log('Auto updater disabled: app is not packaged');
    publishUpdateStatus({ status: 'disabled', message: 'Автообновления работают только в установленной версии' });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.requestHeaders = {
    'Cache-Control': 'no-cache',
    'User-Agent': `AB Runner/${app.getVersion()}`,
  };

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
    publishUpdateStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    sendUpdaterEvent('update-available', info);
    publishUpdateStatus({ status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('No updates available');
    sendUpdaterEvent('update-not-available', info);
    publishUpdateStatus({ status: 'current', version: info?.version || app.getVersion() });
  });

  autoUpdater.on('error', (err) => {
    // Печатаем только сообщение: при 429 тело ответа GitHub — это HTML на килобайты.
    console.error('Auto update error:', err?.message || err);
    const message = formatUpdaterError(err);
    sendUpdaterEvent('update-error', { message });
    // Статус «ошибка» не должен затирать уже найденное ручное обновление,
    // но при любой ошибке даём ссылку на Releases — скачать можно вручную.
    if (lastUpdateStatus.status !== 'available-manual') {
      publishUpdateStatus({ status: 'error', message, fallback: buildManualFallback(null) });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent || 0);
    console.log(`Update download: ${percent}%`);
    sendUpdaterEvent('update-download-progress', { percent });
    publishUpdateStatus({ status: 'downloading', percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded');
    sendUpdaterEvent('update-downloaded', info);
    publishUpdateStatus({ status: 'downloaded', version: info?.version });
  });

  publishUpdateStatus({ status: 'idle', message: 'Обновления: не проверялись' });

  // Автопроверка после загрузки интерфейса и далее по расписанию.
  const startAutoChecks = () => scheduleAutoUpdateCheck(10 * 1000);
  if (mainWindow?.webContents?.isLoading?.()) {
    mainWindow.webContents.once('did-finish-load', startAutoChecks);
  } else {
    startAutoChecks();
  }
}

function scheduleAutoUpdateCheck(delayMs = UPDATE_CHECK_INTERVAL_MS) {
  if (!app.isPackaged) return;
  if (autoUpdateTimer) clearTimeout(autoUpdateTimer);
  autoUpdateTimer = setTimeout(async () => {
    autoUpdateTimer = null;
    let nextDelay = UPDATE_CHECK_INTERVAL_MS;
    try {
      const result = await checkForUpdatesSafely({ manual: false });
      if (result?.retryAfterMs > 0) {
        nextDelay = Math.min(UPDATE_CHECK_INTERVAL_MS, Math.max(result.retryAfterMs, UPDATE_RETRY_MIN_MS));
      }
    } catch (e) {
      console.error('Automatic update check failed:', e);
      nextDelay = UPDATE_RETRY_MIN_MS;
    }
    // Небольшой разброс, чтобы проверки не приходились на одну минуту у всех.
    scheduleAutoUpdateCheck(nextDelay + Math.floor(Math.random() * 10 * 60 * 1000));
  }, delayMs);
}

ipcMain.handle('check-for-updates', async (event, options) => {
  if (!app.isPackaged) {
    return { success: false, error: 'Auto updates work only in packaged builds' };
  }

  return await checkForUpdatesSafely({ manual: options?.manual !== false });
});

ipcMain.handle('get-update-status', () => lastUpdateStatus);

ipcMain.handle('open-external', async (event, url) => {
  try {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { success: false, error: 'Unsupported URL' };
    }
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('quit-and-install', () => {
  if (!app.isPackaged) {
    return { success: false, error: 'Auto updates work only in packaged builds' };
  }
  try {
    // Возвращаем ответ renderer'у до выхода из приложения.
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall();
      } catch (e) {
        console.error('quitAndInstall failed:', e);
      }
    });
    return { success: true };
  } catch (e) {
    console.error('quitAndInstall error:', e);
    return { success: false, error: e.message };
  }
});

// ================== App Lifecycle ==================
app.whenReady().then(() => {
  loadHistory();
  migrateOldData();
  buildApplicationMenu();
  createSplashWindow();
  createMainWindow();
  initAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Не теряем последние записи истории при выходе: отложенная запись
// сбрасывается синхронно, пока приложение ещё живо.
app.on('before-quit', () => {
  if (historyWriteTimer) {
    clearTimeout(historyWriteTimer);
    historyWriteTimer = null;
  }
  if (historyDirty) saveHistorySync();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
    createMainWindow();
  }
});


// ================== History (Batched) ==================
let historyWriteTimer = null;
let historyWriteInFlight = null;
let historyDirty = false;
const HISTORY_MAX_ENTRIES = 500;
const HISTORY_SAVE_DELAY_MS = 3000;

function loadHistory() {
  try {
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, 'utf8');
      const parsed = JSON.parse(raw);
      history = Array.isArray(parsed) ? parsed.filter((e) => e && typeof e === 'object') : [];
      // Trim history to the last entries on load to manage file size
      if (history.length > HISTORY_MAX_ENTRIES) {
        history = history.slice(0, HISTORY_MAX_ENTRIES);
        saveHistorySync();
      }
    }
  } catch { history = []; }
}

// Синхронная запись нужна только там, где данные обязаны быть на диске
// немедленно (выход из приложения, очистка истории).
function saveHistorySync() {
  try {
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
    historyDirty = false;
  } catch (e) { console.error('Ошибка сохранения истории:', e); }
}

// Асинхронная запись, чтобы не блокировать главный процесс на время запуска
// коллекции (файл истории легко достигает нескольких мегабайт).
async function flushHistory() {
  if (!historyDirty) return;
  if (historyWriteInFlight) {
    await historyWriteInFlight.catch(() => {});
    if (!historyDirty) return;
  }
  historyDirty = false;
  const payload = JSON.stringify(history, null, 2);
  historyWriteInFlight = (async () => {
    const tmpPath = `${historyPath}.${process.pid}.tmp`;
    try {
      await fs.promises.writeFile(tmpPath, payload, 'utf8');
      await fs.promises.rename(tmpPath, historyPath);
    } catch (e) {
      historyDirty = true;
      console.error('Ошибка сохранения истории:', e);
      try { await fs.promises.rm(tmpPath, { force: true }); } catch { /* ignore */ }
    } finally {
      historyWriteInFlight = null;
    }
  })();
  await historyWriteInFlight;
}

// Фиксированный дедлайн без перезапуска таймера: при интенсивном запуске
// история всё равно уходит на диск раз в HISTORY_SAVE_DELAY_MS.
function scheduleHistorySave() {
  historyDirty = true;
  if (historyWriteTimer) return;
  historyWriteTimer = setTimeout(() => {
    historyWriteTimer = null;
    void flushHistory();
  }, HISTORY_SAVE_DELAY_MS);
}

function addToHistory(entry) {
  history.unshift(entry);
  if (history.length > HISTORY_MAX_ENTRIES) history.length = HISTORY_MAX_ENTRIES;
  scheduleHistorySave();
}

function getHistoryCollections() {
  return [...new Set(history.map(entry => entry.collection).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function matchesHistoryFilters(entry, filters = {}) {
  if (filters.collection && entry.collection !== filters.collection) return false;
  if (filters.type && filters.type !== 'all' && entry.type !== filters.type) return false;
  if (filters.method && filters.method !== 'all' && entry.method !== filters.method) return false;
  if (filters.status === 'success' && !entry.success) return false;
  if (filters.status === 'error' && entry.success) return false;

  if (filters.time && filters.time !== 'all') {
    const timestamp = new Date(entry.timestamp).getTime();
    if (!Number.isFinite(timestamp)) return false;
    const ageHours = (Date.now() - timestamp) / 3600000;
    const ageDays = ageHours / 24;
    if (filters.time === '1h' && ageHours > 1) return false;
    if (filters.time === '24h' && ageHours > 24) return false;
    if (filters.time === '7d' && ageDays > 7) return false;
    if (filters.time === '30d' && ageDays > 30) return false;
    if (filters.time === '90d' && ageDays > 90) return false;
  }

  return true;
}

function getHistoryPage(query = {}) {
  // Безопасные целые: parseInt('12abc') тихо вернул бы 12, а очень длинная
  // строка страницы потеряла бы точность и сломала срез.
  const page = clampInt(query.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const pageSize = clampInt(query.pageSize, 0, 200, 50);
  const filters = query.filters || {};
  const filtered = history.filter(entry => matchesHistoryFilters(entry, filters));
  const start = (page - 1) * pageSize;
  const entries = pageSize === 0 ? [] : filtered.slice(start, start + pageSize);

  return {
    entries,
    total: filtered.length,
    page,
    pageSize,
    hasMore: pageSize > 0 && start + entries.length < filtered.length,
    collections: getHistoryCollections(),
  };
}

// ================== Recent Collections ==================
// Список ведётся только в памяти. Раньше каждая запись перечитывала с диска
// многомегабайтный JSON и сразу писала его обратно — это и тормозило клики,
// и могло затереть более свежие данные, пришедшие из renderer.
function updateRecentCollection(collectionId, reason = 'viewed') {
  if (!collectionId) return;

  const data = dataCache || readData();
  if (!data) return;
  // Открытие может прийти с именем коллекции вместо id (старые сборки) —
  // такие записи отбрасываем, чтобы не хранить мусор.
  if (!Array.isArray(data.collections) || !data.collections.some((c) => c && c.id === collectionId)) return;

  if (!Array.isArray(data.recentCollections)) data.recentCollections = [];

  const now = Date.now();
  const existing = data.recentCollections.find(r => r && r.collectionId === collectionId);

  if (existing) {
    if (existing.reason === reason && now - (existing.timestamp || 0) < RECENT_COLLECTION_DEDUPE_MS) return;
    existing.timestamp = now;
    existing.reason = reason;
  } else {
    data.recentCollections.push({
      collectionId,
      timestamp: now,
      reason
    });
  }

  // Keep only 20 most recent
  data.recentCollections.sort((a, b) => b.timestamp - a.timestamp);
  data.recentCollections = data.recentCollections.slice(0, 20);
  dataCache = data;
}

ipcMain.handle('update-recent-collection', async (event, collectionId, reason) => {
  updateRecentCollection(collectionId, reason);
  return { success: true };
});

ipcMain.handle('get-recent-collections', async () => {
  const data = dataCache || readData();
  return data.recentCollections || [];
});

// ================== Data (Async Write) ==================
// Не копируем 20+ МБ файл на каждый чих: backup обновляется не чаще, чем раз в 5 минут.
const BACKUP_MIN_INTERVAL_MS = 5 * 60 * 1000;
// Одно и то же открытие коллекции не должно перезаписывать recentCollections чаще раза в минуту.
const RECENT_COLLECTION_DEDUPE_MS = 60 * 1000;

// Последнее известное состояние данных. Живёт в памяти, чтобы не парсить
// многомегабайтный JSON заново на каждое открытие коллекции.
let dataCache = null;

function migrateOldData() {
  if (fs.existsSync(dataPath)) return;
  const data = emptyAppData();
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
    const raw = fs.readFileSync(dataPath, 'utf8');
    const d = normalizeAppData(JSON.parse(raw));
    if (raw && raw.length > 100) lastWrittenJson = raw;
    dataCache = d;
    return d;
  } catch {
    // Не затираем кэш: файл может быть временно занят, данные в памяти новее.
    return dataCache ? dataCache : emptyAppData();
  }
}

async function shouldRefreshBackup() {
  try {
    const stat = await fs.promises.stat(dataPath + '.backup');
    return Date.now() - stat.mtimeMs > BACKUP_MIN_INTERVAL_MS;
  } catch {
    return true;
  }
}

async function writeData(data) {
  if (!data || typeof data !== 'object') return;

  // В подготовке данных выкидываются служебные поля и тяжёлые результаты
  // последнего запуска, а recentCollections берётся из памяти главного процесса.
  const stored = prepareDataForDisk(data, {
    recentCollections: dataCache && Array.isArray(dataCache.recentCollections) ? dataCache.recentCollections : undefined,
  });
  const json = JSON.stringify(stored, null, 2);

  // Пустое рабочее пространство — это законное действие пользователя
  // (удалил все коллекции). Не блокируем его, но обязательно сохраняем
  // копию предыдущих данных перед такой записью.
  const isEmptyWorkspace = stored.collections.length === 0 && stored.folders.length === 0;

  // Ждём завершения предыдущей записи
  if (writePromise) await writePromise;

  writePromise = (async () => {
    try {
      const previousJson = lastWrittenJson;
      if (json === previousJson) {
        dataCache = stored;
        return;
      }

      if (fs.existsSync(dataPath) && (isEmptyWorkspace || (await shouldRefreshBackup()))) {
        const backupPath = dataPath + '.backup';
        try {
          await retryBusy(() => fs.promises.copyFile(dataPath, backupPath));
        } catch (backupError) {
          console.warn('Не удалось обновить backup перед сохранением:', backupError.message);
        }
      }

      // Асинхронная запись
      const tmpPath = `${dataPath}.${process.pid}.${Date.now()}.tmp`;
      await retryBusy(() => fs.promises.writeFile(tmpPath, json, 'utf8'));
      await retryBusy(async () => {
        try {
          await fs.promises.rename(tmpPath, dataPath);
        } catch (renameError) {
          if (['EEXIST', 'EPERM', 'EACCES'].includes(renameError.code)) {
            await fs.promises.rm(dataPath, { force: true });
            await fs.promises.rename(tmpPath, dataPath);
            return;
          }
          throw renameError;
        }
      });
      lastWrittenJson = json;
      dataCache = stored;
    } catch (e) {
      console.error('Ошибка записи данных:', e);
      throw e;
    } finally {
      writePromise = null;
    }
  })();

  await writePromise;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryBusy(operation, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt === attempts - 1) throw error;
      await sleep(80 * (attempt + 1));
    }
  }
  throw lastError;
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
    platforms: Array.isArray(importedData.platforms) ? importedData.platforms : [],
    scriptPresets: Array.isArray(importedData.scriptPresets) ? importedData.scriptPresets : [],
    activeEnvironmentId: importedData.activeEnvironmentId || '',
    activePlatformId: importedData.activePlatformId || '',
    activeCollectionId: importedData.activeCollectionId || '',
    openTabs: Array.isArray(importedData.openTabs) ? importedData.openTabs : [],
    recentCollections: Array.isArray(importedData.recentCollections) ? importedData.recentCollections : [],
  };
}

ipcMain.handle('export-app-backup', async (event, settings = {}) => {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const backup = {
      app: 'AB Runner',
      version: app.getVersion(),
      exportedAt: new Date().toISOString(),
      data: dataCache || readData(),
      history,
      settings: {
        theme: settings.theme || 'dark',
        openTabsLimit: Number.isFinite(Number(settings.openTabsLimit)) ? Number(settings.openTabsLimit) : 10,
      },
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
    const nextSettings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};

    // Импорт должен записать именно данные из backup, поэтому кэш сбрасываем:
    // иначе recentCollections из текущей сессии подменили бы импортированные.
    dataCache = null;
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
        platforms: nextData.environments.reduce((sum, env) => sum + (Array.isArray(env.platforms) ? env.platforms.length : 0), 0),
        scriptPresets: nextData.scriptPresets.length,
        openTabs: nextData.openTabs.length,
        history: nextHistory.length,
      },
      settings: nextSettings,
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
      timeout: requestOptions.timeout || 1000000,
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

function createScriptCallbacks(steps, item, env, signal, requestState) {
  return {
    runStep: async (stepId, data) => runStepForScript(stepId, data || item || {}, steps, env, signal),
    sendRequest: async (options) => sendScriptRequest(options, item || {}, env, signal),
    retryRequest: async () => {
      if (!requestState) throw new Error('retryRequest is available only while processing a request');
      return await sendScriptRequest(requestState, item || {}, env, signal);
    },
  };
}

function getScriptCode(step, type) {
  const code = step?.scripts?.[type]?.code;
  return code == null || code === 'undefined' ? '' : String(code);
}

ipcMain.handle('run-collection', async (event, payload) => {
  const { steps, items, delay, collectionName, environment, collectionId } = payload || {};
  if (!Array.isArray(items)) return { success: false, error: 'Данные должны быть массивом' };
  if (!Array.isArray(steps) || steps.length === 0) return { success: false, error: 'В коллекции нет шагов' };
  if (typeof collectionName !== 'string') return { success: false, error: 'Не указано имя коллекции' };

  const abortController = new AbortController();
  currentRun = { controller: abortController, cancelled: false };

  const env = environment || {};
  const delayMs = clampDelay(delay);
  let counter = 0;
  let wasCancelled = false;
  let abortReason = null;
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
        const stepName = step.name || `Step ${j + 1}`;
        let currentUrl = replacePlaceholders(step.url, item, env);
        const requestNumber = counter + 1;
        const requestStartTime = Date.now();
        let requestBody = null;
        let requestHeaders = {};
        let requestMethod = step.method;
        let stepEnv = env;

        try {
          const prerequestCode = getScriptCode(step, 'prerequest');
          const requestState = prerequestCode
            ? buildStepScriptRequestState(step, item, stepEnv)
            : buildStepRequestState(step, item, stepEnv);
          currentUrl = requestState.url;
          requestBody = serializeRequestBody(requestState.body);
          requestHeaders = requestState.headers;
          requestMethod = requestState.method;

          // Execute pre-request script if enabled
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
              clampScriptTimeout(step.scripts?.prerequest?.timeout)
            );

            const scriptOutcome = classifyScriptResult(scriptResult);
            // pm.abort() возвращает success:false + abortCollection:true, поэтому
            // проверять его нужно ДО общей ошибки скрипта, иначе запуск продолжался.
            if (scriptOutcome === 'abort') {
              abortReason = scriptResult.error || 'Aborted by script';
              counter++;
              const requestDuration = Date.now() - requestStartTime;
              requestTimes.push(requestDuration);
              const abortError = `Collection aborted: ${abortReason}`;
              addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: requestMethod, status: 0, success: false, error: abortError, responseData: null, responseHeaders: {}, requestBody, requestHeaders });
              const avgTime = getAvgTime(requestTimes);
              sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: false, status: 0, error: abortError, requestBody, requestHeaders, environment: stepEnv, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: 0, avgRequestTime: avgTime, response: null });
              break;
            }

            if (scriptOutcome === 'error') {
              counter++;
              const requestDuration = Date.now() - requestStartTime;
              requestTimes.push(requestDuration);
              addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: requestMethod, status: 0, success: false, error: `Pre-request script error: ${scriptResult.error}`, responseData: null, responseHeaders: {}, requestBody, requestHeaders });
              const avgTime = getAvgTime(requestTimes);
              sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: false, status: 0, error: `Script: ${scriptResult.error}`, requestBody, requestHeaders, environment: stepEnv, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: null });
              continue;
            }

            if (scriptOutcome === 'skip') {
              counter++;
              const requestDuration = Date.now() - requestStartTime;
              requestTimes.push(requestDuration);
              requestBody = serializeRequestBody(requestState.body);
              requestHeaders = requestState.headers;
              requestMethod = requestState.method;
              addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: requestMethod, status: 0, success: true, responseData: { skipped: true }, responseHeaders: {}, requestBody, requestHeaders });
              const avgTime = getAvgTime(requestTimes);
              sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: true, status: 0, requestBody, requestHeaders, environment: stepEnv, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: { status: 0, statusText: 'Skipped', headers: {}, data: { skipped: true }, url: currentUrl } });
              continue;
            }

            // Update env with any changes made by script
            if (scriptResult.env) Object.assign(stepEnv, scriptResult.env);
            finalizeStepRequestState(step, item, stepEnv, requestState);
          }

          applyRequestStatePlaceholders(requestState, item, stepEnv);
          currentUrl = requestState.url;
          requestBody = serializeRequestBody(requestState.body);
          requestHeaders = requestState.headers;
          requestMethod = requestState.method;

          let response = await axios({
            method: requestState.method,
            url: requestState.url,
            headers: requestState.headers,
            data: requestState.body,
            signal: abortController.signal,
            timeout: 1000000,
            validateStatus: () => true,
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
                  callbacks: createScriptCallbacks(steps, item, stepEnv, abortController.signal, requestState),
                },
                clampScriptTimeout(step.scripts?.postresponse?.timeout)
              );

              if (!scriptResult.success) {
                console.error('Post-response script error:', scriptResult.error);
              } else if (scriptResult.result && typeof scriptResult.result.status !== 'undefined') {
                response = {
                  status: scriptResult.result.status,
                  statusText: scriptResult.result.statusText || '',
                  headers: scriptResult.result.headers || {},
                  data: scriptResult.result.data,
                };
                currentUrl = requestState.url;
                requestBody = serializeRequestBody(requestState.body);
                requestHeaders = requestState.headers;
              }
            } catch (scriptErr) {
              console.error('Post-response script execution error:', scriptErr);
            }
          }

          const requestSuccess = response.status >= 200 && response.status < 400;
          addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: requestState.method, status: response.status, success: requestSuccess, error: requestSuccess ? null : response.statusText, responseData: response.data, responseHeaders: response.headers, requestBody, requestHeaders: requestState.headers });

          const avgTime = getAvgTime(requestTimes);
          sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: requestSuccess, status: response.status, error: requestSuccess ? null : response.statusText, requestBody, requestHeaders, environment: stepEnv, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl } });
        } catch (e) {
          if (e.name === 'CanceledError' || e.message === 'canceled') break;
          counter++;
          const requestDuration = Date.now() - requestStartTime;
          requestTimes.push(requestDuration);
          const status = e.response ? e.response.status : e.message;

          addToHistory({ timestamp: new Date().toISOString(), collection: collectionName, type: 'collection', item: JSON.stringify(item), stepName, url: currentUrl, method: requestMethod, status, success: false, error: e.message, responseData: e.response?.data, responseHeaders: e.response?.headers, requestBody, requestHeaders });

          const avgTime = getAvgTime(requestTimes);
          sendToRenderer('progress', { itemIndex: i, stepIndex: j, item: JSON.stringify(item), stepName, success: false, status, error: e.message, requestBody, requestHeaders, environment: stepEnv || env, requestNumber, totalRequests, requestDuration, elapsedMs: Date.now() - startTime, etaMs: (totalRequests - counter) * avgTime, avgRequestTime: avgTime, response: e.response ? { status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: currentUrl } : null });
        }

        if (delayMs > 0) {
          await waitForDelay(delayMs, abortController.signal);
          if (abortController.signal.aborted) break;
        }
      }
      if (abortReason) break;
    }
  } finally {
    wasCancelled = currentRun?.cancelled || false;
    currentRun = null;
    // Сохраняем историю сразу после запуска, не дожидаясь таймера.
    await flushHistory();
  }

  // Track collection usage
  updateRecentCollection(collectionId, 'executed');

  return {
    success: !wasCancelled && !abortReason,
    totalExecuted: counter,
    totalTime: Date.now() - startTime,
    avgTime: requestTimes.length > 0 ? Math.round(requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length) : 0,
    cancelled: wasCancelled,
    aborted: Boolean(abortReason),
    error: abortReason ? `Collection aborted: ${abortReason}` : undefined,
    environment: env,
  };
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
  const { timeFilter = 'all', typeFilter = 'all', methodFilter = 'all', statusFilter = 'all' } = filters || {};
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
ipcMain.handle('send-single-request', async (event, { step, testData, collectionName, collectionId, environment, collectionSteps }) => {
  const env = environment || {};
  try {
    const item = testData ? JSON.parse(testData) : {};
    const prerequestCode = getScriptCode(step, 'prerequest');
    const requestState = prerequestCode
      ? buildStepScriptRequestState(step, item, env)
      : buildStepRequestState(step, item, env);
    let currentUrl = requestState.url;
    let requestBody = serializeRequestBody(requestState.body);
    let requestHeaders = requestState.headers;

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
        clampScriptTimeout(step.scripts?.prerequest?.timeout)
      );

      if (!scriptResult.success) {
        if (scriptResult.abortCollection) throw new Error(`Aborted: ${scriptResult.error}`);
        const errorResult = { success: false, status: 0, statusText: `Pre-request script error: ${scriptResult.error}`, headers: {}, data: null, url: currentUrl, requestBody, requestHeaders, environment: env };
        addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || 'Single request', url: currentUrl, method: requestState.method, status: 0, success: false, error: errorResult.statusText, responseData: null, responseHeaders: {}, requestBody, requestHeaders });
        updateRecentCollection(collectionId, 'executed');
        return errorResult;
      }

      if (scriptResult.skipRequest) {
        requestBody = serializeRequestBody(requestState.body);
        requestHeaders = requestState.headers;
        addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || 'Single request', url: currentUrl, method: requestState.method, status: 0, success: true, responseData: { skipped: true }, responseHeaders: {}, requestBody, requestHeaders: requestState.headers });
        updateRecentCollection(collectionId, 'executed');
        return { success: true, status: 0, statusText: 'Skipped', headers: {}, data: { skipped: true }, url: currentUrl, requestBody, requestHeaders: requestState.headers, environment: env };
      }

      if (scriptResult.env) Object.assign(env, scriptResult.env);
      finalizeStepRequestState(step, item, env, requestState);
    }

    applyRequestStatePlaceholders(requestState, item, env);
    currentUrl = requestState.url;
    requestBody = serializeRequestBody(requestState.body);
    requestHeaders = requestState.headers;
    let response = await axios({ method: requestState.method, url: requestState.url, headers: requestState.headers, data: requestState.body, timeout: 1000000, validateStatus: () => true });

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
            callbacks: createScriptCallbacks(collectionSteps || [], item, env, undefined, requestState),
          },
          clampScriptTimeout(step.scripts?.postresponse?.timeout)
        );

        if (!scriptResult.success) console.error('Post-response script error:', scriptResult.error);
        else if (scriptResult.result && typeof scriptResult.result.status !== 'undefined') {
          response = {
            status: scriptResult.result.status,
            statusText: scriptResult.result.statusText || '',
            headers: scriptResult.result.headers || {},
            data: scriptResult.result.data,
          };
          currentUrl = requestState.url;
          requestBody = serializeRequestBody(requestState.body);
          requestHeaders = requestState.headers;
        }
      } catch (scriptErr) {
        console.error('Post-response script execution error:', scriptErr);
      }
    }

    const requestSuccess = response.status >= 200 && response.status < 400;
    addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || 'Single request', url: currentUrl, method: requestState.method, status: response.status, success: requestSuccess, error: requestSuccess ? null : response.statusText, responseData: response.data, responseHeaders: response.headers, requestBody, requestHeaders: requestState.headers });

    updateRecentCollection(collectionId, 'executed');

    return { success: requestSuccess, status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl, requestBody, requestHeaders: requestState.headers, environment: env };
  } catch (e) {
    const err = e.response ? { success: false, status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: e.config?.url || '', requestBody: e.config?.data || null, requestHeaders: e.config?.headers || {}, environment: env } : { success: false, status: 0, statusText: e.message, headers: {}, data: null, url: '', requestBody: null, requestHeaders: {}, environment: env };

    addToHistory({ timestamp: new Date().toISOString(), collection: collectionName || '', type: 'single', item: testData || '{}', stepName: step.name || 'Single request', url: err.url, method: step.method, status: err.status, success: false, error: e.message, responseData: err.data, responseHeaders: err.headers, requestBody: err.requestBody, requestHeaders: err.requestHeaders });

    updateRecentCollection(collectionId, 'executed');

    return err;
  }
});

ipcMain.handle('run-script-lab', async (event, { code, data, environment, timeout }) => {
  const env = environment || {};
  const logs = [];
  let parsedData = {};

  try {
    if (typeof data === 'string' && data.trim()) parsedData = JSON.parse(data);
    else if (data && typeof data === 'object') parsedData = data;
  } catch (e) {
    return { success: false, error: 'Data JSON error: ' + e.message, logs, environment: env };
  }

  const result = await executeScript(
    code || '',
    {
      env,
      step: { name: 'Script Lab' },
      data: parsedData,
      request: { method: 'GET', url: '', headers: {}, body: undefined },
      callbacks: {
        ...createScriptCallbacks([], parsedData, env, undefined),
        log: (...args) => logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')),
      },
    },
    clampScriptTimeout(timeout, 10000),
  );

  return {
    ...result,
    logs,
    environment: env,
  };
});

// ================== History IPC ==================
ipcMain.handle('get-history', async (event, query) => {
  if (!query) return history;
  return getHistoryPage(query);
});
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
