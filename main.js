const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  dialog,
  screen,
  session,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

let mainWindow = null;
let teleprompterWindow = null;
let hudWindow = null;
let mirrorWindow = null;
let selectedCaptureSourceId = null;
let isQuitting = false;

const isWindows = process.platform === 'win32';
const iconPath = path.join(__dirname, 'build', 'icon.ico');
const appIcon = fs.existsSync(iconPath) ? iconPath : undefined;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function destroyWindow(win) {
  if (win && !win.isDestroyed()) {
    win.removeAllListeners('close');
    win.destroy();
  }
}

function closeAllAuxiliaryWindows() {
  destroyWindow(mirrorWindow);
  mirrorWindow = null;
  destroyWindow(hudWindow);
  hudWindow = null;
  destroyWindow(teleprompterWindow);
  teleprompterWindow = null;
}

function childWindowOptions(extra = {}) {
  return { ...extra };
}

function closeHudWindow() {
  destroyWindow(hudWindow);
  hudWindow = null;
}

function destroyAllWindows() {
  closeAllAuxiliaryWindows();
  for (const win of BrowserWindow.getAllWindows()) {
    destroyWindow(win);
  }
}

function forceQuit() {
  if (isQuitting) return;
  isQuitting = true;
  destroyAllWindows();
  app.exit(0);
}

if (isWindows) {
  app.setAppUserModelId('com.crownsoftech.crownrecord');
}

function applyCaptureExclusion(win) {
  if (!win || win.isDestroyed()) return;
  win.setContentProtection(true);
  if (isWindows && typeof win.setExcludeFromCapture === 'function') {
    win.setExcludeFromCapture(true);
  }
}

function formatSourceLabel(name, isScreen, displayId) {
  if (isScreen) {
    const n = displayId != null && displayId !== '' ? displayId : '1';
    return `Entire screen — Display ${n}`;
  }
  const lower = name.toLowerCase();
  if (/zoom meeting/.test(lower)) return `Meeting window — ${name}`;
  if (/zoom/.test(lower)) return `Zoom — ${name}`;
  if (/google chrome|chrome/.test(lower)) return `Browser — ${name} (pick tab/window)`;
  if (/microsoft teams|teams/.test(lower)) return `Teams — ${name}`;
  if (/meet/.test(lower)) return `Meet / video — ${name}`;
  if (/electron/.test(lower)) return `App window — ${name}`;
  return `Application window — ${name}`;
}

function createTeleprompterWindow() {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
    teleprompterWindow.focus();
    return teleprompterWindow;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  teleprompterWindow = new BrowserWindow(childWindowOptions({
    width: 520,
    height: 360,
    x: Math.floor(width * 0.5 - 260),
    y: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'CrownRecord Teleprompter',
    webPreferences: {
      preload: path.join(__dirname, 'preload-teleprompter.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }));

  applyCaptureExclusion(teleprompterWindow);
  teleprompterWindow.loadFile('teleprompter.html');
  teleprompterWindow.on('closed', () => {
    teleprompterWindow = null;
  });

  return teleprompterWindow;
}

function createHudWindow() {
  if (hudWindow && !hudWindow.isDestroyed()) {
    return hudWindow;
  }

  const { width } = screen.getPrimaryDisplay().workAreaSize;

  hudWindow = new BrowserWindow(childWindowOptions({
    width: 360,
    height: 64,
    x: Math.max(16, width - 380),
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    title: 'CrownRecord Controls',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-hud.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }));

  applyCaptureExclusion(hudWindow);
  hudWindow.loadFile('hud.html');
  hudWindow.on('closed', () => {
    hudWindow = null;
  });

  return hudWindow;
}

function closeCameraMirrorWindow() {
  destroyWindow(mirrorWindow);
  mirrorWindow = null;
}

function createCameraMirrorWindow(config) {
  closeCameraMirrorWindow();

  const size = Math.max(120, Math.min(320, Number(config?.size) || 200));
  const margin = 24;
  const corner = config?.corner === 'br' ? 'br' : 'bl';
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winSize = size + 20;
  const x = corner === 'br' ? width - winSize - margin : margin;
  const y = height - winSize - margin;

  mirrorWindow = new BrowserWindow(childWindowOptions({
    width: winSize,
    height: winSize,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    title: 'CrownRecord Camera',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-mirror.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }));

  applyCaptureExclusion(mirrorWindow);
  mirrorWindow.loadFile('mirror.html');
  mirrorWindow.webContents.once('did-finish-load', () => {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
      mirrorWindow.webContents.send('mirror-config', {
        deviceId: config?.deviceId || '',
        size,
      });
    }
  });
  mirrorWindow.on('closed', () => {
    mirrorWindow = null;
  });

  return mirrorWindow;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 820,
    minWidth: 420,
    minHeight: 720,
    title: 'CrownRecord',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-main.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logger.error('Renderer process gone', details);
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('close', () => {
    closeAllAuxiliaryWindows();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!isQuitting && BrowserWindow.getAllWindows().length === 0) {
      forceQuit();
    }
  });
}

function setupSessionPermissions() {
  const ses = session.defaultSession;

  ses.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['window', 'screen'],
          thumbnailSize: { width: 0, height: 0 },
        });
        const source =
          sources.find((s) => s.id === selectedCaptureSourceId) ||
          sources[0];
        if (!source) {
          callback({});
          return;
        }
        const result = { video: source };
        if (request.audioRequested) {
          result.audio = 'loopback';
        }
        logger.info('DisplayMedia capture', { id: source.id, name: source.name });
        callback(result);
      } catch (err) {
        logger.error('DisplayMedia handler failed', { message: err.message });
        callback({});
      }
    },
    { useSystemPicker: false },
  );

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'display-capture', 'speaker-selection'];
    callback(allowed.includes(permission));
  });

  ses.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'display-capture', 'speaker-selection'];
    return allowed.includes(permission);
  });
}

function setupProcessLogging() {
  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', { message: err.message, stack: err.stack });
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;

  app.setName('CrownRecord');
  logger.init(app.getPath('userData'));
  logger.info('App ready', {
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
  });

  setupProcessLogging();
  setupSessionPermissions();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('second-instance', () => {
  if (!gotSingleInstanceLock) return;

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  closeAllAuxiliaryWindows();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') forceQuit();
});

ipcMain.handle('get-log-info', () => logger.getLogInfo());

ipcMain.handle('open-log-folder', async () => {
  const { logDir } = logger.getLogInfo();
  if (!logDir) return { ok: false };
  await shell.openPath(logDir);
  return { ok: true };
});

ipcMain.handle('log-message', (_e, level, message, meta) => {
  const fn = logger[level] || logger.info;
  fn(message, meta);
  return true;
});

ipcMain.handle('minimize-main', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
    return true;
  }
  return false;
});

ipcMain.handle('restore-main', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return true;
  }
  return false;
});

ipcMain.on('hud-action', (_e, action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-command', action);
  }
});

ipcMain.handle('set-capture-source', (_e, sourceId) => {
  selectedCaptureSourceId = sourceId;
  return true;
});

ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });

    logger.info('Sources listed', { count: sources.length });
    return sources.map((s) => {
      const isScreen = String(s.id).startsWith('screen:');
      return {
        id: s.id,
        name: s.name,
        kind: isScreen ? 'screen' : 'window',
        label: formatSourceLabel(s.name, isScreen, s.display_id),
        display_id: s.display_id,
        thumbnail: s.thumbnail.toDataURL(),
      };
    });
  } catch (err) {
    logger.error('get-sources failed', { message: err.message });
    throw err;
  }
});

ipcMain.handle('open-teleprompter', () => {
  createTeleprompterWindow();
  logger.info('Teleprompter opened');
  return true;
});

ipcMain.handle('close-teleprompter', () => {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
    teleprompterWindow.close();
  }
  return true;
});

ipcMain.handle('teleprompter-set-text', (_e, text) => {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
    teleprompterWindow.webContents.send('teleprompter-text', text);
  }
});

ipcMain.handle('teleprompter-control', (_e, payload) => {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
    teleprompterWindow.webContents.send('teleprompter-control', payload);
  }
});

ipcMain.handle('open-camera-mirror', (_e, config) => {
  createCameraMirrorWindow(config || {});
  return true;
});

ipcMain.handle('close-camera-mirror', () => {
  closeCameraMirrorWindow();
  return true;
});

ipcMain.on('hud-state', (_e, state) => {
  if (!state.recording) {
    closeHudWindow();
    return;
  }
  if (!hudWindow || hudWindow.isDestroyed()) {
    createHudWindow();
  }
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.webContents.send('hud-update', state);
    hudWindow.show();
  }
});

ipcMain.handle('save-recording', async (_e, payload) => {
  const extension =
    payload && typeof payload === 'object' && payload.extension === 'mp4' ? 'mp4' : 'webm';
  const raw =
    payload && typeof payload === 'object' && payload.buffer != null
      ? payload.buffer
      : payload;
  const buffer = Buffer.from(raw);

  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save CrownRecord',
    defaultPath: `crownrecord-${Date.now()}.${extension}`,
    filters: [
      { name: 'WebM Video', extensions: ['webm'] },
      { name: 'MP4 Video', extensions: ['mp4'] },
    ],
  });

  if (canceled || !filePath) {
    logger.info('Save canceled');
    return { saved: false };
  }

  try {
    fs.writeFileSync(filePath, buffer);
    logger.info('Recording saved', { filePath });

    if (mainWindow && !mainWindow.isDestroyed()) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Recording saved',
        message: 'Your CrownRecord video was saved.',
        detail: filePath,
        buttons: ['Open file', 'Open folder', 'Done'],
        defaultId: 0,
        cancelId: 2,
      });

      if (response === 0) await shell.openPath(filePath);
      if (response === 1) shell.showItemInFolder(filePath);
    }

    return { saved: true, filePath };
  } catch (err) {
    logger.error('Save failed', { message: err.message, filePath });
    throw err;
  }
});
