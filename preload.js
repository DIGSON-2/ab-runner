const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getData: () => ipcRenderer.invoke('get-data'),
    saveData: (d) => ipcRenderer.invoke('save-data', d),
    runCollection: (steps, items, delay, collectionName, environment) =>
        ipcRenderer.invoke('run-collection', { steps, items, delay, collectionName, environment }),
    onProgress: (callback) => ipcRenderer.on('progress', (event, data) => callback(data)),
    sendSingleRequest: (step, testData, collectionName, environment) =>
        ipcRenderer.invoke('send-single-request', { step, testData, collectionName, environment }),
    getHistory: () => ipcRenderer.invoke('get-history'),
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    clearHistoryFiltered: (filters) => ipcRenderer.invoke('clear-history-filtered', filters),
    saveFile: (content, defaultName) => ipcRenderer.invoke('save-file-dialog', content, defaultName),
    openPostmanDialog: () => ipcRenderer.invoke('open-postman-dialog'),
    openPostmanFolderDialog: () => ipcRenderer.invoke('open-postman-folder-dialog'), // <-- НОВАЯ СТРОКА
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
});

contextBridge.exposeInMainWorld('updater', {
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
});