const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('get-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  runCollection: (steps, items, delay, collectionName) => ipcRenderer.invoke('run-collection', { steps, items, delay, collectionName }),
  sendSingleRequest: (step, testData, collectionName) => ipcRenderer.invoke('send-single-request', { step, testData, collectionName }),
  onProgress: (callback) => ipcRenderer.on('progress', (event, data) => callback(data)),
  saveFile: (content) => ipcRenderer.invoke('save-file-dialog', content),
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
});
contextBridge.exposeInMainWorld('updater', {
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
});