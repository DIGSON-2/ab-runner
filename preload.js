const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getData: () => ipcRenderer.invoke('get-data'),
    saveData: (data) => ipcRenderer.invoke('save-data', data),
    runCollection: (steps, items, delay, collectionName, environment) =>
        ipcRenderer.invoke('run-collection', { steps, items, delay, collectionName, environment }),
    sendSingleRequest: (step, testData, collectionName, environment) =>
        ipcRenderer.invoke('send-single-request', { step, testData, collectionName, environment }),
    onProgress: (callback) => ipcRenderer.on('progress', (event, data) => callback(data)),
    saveFile: (content) => ipcRenderer.invoke('save-file-dialog', content),
    getHistory: () => ipcRenderer.invoke('get-history'),
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    openPostmanDialog: () => ipcRenderer.invoke('open-postman-dialog'),
});

contextBridge.exposeInMainWorld('updater', {
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
});