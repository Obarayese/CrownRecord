const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crownRecord', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  openTeleprompter: () => ipcRenderer.invoke('open-teleprompter'),
  closeTeleprompter: () => ipcRenderer.invoke('close-teleprompter'),
  setTeleprompterText: (text) => ipcRenderer.invoke('teleprompter-set-text', text),
  teleprompterControl: (payload) => ipcRenderer.invoke('teleprompter-control', payload),
  saveRecording: (payload) => ipcRenderer.invoke('save-recording', payload),
  setHudState: (state) => ipcRenderer.send('hud-state', state),
  minimizeMainWindow: () => ipcRenderer.invoke('minimize-main'),
  restoreMainWindow: () => ipcRenderer.invoke('restore-main'),
  openCameraMirror: (config) => ipcRenderer.invoke('open-camera-mirror', config),
  closeCameraMirror: () => ipcRenderer.invoke('close-camera-mirror'),
  onRecordingCommand: (cb) => {
    ipcRenderer.on('recording-command', (_e, action) => cb(action));
  },
  getLogInfo: () => ipcRenderer.invoke('get-log-info'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  log: (level, message, meta) => ipcRenderer.invoke('log-message', level, message, meta),
});
