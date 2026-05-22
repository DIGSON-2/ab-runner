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