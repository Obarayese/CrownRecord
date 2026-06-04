const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('teleprompterApi', {
  onText: (cb) => ipcRenderer.on('teleprompter-text', (_e, text) => cb(text)),
  onControl: (cb) => ipcRenderer.on('teleprompter-control', (_e, payload) => cb(payload)),
});
