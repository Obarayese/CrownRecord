const fs = require('fs');
const path = require('path');

const SUPPORT_EMAIL = 'support@crownsoftech.com';

let logDir = null;
let logFile = null;

function init(userDataPath) {
  logDir = path.join(userDataPath, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  logFile = path.join(logDir, `crownrecord-${date}.log`);
  write('info', 'CrownRecord session started');
}

function write(level, message, meta) {
  const stamp = new Date().toISOString();
  const extra = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${stamp}] [${level.toUpperCase()}] ${message}${extra}\n`;

  try {
    if (logFile) fs.appendFileSync(logFile, line, 'utf8');
  } catch (err) {
    console.error('Failed to write log:', err.message);
  }

  if (level === 'error' || level === 'warn') {
    console.error(line.trim());
  }
}

function getLogInfo() {
  return {
    logDir: logDir || '',
    logFile: logFile || '',
    supportEmail: SUPPORT_EMAIL,
  };
}

module.exports = {
  SUPPORT_EMAIL,
  init,
  write,
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
  getLogInfo,
};
