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

const isWindows = process.platform === 'win32';

function applyCaptureExclusion(win) {
  if (!win || win.isDestroyed()) return;
  win.setContentProtection(true);
  if (isWindows && typeof win.setExcludeFromCapture === 'function') {
    win.setExcludeFromCapture(true);
  }
}

function createTeleprompterWindow() {
  if (teleprompterWindow && !teleprompterWindow.isDestroyed()) {
    teleprompterWindow.focus();
    return teleprompterWindow;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  teleprompterWindow = new BrowserWindow({
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
    webPreferences: {
      preload: path.join(__dirname, 'preload-teleprompter.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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

  hudWindow = new BrowserWindow({
    width: 200,
    height: 72,
    x: width - 220,
    y: 24,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-hud.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  applyCaptureExclusion(hudWindow);
  hudWindow.setIgnoreMouseEvents(true, { forward: true });
  hudWindow.loadFile('hud.html');
  hudWindow.on('closed', () => {
    hudWindow = null;
  });

  return hudWindow;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 760,
    minWidth: 400,
    minHeight: 720,
    title: 'CrownRecord',
    webPreferences: {
      preload: path.join(__dirname, 'preload-main.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logger.error('Renderer process gone', details);
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupSessionPermissions() {
  const ses = session.defaultSession;

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
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

ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });

    logger.info('Sources listed', { count: sources.length });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
      thumbnail: s.thumbnail.toDataURL(),
    }));
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

ipcMain.on('hud-state', (_e, state) => {
  if (!hudWindow || hudWindow.isDestroyed()) {
    if (state.recording) createHudWindow();
  }
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.webContents.send('hud-update', state);
    if (state.recording) {
      hudWindow.showInactive();
    } else {
      hudWindow.hide();
    }
  }
});

ipcMain.handle('save-recording', async (_e, payload) => {
  const extension =
    payload && typeof payload === 'object' && payload.extension === 'mp4' ? 'mp4' : 'webm';
  const raw = payload && typeof payload === 'object' && payload.buffer != null
    ? payload.buffer
    : payload;
  const buffer = Buffer.from(raw);

  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save recording',
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
    return { saved: true, filePath };
  } catch (err) {
    logger.error('Save failed', { message: err.message, filePath });
    throw err;
  }
});
