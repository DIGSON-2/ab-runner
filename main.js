// main.js – полная финальная версия со Splash Screen и автообновлениями
const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');

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
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #1a1a2e;
            border-radius: 20px;
            overflow: hidden;
            -webkit-app-region: drag;
        }
        .icon-container {
            width: 200px;
            height: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse 2s ease-in-out infinite;
        }
        .icon-container img {
            width: 180px;
            height: 180px;
            object-fit: contain;
            filter: drop-shadow(0 0 30px rgba(108, 99, 255, 0.6));
        }
        .app-name {
            margin-top: 24px;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 28px;
            font-weight: 700;
            color: #e0e0e0;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        .loading-bar {
            margin-top: 20px;
            width: 160px;
            height: 3px;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
            overflow: hidden;
        }
        .loading-bar-fill {
            width: 40%;
            height: 100%;
            background: linear-gradient(90deg, #6c63ff, #ff4d6d);
            border-radius: 2px;
            animation: loading 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.9; }
        }
        @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(350%); }
        }
    </style>
</head>
<body>
    <div class="icon-container">
        <img src="file://${iconPath}" alt="AB Runner" onerror="this.style.display='none'">
    </div>
    <div class="app-name">AB Runner</div>
    <div class="loading-bar">
        <div class="loading-bar-fill"></div>
    </div>
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
        show: false, // Не показывать пока не готово
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

    // Когда основное окно готово — скрываем splash и показываем main
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
    return str.replace(/^\uFEFF/, '').replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
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

// ================== Headers ==================
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

// ================== History ==================
function loadHistory() {
    try {
        if (fs.existsSync(historyPath)) {
            history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        }
    } catch (e) {
        history = [];
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
    } catch (e) {
        console.error('Ошибка сохранения истории:', e);
    }
}

function addToHistory(entry) {
    history.unshift(entry);
    saveHistory();
}

// ================== Data ==================
function migrateOldData() {
    if (fs.existsSync(dataPath)) return;

    const data = { folders: [], collections: [], environments: [] };

    if (fs.existsSync(oldCollectionsPath)) {
        try {
            const old = JSON.parse(fs.readFileSync(oldCollectionsPath, 'utf8'));
            if (Array.isArray(old)) {
                data.collections = old.map(c => ({ ...c, folderId: null }));
            }
            fs.renameSync(oldCollectionsPath, oldCollectionsPath + '.backup');
        } catch (e) {
            console.error('Ошибка миграции старых данных:', e);
        }
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
    } catch (e) {
        return { folders: [], collections: [], environments: [] };
    }
}

function writeData(data) {
    try {
        // Создаем резервную копию перед сохранением
        if (fs.existsSync(dataPath)) {
            const backupPath = dataPath + '.backup';
            fs.copyFileSync(dataPath, backupPath);
        }
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Ошибка сохранения данных:', e);
        throw e;
    }
}

ipcMain.handle('get-data', async () => readData());

ipcMain.handle('save-data', async (event, d) => {
    writeData(d);
    return { success: true };
});

// ================== Run Collection (с поддержкой остановки) ==================
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

                    const response = await axios({
                        method: step.method,
                        url: currentUrl,
                        headers,
                        data,
                        signal: abortController.signal,
                        timeout: 30000,
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
                    if (e.name === 'CanceledError' || e.message === 'canceled') {
                        break;
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
                    await new Promise((resolve, reject) => {
                        const timer = setTimeout(resolve, delay);
                        abortController.signal.addEventListener('abort', () => {
                            clearTimeout(timer);
                            reject(new Error('cancelled'));
                        });
                    }).catch(() => {});
                }
            }
        }
    } finally {
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
            const entryTime = new Date(entry.timestamp).getTime();
            const age = now - entryTime;
            const hours = age / (1000 * 60 * 60);
            const days = hours / 24;
            if (timeFilter === '1h' && hours > 1) return true;
            if (timeFilter === '24h' && hours > 24) return true;
            if (timeFilter === '7d' && days > 7) return true;
            if (timeFilter === '30d' && days > 30) return true;
            if (timeFilter === '90d' && days > 90) return true;
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

// ================== History IPC ==================
ipcMain.handle('get-history', async () => history);

ipcMain.handle('clear-history', async () => {
    history = [];
    saveHistory();
    return { success: true };
});

// ================== Save File Dialog ==================
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

// ================== Postman Import (Files) ==================
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

// ================== Postman Import (Folder) ==================
ipcMain.handle('open-postman-folder-dialog', async () => {
    try {
        const { filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Выберите папку с JSON-файлами Postman',
            properties: ['openDirectory']
        });
        if (!filePaths || filePaths.length === 0) return [];

        const dirPath = filePaths[0];
        const allJsonFiles = [];

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

        if (allJsonFiles.length === 0) return [];

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