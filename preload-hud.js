const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hudApi', {
  onUpdate: (cb) => ipcRenderer.on('hud-update', (_e, state) => cb(state)),
});
