const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mirrorApi', {
  onConfig: (cb) => ipcRenderer.on('mirror-config', (_e, config) => cb(config)),
});
