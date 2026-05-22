// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

let mainWindow;

// Файлы данных
const dataPath = path.join(app.getPath('userData'), 'ab-runner-data.json');
const historyPath = path.join(app.getPath('userData'), 'ab-runner-history.json');
const oldCollectionsPath = path.join(app.getPath('userData'), 'ab-runner-collections.json');

// Глобальная история (загружается из файла)
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

app.whenReady().then(() => {
    loadHistory();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ------------------- Замена плейсхолдеров -------------------
function replacePlaceholders(template, item) {
    if (item === null || typeof item !== 'object') {
        return template.replace(/\{id\}/g, String(item));
    }
    return template.replace(/\{([^}]+)\}/g, (match, path) => {
        const keys = path.split('.');
        let value = item;
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return match;
            }
        }
        return String(value);
    });
}

// ------------------- Работа с историей -------------------
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
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
}

function addToHistory(entry) {
    history.unshift(entry);
    saveHistory();
}

// ------------------- Работа с данными (папки + коллекции) -------------------
function migrateOldData() {
    if (fs.existsSync(dataPath)) return;
    const data = { folders: [], collections: [] };
    if (fs.existsSync(oldCollectionsPath)) {
        try {
            const oldCollections = JSON.parse(fs.readFileSync(oldCollectionsPath, 'utf8'));
            if (Array.isArray(oldCollections)) {
                data.collections = oldCollections.map(col => ({
                    ...col,
                    folderId: null,
                }));
            }
            fs.renameSync(oldCollectionsPath, oldCollectionsPath + '.backup');
        } catch (e) {
            console.error('Ошибка миграции старых коллекций:', e);
        }
    }
    writeData(data);
}

function readData() {
    migrateOldData();
    try {
        if (fs.existsSync(dataPath)) {
            return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
    } catch (e) { }
    return { folders: [], collections: [] };
}

function writeData(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

ipcMain.handle('get-data', async () => readData());
ipcMain.handle('save-data', async (event, newData) => {
    writeData(newData);
    return { success: true };
});

// ------------------- Запуск коллекции -------------------
ipcMain.handle('run-collection', async (event, { steps, items, delay, collectionName }) => {
    if (!Array.isArray(items)) return { success: false, error: 'Данные должны быть массивом' };
    let globalCounter = 0;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const item = items[itemIndex];
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
            const step = steps[stepIndex];
            const stepName = step.name || `Шаг ${stepIndex + 1}`;
            const currentUrl = replacePlaceholders(step.url, item);
            try {
                let data = undefined, requestBody = null;
                if (step.body) {
                    requestBody = replacePlaceholders(step.body, item);
                    data = /json/.test(step.contentType) ? JSON.parse(requestBody) : requestBody;
                }
                const headers = { Authorization: step.auth, 'Content-Type': step.contentType, ...step.customHeaders };
                const response = await axios({ method: step.method, url: currentUrl, headers, data });
                globalCounter++;
                addToHistory({
                    timestamp: new Date().toISOString(),
                    collection: collectionName,
                    type: 'collection',
                    item: JSON.stringify(item),
                    stepName, url: currentUrl, method: step.method,
                    status: response.status, success: true,
                    responseData: response.data, responseHeaders: response.headers,
                    requestBody, requestHeaders: headers,
                });
                mainWindow.webContents.send('progress', {
                    itemIndex, stepIndex,
                    item: JSON.stringify(item), stepName,
                    success: true, status: response.status,
                    response: { status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, url: currentUrl },
                });
            } catch (e) {
                const status = e.response ? e.response.status : e.message;
                addToHistory({
                    timestamp: new Date().toISOString(),
                    collection: collectionName,
                    type: 'collection',
                    item: JSON.stringify(item), stepName, url: currentUrl, method: step.method,
                    status, success: false, error: e.message,
                    responseData: e.response?.data, responseHeaders: e.response?.headers,
                });
                mainWindow.webContents.send('progress', {
                    itemIndex, stepIndex,
                    item: JSON.stringify(item), stepName,
                    success: false, status, error: e.message,
                    response: e.response ? { status: e.response.status, statusText: e.response.statusText, headers: e.response.headers, data: e.response.data, url: currentUrl } : null,
                });
            }
            if (delay > 0) await new Promise(r => setTimeout(r, delay));
        }
    }
    return { success: true, totalExecuted: globalCounter };
});

// ------------------- Одиночный запрос -------------------
ipcMain.handle('send-single-request', async (event, { step, testData, collectionName }) => {
    try {
        const item = testData ? JSON.parse(testData) : {};
        const currentUrl = replacePlaceholders(step.url, item);
        let requestBody = null;
        if (step.body) requestBody = replacePlaceholders(step.body, item);
        let data = undefined;
        if (requestBody) data = /json/.test(step.contentType) ? JSON.parse(requestBody) : requestBody;
        const requestHeaders = { Authorization: step.auth, 'Content-Type': step.contentType, ...step.customHeaders };
        const response = await axios({ method: step.method, url: currentUrl, headers: requestHeaders, data });
        addToHistory({
            timestamp: new Date().toISOString(),
            collection: collectionName || '',
            type: 'single',
            item: testData || '{}', stepName: step.name || 'Одиночный запрос',
            url: currentUrl, method: step.method,
            status: response.status, success: true,
            responseData: response.data, responseHeaders: response.headers,
            requestBody, requestHeaders,
        });
        return {
            success: true, status: response.status, statusText: response.statusText,
            headers: response.headers, data: response.data, url: currentUrl,
            requestBody, requestHeaders,
        };
    } catch (e) {
        const err = e.response ? {
            success: false, status: e.response.status, statusText: e.response.statusText,
            headers: e.response.headers, data: e.response.data,
            url: e.config?.url || '', requestBody: e.config?.data || null,
            requestHeaders: e.config?.headers || {},
        } : {
            success: false, status: 0, statusText: e.message,
            headers: {}, data: null, url: '', requestBody: null, requestHeaders: {},
        };
        addToHistory({
            timestamp: new Date().toISOString(),
            collection: collectionName || '', type: 'single',
            item: testData || '{}', stepName: step.name || 'Одиночный запрос',
            url: err.url, method: step.method,
            status: err.status, success: false, error: e.message,
            responseData: err.data, responseHeaders: err.headers,
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

// Сохранение файла
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