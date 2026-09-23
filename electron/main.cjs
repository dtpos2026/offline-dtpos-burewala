const { app, BrowserWindow, ipcMain, dialog, Menu, shell, screen } = require('electron');
const https = require('https');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  // Stop loading the rest of this module — a second copy must never register
  // handlers or create windows.
  return;
}

let mainWindow = null;
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'icon.ico'),
    title: 'DT POS RESTAURANT SYSTEM',
    autoHideMenuBar: true,
    show: false, // Don't show until ready - prevents white screen flash
    backgroundColor: '#f7f7f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // enable <webview> for embedded WhatsApp Web
    },
  });
  try { enableSerialForWindow(mainWindow); } catch (e) { appendLog('serial setup fail ' + e); }

  // Remove default menu
  Menu.setApplicationMenu(null);

  // Show window only when content is ready - prevents white screen
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  if (isDev) {
    // Dev mode: load from Vite dev server
    mainWindow.loadURL('http://localhost:8080').catch(() => {
      // Fallback: try dist if dev server not running
      const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
      if (fs.existsSync(distIndex)) {
        mainWindow.loadFile(distIndex);
      }
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load built app
    // When packaged, __dirname is inside app.asar, resources are relative
    const possiblePaths = [
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(process.resourcesPath, 'dist', 'index.html'),
      path.join(app.getAppPath(), 'dist', 'index.html'),
    ];

    let loaded = false;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        mainWindow.loadFile(p);
        loaded = true;
        break;
      }
    }

    if (!loaded) {
      // Last resort fallback
      mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch((err) => {
        mainWindow.webContents.loadURL(`data:text/html,<h2>Error: Could not load application.</h2><p>${err.message}</p>`);
      });
    }
  }

  // Handle load failures gracefully
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (isDev) {
      // In dev, retry after a short delay (Vite might still be starting)
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:8080').catch(() => {});
      }, 2000);
    }
  });

  // Right-click context menu — Copy / Paste / Cut / Select All / Undo / Redo.
  // Item 12 from upgrade plan. Native Electron menu, no extra deps.
  mainWindow.webContents.on('context-menu', (_e, params) => {
    const { isEditable, selectionText, editFlags } = params;
    const hasText = !!(selectionText && selectionText.trim().length);
    if (!isEditable && !hasText) return; // nothing to act on
    const template = [];
    if (isEditable) {
      template.push({ label: 'Undo', role: 'undo', enabled: editFlags.canUndo });
      template.push({ label: 'Redo', role: 'redo', enabled: editFlags.canRedo });
      template.push({ type: 'separator' });
      template.push({ label: 'Cut', role: 'cut', enabled: editFlags.canCut });
    }
    template.push({ label: 'Copy', role: 'copy', enabled: editFlags.canCopy || hasText });
    if (isEditable) template.push({ label: 'Paste', role: 'paste', enabled: editFlags.canPaste });
    template.push({ type: 'separator' });
    template.push({ label: 'Select All', role: 'selectAll', enabled: editFlags.canSelectAll });
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // CRITICAL: the hidden print window is a BrowserWindow too. If it stays
    // alive, 'window-all-closed' never fires, the process keeps running and
    // the next launch is silently blocked by the single-instance lock
    // ("app band karne ke baad dobara open nahi hota"). Kill it here.
    try { if (printWorker && !printWorker.isDestroyed()) printWorker.destroy(); } catch {}
    printWorker = null;
    // Safety net: if anything else keeps a window alive, force the exit.
    setTimeout(() => { try { app.quit(); } catch {} }, 300);
  });
}

// Focus existing window on second instance — and re-open it if the previous
// window was closed but the process is still winding down.
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    try { createWindow(); } catch {}
  }
});

app.whenReady().then(() => {
  // Strip "Electron/x" from default UA so sites like WhatsApp Web accept it
  try {
    const ua = app.userAgentFallback.replace(/ Electron\/[^\s]+/, '').replace(/ DT-POS-RESTAURANT-SYSTEM\/[^\s]+/, '');
    app.userAgentFallback = ua;
  } catch {}
  createWindow();

  // FAST PRINT: create the hidden print window at startup instead of on the
  // first Pay click. Window creation + first paint used to cost ~1-2 seconds
  // on the very first receipt of the shift.
  setTimeout(() => { try { getPrintWorker(); } catch {} }, 1500);

  // Apply clean Chrome UA to any <webview> (e.g. WhatsApp Web)
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'webview') {
      contents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// ===== DATA FOLDERS (portable, beside the .exe) =====
// Layout:
//   <root>/DT-POS/data/dtpos.json         (main DB, atomic writes)
//   <root>/DT-POS/data/dtpos.json.bak     (previous good copy)
//   <root>/DT-POS/backups/dtpos-YYYYMMDD-HHmm.json
//   <root>/DT-POS/logs/app.log
// Root resolution order (first writable wins):
//   1. DTPOS_DATA_DIR env override (advanced support)
//   2. exeDir (portable — beside the installer / exe)
//   3. non-C fixed drives D:\..Z:\ (keeps restaurant DB away from Windows C drive)
//   4. userData (last fallback for single-drive PCs / Program Files without admin)
function driveLetter(p) {
  const m = String(p || '').match(/^([a-z]):/i);
  return m ? m[1].toUpperCase() : '';
}

function existingRootCandidates() {
  const out = [];
  try { out.push(path.join(path.dirname(app.getPath('exe')), 'DT-POS')); } catch {}
  for (let code = 68; code <= 90; code++) {
    const drive = String.fromCharCode(code) + ':\\';
    out.push(path.join(drive, 'DT-POS'));
    out.push(path.join(drive, 'DT-POS-Data'));
  }
  try { out.push(path.join(app.getPath('userData'), 'DT-POS')); } catch {}
  try { out.push(app.getPath('userData')); } catch {}
  return Array.from(new Set(out));
}

function dataFileForRoot(root) {
  const modern = path.join(root, 'data', 'dtpos.json');
  const legacy = path.join(root, 'pos-data.json');
  if (fs.existsSync(modern)) return modern;
  if (fs.existsSync(legacy)) return legacy;
  return modern;
}

function resolveRoot() {
  const candidates = [];
  if (process.env.DTPOS_DATA_DIR) candidates.push(process.env.DTPOS_DATA_DIR);
  let exeDir = '';
  try { exeDir = path.dirname(app.getPath('exe')); } catch {}
  // If EXE is on D/E/F... keep data beside EXE. If EXE is on C, prefer any
  // available non-C drive first so restaurant data survives Windows reinstall.
  if (exeDir && driveLetter(exeDir) && driveLetter(exeDir) !== 'C') candidates.push(exeDir);
  for (let code = 68; code <= 90; code++) {
    const drive = String.fromCharCode(code) + ':\\';
    try {
      if (fs.existsSync(drive)) candidates.push(drive);
    } catch {}
  }
  if (exeDir) candidates.push(exeDir);
  try { candidates.push(app.getPath('userData')); } catch {}
  for (const base of candidates) {
    try {
      const root = /DT-POS$/i.test(String(base)) ? base : path.join(base, 'DT-POS');
      const dataDir = path.join(root, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      const testFile = path.join(dataDir, '.write-test');
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return root;
    } catch {}
  }
  const tmp = path.join(app.getPath('temp'), 'DT-POS');
  try { fs.mkdirSync(path.join(tmp, 'data'), { recursive: true }); } catch {}
  return tmp;
}
const ROOT = resolveRoot();
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(ROOT, 'backups');
const LOG_DIR = path.join(ROOT, 'logs');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
const DATA_FILE = path.join(DATA_DIR, 'dtpos.json');
const DATA_BAK  = path.join(DATA_DIR, 'dtpos.json.bak');
const LOG_FILE  = path.join(LOG_DIR, 'app.log');
console.log('[DT-POS] Root:', ROOT);
console.log('[DT-POS] Data file:', DATA_FILE);

// If the selected root is fresh, migrate the first existing database found from
// older C:\AppData/portable locations into the new durable root. This prevents
// "logout/update ke baad data ur gaya" when the storage root changes.
try {
  if (!fs.existsSync(DATA_FILE)) {
    for (const oldRoot of existingRootCandidates()) {
      const oldFile = dataFileForRoot(oldRoot);
      if (oldFile === DATA_FILE) continue;
      if (fs.existsSync(oldFile)) {
        fs.copyFileSync(oldFile, DATA_FILE);
        console.log('[DT-POS] Migrated existing DB from', oldFile);
        break;
      }
    }
  }
} catch (e) { console.warn('[DT-POS] DB migration skipped:', e.message); }

// Legacy migration — old "DT-POS-Data/pos-data.json" beside the exe.
try {
  const legacy = path.join(path.dirname(app.getPath('exe')), 'DT-POS-Data', 'pos-data.json');
  if (fs.existsSync(legacy) && !fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(legacy, DATA_FILE);
    console.log('[DT-POS] Migrated legacy DB from', legacy);
  }
} catch {}
// Migrate from legacy userData/pos-data.json (older AppData fallback).
try {
  const legacyApp = path.join(app.getPath('userData'), 'pos-data.json');
  if (fs.existsSync(legacyApp) && !fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(legacyApp, DATA_FILE);
    console.log('[DT-POS] Migrated legacy DB from', legacyApp);
  }
} catch {}

function appendLog(level, event, detail) {
  try {
    const line = `[${new Date().toISOString()}] [${level}] ${event}${detail ? ' — ' + detail : ''}\n`;
    try {
      const st = fs.statSync(LOG_FILE);
      if (st.size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1');
    } catch {}
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {}
}

function atomicWriteDb(jsonStr) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, jsonStr, 'utf-8');
  try {
    if (fs.existsSync(DATA_FILE)) {
      try { fs.copyFileSync(DATA_FILE, DATA_BAK); } catch {}
    }
  } catch {}
  fs.renameSync(tmp, DATA_FILE);
}

// Pre-update / boot-time backup — one snapshot per app-version transition
try {
  if (fs.existsSync(DATA_FILE)) {
    const versionMarker = path.join(DATA_DIR, '.last-version');
    const current = (() => { try { return app.getVersion(); } catch { return 'unknown'; } })();
    let previous = null;
    try { previous = fs.readFileSync(versionMarker, 'utf-8').trim(); } catch {}
    if (previous !== current) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const backupPath = path.join(BACKUP_DIR, `dtpos-boot-${stamp}.json`);
      try { fs.copyFileSync(DATA_FILE, backupPath); appendLog('INFO', 'auto-backup', `${previous || 'fresh'} → ${current}`); } catch {}
      try { fs.writeFileSync(versionMarker, current, 'utf-8'); } catch {}
    }
  }
} catch {}

ipcMain.handle('get-app-version', async () => {
  try { return app.getVersion(); } catch { return null; }
});

// ============================================================
// DEVICE HARDWARE INFO (manufacturer / model / Windows version)
// Read once per app run — Super Admin device monitoring ke liye.
// Slow WMI call kabhi UI block na kare: cached + best effort.
// ============================================================
let _deviceHardware = null;
function psQuery(cmd) {
  return new Promise((resolve) => {
    try {
      const { execFile } = require('child_process');
      execFile('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', cmd],
        { timeout: 8000, windowsHide: true },
        (err, stdout) => resolve(err ? '' : String(stdout || '').trim()));
    } catch { resolve(''); }
  });
}
ipcMain.handle('get-device-hardware', async () => {
  if (_deviceHardware) return _deviceHardware;
  const base = {
    manufacturer: '', model: '', osName: '', osVersion: os.release(),
    hostname: os.hostname(), platform: os.platform(), arch: os.arch(),
  };
  if (process.platform === 'win32') {
    const out = await psQuery(
      '$c=Get-CimInstance Win32_ComputerSystem; $o=Get-CimInstance Win32_OperatingSystem; ' +
      '"{0}|{1}|{2}|{3}" -f $c.Manufacturer,$c.Model,$o.Caption,$o.Version'
    );
    const [man, mod, osName, osVer] = out.split('|').map(s => (s || '').trim());
    if (man) base.manufacturer = man;
    if (mod) base.model = mod;
    if (osName) base.osName = osName;
    if (osVer) base.osVersion = osVer;
  }
  _deviceHardware = base;
  return base;
});

ipcMain.handle('get-system-info', async () => {
  try {
    const ifaces = os.networkInterfaces();
    const macs = [];
    Object.values(ifaces).forEach(list => {
      (list || []).forEach(i => {
        if (i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00') macs.push(i.mac);
      });
    });
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: (os.cpus()[0] || {}).model,
      cpuCount: os.cpus().length,
      totalMemGb: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
      macAddresses: Array.from(new Set(macs)).slice(0, 4),
      userInfo: (() => { try { return os.userInfo().username; } catch { return null; } })(),
    };
  } catch (e) {
    return { error: String(e) };
  }
});

ipcMain.handle('db-read', async () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return { success: true, data: raw };
    }
    if (fs.existsSync(DATA_BAK)) {
      const raw = fs.readFileSync(DATA_BAK, 'utf-8');
      appendLog('WARN', 'db-read', 'fell back to .bak');
      return { success: true, data: raw, usedBackup: true };
    }
    return { success: true, data: null };
  } catch (err) {
    appendLog('ERROR', 'db-read', err.message);
    try {
      if (fs.existsSync(DATA_BAK)) {
        const raw = fs.readFileSync(DATA_BAK, 'utf-8');
        return { success: true, data: raw, usedBackup: true };
      }
    } catch {}
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-write', async (_event, jsonStr) => {
  try {
    atomicWriteDb(jsonStr);
    return { success: true };
  } catch (err) {
    appendLog('ERROR', 'db-write', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-backup', async (_event, jsonStr, label) => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const suffix = label ? `-${String(label).replace(/[^a-z0-9-]/gi, '')}` : '';
    const filePath = path.join(BACKUP_DIR, `dtpos-${stamp}${suffix}.json`);
    fs.writeFileSync(filePath, jsonStr, 'utf-8');
    appendLog('INFO', 'db-backup', filePath);
    return { success: true, path: filePath };
  } catch (err) {
    appendLog('ERROR', 'db-backup', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-list-backups', async () => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return { success: true, files: [] };
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const full = path.join(BACKUP_DIR, f);
        const st = fs.statSync(full);
        return { name: f, path: full, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-log', async (_e, level, event, detail) => {
  appendLog(level || 'INFO', event || 'app', detail || '');
  return { success: true };
});

// ============================================================
// THE APP CAN WRITE TO ITS OWN LOG.
//
// There is a rolling log file with rotation, and until now only the main
// process could reach it. Everything that went wrong in the POS itself —
// which is where the shop's work happens — was swallowed by a bare `catch`
// and left no trace at all.
//
// That is why a support call starts with "it stopped working" and cannot go
// any further. A line in this file is the difference between guessing and
// reading.
// ============================================================
ipcMain.handle('app-log', async (_event, level, event, detail) => {
  try {
    const lvl = ['INFO', 'WARN', 'ERROR'].includes(String(level).toUpperCase())
      ? String(level).toUpperCase() : 'INFO';
    appendLog(lvl, String(event || 'event').slice(0, 200), String(detail || '').slice(0, 2000));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-read-log', async () => {
  try {
    if (!fs.existsSync(LOG_FILE)) return { success: true, data: '' };
    return { success: true, data: fs.readFileSync(LOG_FILE, 'utf-8') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-data-path', async () => DATA_FILE);
ipcMain.handle('get-data-paths', async () => ({
  root: ROOT, dataFile: DATA_FILE, dataBak: DATA_BAK,
  backupDir: BACKUP_DIR, logDir: LOG_DIR, logFile: LOG_FILE,
}));
ipcMain.handle('open-data-folder', async (_e, which) => {
  try {
    const target = which === 'backups' ? BACKUP_DIR : which === 'logs' ? LOG_DIR : DATA_DIR;
    await shell.openPath(target);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== AUTO-START ON BOOT =====
ipcMain.handle('get-auto-start', async () => {
  try {
    const s = app.getLoginItemSettings();
    return { success: true, enabled: !!s.openAtLogin };
  } catch (err) {
    return { success: false, enabled: false, error: err.message };
  }
});

ipcMain.handle('set-auto-start', async (_event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: false,
      path: process.execPath,
      args: [],
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================================
// PRINTER NAME MATCHING — ONE implementation, used by every path.
//
// Mirrors src/printing/printerMatch.ts so the renderer's "is this printer
// installed?" answer and the main process's "which device do I print to?"
// answer can never disagree. Both the driver path (runPrintJob) and the RAW
// ESC/POS path call this; the raw path used to hand the stored name straight
// to winspool, so a printer installed as "BIXOLON SRP-352plusIII (Copy 1)"
// failed to open while the same printer printed fine through the driver.
//
// Windows reasons a name fails to match exactly:
//   • "(Copy 1)" / "(Copy 2)"   — duplicate driver install
//   • "(redirected 2)"          — RDP / session printers
//   • double spaces, non-breaking space (\u00A0), trailing space
//   • `name` vs `displayName`
//   • the printer was renamed after the setting was saved
// ============================================================
function normalizePrinterName(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripPrinterSuffix(s) {
  return normalizePrinterName(s)
    .replace(/\s*\((?:copy|redirected)\s*\d*\)\s*$/i, '')
    .trim();
}

/**
 * Resolve a requested printer name against the installed list, strictest
 * match first. Never hard-fails: an unmatched name is passed through to
 * Windows, which often resolves names Electron's list does not carry.
 */
function matchPrinterName(requested, printers) {
  const raw = String(requested || '').replace(/\u00A0/g, ' ').trim();
  const list = Array.isArray(printers) ? printers : [];
  if (!raw) return { name: '', stage: 'none' };
  if (list.length === 0) return { name: raw, stage: 'passthrough' };

  const cand = list.map(p => ({ name: String(p.name || ''), display: String(p.displayName || '') }));
  const reqN = normalizePrinterName(raw);
  const reqS = stripPrinterSuffix(raw);

  const stages = [
    ['exact',       c => c.name === raw || c.display === raw],
    ['normalized',  c => normalizePrinterName(c.name) === reqN || normalizePrinterName(c.display) === reqN],
    ['no-suffix',   c => stripPrinterSuffix(c.name) === reqS || stripPrinterSuffix(c.display) === reqS],
    ['starts-with', c => !!reqS && (normalizePrinterName(c.name).startsWith(reqS) || normalizePrinterName(c.display).startsWith(reqS))],
    ['contains',    c => reqS.length >= 4 && (normalizePrinterName(c.name).includes(reqS) || normalizePrinterName(c.display).includes(reqS))],
    ['reverse',     c => {
      if (reqS.length < 4) return false;
      const n = normalizePrinterName(c.name);
      const d = normalizePrinterName(c.display);
      return (!!n && reqS.includes(n)) || (!!d && reqS.includes(d));
    }],
  ];
  for (const [stage, fn] of stages) {
    const hit = cand.find(fn);
    if (hit) return { name: hit.name, stage };
  }
  return { name: raw, stage: 'passthrough' };
}

/** Installed printers, or an empty list when enumeration fails. */
async function listSystemPrinters() {
  try {
    const wc = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.webContents : null;
    if (wc) return (await wc.getPrintersAsync()) || [];
  } catch { /* fall through */ }
  return [];
}

// ===== IPC HANDLERS =====

// Get list of available printers
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch {
    return [];
  }
});

// Silent thermal print — centralized rules (see src/printing/printConfig.ts).
// Rule 5,6: NO forced page height. Default = printer default page size so the
// printer feeds only as much paper as the content needs (fixes blank paper at
// start of receipt). Rule 8: silent + printBackground + marginType:none + scaleFactor:100.
// Rule 9,10: no paper-feed / form-feed injected before printing.

// ===== Printer PORT / DRIVER diagnostics (Windows) =====
// Port Windows printer ki property hoti hai (USB001/COM3/IP) — Electron
// deviceName se print karta hai, port khud select nahi karta. Yeh handlers
// software ke andar port+driver DIKHATE hain, driver ka apna test page
// chalate hain (hamari HTML pipeline ko bypass — foran pata chalta hai ke
// masla software me hai ya driver/paper me), aur Windows properties kholte
// hain jahan se port change hota hai.
const { exec } = require('child_process');
function psSafe(name) { return String(name || '').replace(/["`$]/g, ''); }

ipcMain.handle('get-printer-details', async () => {
  if (process.platform !== 'win32') return { success: false, printers: [] };
  return new Promise((resolve) => {
    exec('powershell -NoProfile -Command "Get-Printer | Select-Object Name,PortName,DriverName | ConvertTo-Json -Compress"',
      { windowsHide: true, timeout: 10000 }, (err, stdout) => {
        if (err) { appendLog('get-printer-details FAIL ' + err); return resolve({ success: false, error: String(err), printers: [] }); }
        try {
          let d = JSON.parse(String(stdout || '[]').trim() || '[]');
          if (!Array.isArray(d)) d = [d];
          resolve({ success: true, printers: d });
        } catch (e) { resolve({ success: false, error: String(e), printers: [] }); }
      });
  });
});

ipcMain.handle('print-windows-test-page', async (_e, printerName) => {
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  const n = psSafe(printerName);
  return new Promise((resolve) => {
    exec(`rundll32 printui.dll,PrintUIEntry /k /n "${n}"`, { windowsHide: true, timeout: 15000 }, (err) => {
      appendLog(`windows-test-page "${n}" ${err ? 'FAIL ' + err : 'sent'}`);
      resolve(err ? { success: false, error: String(err) } : { success: true });
    });
  });
});

ipcMain.handle('open-printer-properties', async (_e, printerName) => {
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  const n = psSafe(printerName);
  exec(`rundll32 printui.dll,PrintUIEntry /p /n "${n}"`, { windowsHide: true });
  return { success: true };
});


// ===== WEIGHT SCALE: Web Serial API permissions (minimart module) =====
// Electron me navigator.serial tab hi chalta hai jab main process port
// select karne aur permission dene par razi ho.
// Renderer (Settings) jo COM port chuntا hai wo yahan yaad rehta hai.
// Khali string = purana behaviour (pehla available port).
let preferredSerialPort = '';

ipcMain.handle('set-preferred-serial-port', async (_e, portName) => {
  preferredSerialPort = String(portName || '').trim().toUpperCase();
  appendLog('preferred serial port set to: ' + (preferredSerialPort || '(auto)'));
  return { success: true, port: preferredSerialPort };
});

ipcMain.handle('get-preferred-serial-port', async () => {
  return { success: true, port: preferredSerialPort };
});

// Kisi bhi string me se "COM3" jaisa token nikaalo — chahe akela ho
// ("COM3") ya displayName me chhupa ho ("WCH PCI Express-SERIAL (COM3)").
function comToken(s) {
  const m = String(s || '').toUpperCase().match(/COM\s*\d+/);
  return m ? m[0].replace(/\s+/g, '') : '';
}

function portMatchesPreferred(p, preferred) {
  if (!preferred) return false;
  const want = comToken(preferred);
  if (!want) return false;
  // portName aur displayName dono me dekho (Windows par COM number
  // kabhi portName me hota hai, kabhi friendly-name me).
  return comToken(p.portName) === want || comToken(p.displayName) === want;
}

function enableSerialForWindow(win) {
  if (!win || !win.webContents) return;
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    // Chromium still shows the operating-system consent prompt when Windows
    // location privacy requires it; this only allows the app to request GPS.
    callback(permission === 'geolocation' || permission === 'serial' || permission === 'notifications');
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'geolocation' || permission === 'serial' || permission === 'notifications';
  });
  win.webContents.session.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') return true;
    return true;
  });
  win.webContents.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    const ses = win.webContents.session;
    let done = false;

    const isRealAdapter = (p) => {
      const s = String((p.displayName || '') + ' ' + (p.portName || '')).toLowerCase();
      if (/bluetooth/.test(s)) return false;
      if (/communications port/.test(s)) return false;
      return true;
    };

    const pick = (list) => {
      if (done || !list || !list.length) return false;
      let chosen = null;
      if (preferredSerialPort) chosen = list.find(p => portMatchesPreferred(p, preferredSerialPort)) || null;
      // Preferred set hai lekin abhi list me nahi — thoda aur intezaar karo
      // (galat port se connect hone se behtar hai).
      if (!chosen && preferredSerialPort && !list.some(p => portMatchesPreferred(p, preferredSerialPort))) return false;
      chosen = chosen || list.find(isRealAdapter) || list[0];
      if (!chosen) return false;
      done = true;
      try { ses.removeListener('serial-port-added', onAdded); } catch {}
      appendLog('serial: selected → ' + (chosen.displayName || chosen.portName || chosen.portId));
      callback(chosen.portId);
      return true;
    };
    const onAdded = (_e, port) => { pick([port]); };

    appendLog('serial ports available: ' + (portList || []).map(p => (p.displayName || p.portName || p.portId)).join(', '));

    // Windows can enumerate WCH PCI-E serial ports a beat late, so give the
    // list a moment before giving up.
    if (pick(portList)) return;
    ses.on('serial-port-added', onAdded);
    setTimeout(() => {
      if (done) return;
      done = true;
      try { ses.removeListener('serial-port-added', onAdded); } catch {}
      if (preferredSerialPort) {
        // ===== v1.0.40 =====
        // Previously this fell back to "any port we can find" when the chosen
        // COM did not appear. On a counter where COM3 is a printer and the
        // scale is on COM4 that silently opened the WRONG device: the POS said
        // "scale connected" and no weight ever arrived. Refusing is honest —
        // the renderer turns this into "COM4 was not found, check the cable".
        appendLog('serial: preferred ' + preferredSerialPort + ' not found — refusing to open a different port');
        callback('');
        return;
      }
      if (portList && portList.length) {
        const fb = portList.find(isRealAdapter) || portList[0];
        appendLog('serial: no preference set → using ' + (fb.displayName || fb.portName));
        callback(fb.portId);
      } else {
        appendLog('serial: no ports enumerated in time — cable/driver issue');
        callback('');
      }
    }, 2500);
  });
}

ipcMain.handle('list-serial-ports', async () => {
  try {
    const wins = BrowserWindow.getAllWindows();
    if (!wins.length) return { success: false, ports: [] };
    const ports = await wins[0].webContents.session.listSerialPorts?.() || [];
    return { success: true, ports, preferred: preferredSerialPort };
  } catch (e) { return { success: false, error: String(e), ports: [] }; }
});


// ============================================================
// LICENSE: device identity + encrypted local vault
// See deviceIdentity.cjs — the identity no longer depends on network
// adapters, so the licence survives a restart with the internet off.
// ============================================================
const { createIdentityStore } = require('./deviceIdentity.cjs');

function runQuiet(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const { execFile } = require('child_process');
      execFile(cmd, args, { timeout: timeoutMs, windowsHide: true },
        (err, stdout) => resolve(err ? '' : String(stdout || '')));
    } catch { resolve(''); }
  });
}

const identityStore = createIdentityStore({
  userDataDir: () => app.getPath('userData'),
  run: runQuiet,
  log: (level, event, detail) => appendLog(level, event, detail),
});

ipcMain.handle('get-hardware-id', async () => {
  try { return await identityStore.describe(); }
  catch (e) { appendLog('ERROR', 'get-hardware-id', String(e)); return { success: false, error: String(e) }; }
});

ipcMain.handle('license-save', async (_e, payload) => {
  try { return await identityStore.saveLicense(payload); }
  catch (e) {
    appendLog('ERROR', 'license-save', String(e));
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('license-load', async () => {
  try { return await identityStore.loadLicense(); }
  catch (e) {
    appendLog('ERROR', 'license-load', String(e));
    return { success: true, data: null, tampered: true };
  }
});

ipcMain.handle('license-clear', async () => {
  try { return identityStore.clearLicense(); }
  catch (e) { return { success: false, error: String(e) }; }
});

// ============================================================
// PRINT STRATEGY MEMORY (v1.0.39)
// Har printer ke liye yaad rakhte hain ke kaunsi strategy chali thi,
// taake agli baar seedha wohi use ho (pehli dafa ke baad koi delay nahi).
// ============================================================
const printStrategyMemory = new Map(); // printerName -> 'custom' | 'driver' | 'minimal'

// Strategy memory ab disk par bhi rehti hai — EXE restart ke baad PEHLA hi
// bill seedhi kaamyaab strategy par jata hai (koi 2-3 second ki azmaish nahi).
function strategyFile() {
  try { return path.join(app.getPath('userData'), 'print-strategy.json'); } catch { return null; }
}
(function loadStrategyMemory() {
  try {
    const f = strategyFile();
    if (f && fs.existsSync(f)) {
      const obj = JSON.parse(fs.readFileSync(f, 'utf8') || '{}');
      for (const [k, v] of Object.entries(obj)) printStrategyMemory.set(k, v);
    }
  } catch {}
})();
function saveStrategyMemory() {
  try {
    const f = strategyFile();
    if (f) fs.writeFileSync(f, JSON.stringify(Object.fromEntries(printStrategyMemory)));
  } catch {}
}

ipcMain.handle('print-strategy-reset', async (_e, printerName) => {
  if (printerName) printStrategyMemory.delete(String(printerName));
  else printStrategyMemory.clear();
  saveStrategyMemory();
  return { success: true };
});

// ============================================================
// HIDDEN PRINT WORKER (fast path)
// Receipt/KOT ab POS ki apni window se print NAHI hoti. Ek chhupi hui
// window slip ka HTML load kar ke print karti hai — is se:
//   • POS screen print mode me nahi jati (na CSS switch, na freeze)
//   • cashier foran agla bill shuru kar sakta hai
//   • blank slip ka khatra khatam (slip ka apna alag document hota hai)
// ============================================================
let printWorker = null;
function getPrintWorker() {
  if (printWorker && !printWorker.isDestroyed()) return printWorker;
  printWorker = new BrowserWindow({
    show: false,
    width: 400,
    height: 900,
    // Parked far off-screen and kept out of the taskbar/alt-tab. show:false
    // already hides it, but a resize or capture on some Windows drivers used
    // to flash a blank frame in the corner of the screen — that flash is the
    // "white screen" the cashier saw during KOT printing.
    x: -32000,
    y: -32000,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    // JavaScript is required only for local layout/font readiness measurement.
    // The worker never loads remote content and remains fully isolated.
    webPreferences: { offscreen: false, nodeIntegration: false, contextIsolation: true, javascript: true },
  });
  printWorker.on('closed', () => { printWorker = null; });
  return printWorker;
}
app.on('before-quit', () => { try { printWorker?.destroy(); } catch {} });

// ============================================================
// PRINT-WORKER SERIALIZATION
// There is exactly ONE hidden worker window and every slip loads its own
// document into it. Two jobs landing together (a Pay that prints receipt +
// KOT + token, or a test print fired during a bill) used to overwrite each
// other's document mid-flight: one loadFile superseded the other, its await
// never settled and capturePage returned the wrong slip or nothing at all.
// Jobs now queue, so each one owns the worker until it is finished.
// ============================================================
let printWorkerChain = Promise.resolve();
const PRINT_WORKER_JOB_TIMEOUT_MS = 30000;

function withPrintWorker(job) {
  const run = () => Promise.race([
    Promise.resolve().then(job),
    new Promise(resolve => setTimeout(
      () => resolve({ success: false, error: 'print job timed out' }),
      PRINT_WORKER_JOB_TIMEOUT_MS,
    )),
  ]);
  // Chain on settle (not on success) so one failed job never blocks the queue.
  const result = printWorkerChain.then(run, run);
  printWorkerChain = result.then(() => undefined, () => undefined);
  return result;
}

// Use a local file instead of a data: URL. A data document has an opaque
// origin, so Chromium can refuse the packaged file:// Urdu fonts and silently
// substitute a plain system font. The stable file origin also avoids encoding
// and parsing a multi-megabyte URL on every receipt.
function loadPrintWorkerHtml(win, html) {
  const file = path.join(DATA_DIR, '.dtpos-print-worker.html');
  fs.writeFileSync(file, html, 'utf8');
  return win.loadFile(file);
}

// Raster conversion lives in escposRaster.cjs so the printer simulator can
// drive the exact same code offline (scripts/simulate-print.mjs). A copy
// would drift, and a drifting simulation stops telling the truth.
const { escposRasterBytes, rasterGeometry } = require('./escposRaster.cjs');

ipcMain.handle('print-html', async (_event, options = {}) => {
  const html = String(options.html || '');
  if (html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length < 10) {
    return { success: false, error: 'empty document' };
  }
  return withPrintWorker(async () => {
  let win;
  try {
    win = getPrintWorker();
    await new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = (_e, _c, desc) => { cleanup(); reject(new Error(desc || 'load failed')); };
      const cleanup = () => {
        win.webContents.removeListener('dom-ready', done);
        win.webContents.removeListener('did-finish-load', done);
        win.webContents.removeListener('did-fail-load', fail);
        clearTimeout(t);
      };
      // Large data: documents occasionally never emit did-finish-load on some
      // Electron/Windows combinations. Waiting for that old 4-second safety
      // timer was the exact delay users felt. Inline styles are parsed by
      // dom-ready; complex fonts are awaited separately below.
      const t = setTimeout(() => { cleanup(); resolve(); }, 800);
      win.webContents.once('dom-ready', done);
      win.webContents.once('did-finish-load', done);
      win.webContents.once('did-fail-load', fail);
      loadPrintWorkerHtml(win, html).catch(() => {});
    });
    // Urdu/Nastaleeq must finish shaping. Latin-only slips get a much shorter
    // safety cap so a Pay click is not held up by an unrelated font.
    try {
      const needsComplexFont = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]|aseer|sameer|jameel|nastaleeq|urdu/i.test(html);
      // Latin-only slips (99% of receipts/KOT/tokens) no longer wait at all —
      // system fonts are already loaded, so this was pure delay.
      if (needsComplexFont) {
        await Promise.race([
          win.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true'),
          new Promise(resolve => setTimeout(resolve, 900)),
        ]);
      }
    } catch {}
    return await runPrintJob(win.webContents, options);
  } catch (e) {
    return { success: false, error: String(e && e.message ? e.message : e) };
  }
  });
});

// Exact-template direct printing: render the same React receipt in Chromium,
// capture its complete dynamic height, convert to ESC/POS raster bytes, and
// submit one RAW spooler job. No preview/dialog and no text-template bypass.
ipcMain.handle('print-html-escpos', async (_event, options = {}) => {
  const started = Date.now();
  const html = String(options.html || '');
  if (html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length < 10) {
    return { success: false, error: 'empty document' };
  }
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  return withPrintWorker(async () => {
  try {
    const win = getPrintWorker();
    await loadPrintWorkerHtml(win, html);
    const needsComplexFont = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]|aseer|sameer|jameel|nastaleeq|urdu/i.test(html);
    if (needsComplexFont) {
      await Promise.race([
        win.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true'),
        new Promise(resolve => setTimeout(resolve, 1200)),
      ]);
    }
    // ===== SQUEEZED-SLIP FIX (narrow content, wide blank right band) =====
    // The WIDTH must be the slip's AUTHORED width, never scrollWidth.
    //
    // This used to take Math.max(rect.width, scrollWidth). The document is
    // laid out at exactly the content width, so scrollWidth only ever exceeds
    // rect.width when some child OVERFLOWS — a long unbroken word, a table
    // whose columns will not compress, an oversized image. That overflow is
    // blank paper to the right of the real content, and taking it as the
    // capture width meant the downscale to the printer's dots squeezed the
    // whole receipt into a fraction of the roll: narrow content with a wide
    // empty band down the right, on a slip whose margins were already equal.
    //
    // Overflow is CLIPPED (the head cannot print past the paper anyway), not
    // scaled down, and reported so the cause is visible in the log instead of
    // being guessed at from a photograph. Height still uses scrollHeight,
    // because a slip legitimately grows downwards.
    const measure = `(() => {
      const root = document.querySelector('.dt-fast-root') || document.body;
      const r = root.getBoundingClientRect();
      const authored = Math.ceil(Math.max(r.width, 1));
      return {
        width: authored,
        overflow: Math.max(0, Math.ceil(root.scrollWidth) - authored),
        height: Math.ceil(Math.max(r.height, root.scrollHeight, document.body.scrollHeight, 1)),
      };
    })()`;
    let metrics = await win.webContents.executeJavaScript(measure);
    if (!metrics || metrics.width < 20 || metrics.height < 20) throw new Error('Rendered receipt has no printable area');
    if (metrics.overflow > 2) {
      try {
        appendLog('WARN', 'DT-Print slip overflow',
          `content overflows its ${metrics.width}px box by ${metrics.overflow}px — clipped rather than scaled. ` +
          `A long unbroken word or a table that will not compress is the usual cause.`);
      } catch {}
    }

    // HIGH-RESOLUTION CAPTURE (print-quality fix):
    // The slip lays out at ~302 CSS px for 80 mm, but the printer has 576 dots.
    // Capturing at 1x and stretching the bitmap produced grey, fuzzy text.
    // Zooming the worker so one CSS px maps to ~1 printer dot (or more) means
    // the bitmap is only ever DOWN-sampled -> sharp, solid, dark characters.
    const paperLabel = options.paperLabel || '80mm';
    const paperDots = paperLabel === '58mm' ? 384 : paperLabel === '110mm' ? 832 : 576;
    const paperMm = paperLabel === '58mm' ? 48 : paperLabel === '110mm' ? 104 : 72;
    const marginLeftMm = Number(options.marginLeftMm) || 0;
    const marginRightMm = Number(options.marginRightMm) || 0;
    const contentDots = Math.max(32, paperDots - Math.round((marginLeftMm + marginRightMm) * (paperDots / paperMm)));
    const quality = Math.max(1, Math.min(3, Number(options.qualityScale) || 2));
    const requestedZoom = Math.max(1, Math.min(8, (contentDots / metrics.width) * quality));
    // Never trade receipt completeness for supersampling. Extremely long bills
    // lower their capture scale automatically instead of hitting Chromium's
    // bitmap limit and losing the final rows.
    const fittingZoom = Math.min(4000 / metrics.width, 30000 / metrics.height);
    const zoom = Math.max(1, Math.min(requestedZoom, fittingZoom));

    // ===== SQUEEZED-SLIP FIX (huge blank right margin) =====
    // The capture size MUST be derived from the 1x measurement taken above.
    // This used to re-measure after zooming and overwrite `metrics` with the
    // result, then multiply that by the zoom again. Whether the re-measured
    // rect comes back in CSS pixels or already-scaled pixels depends on the
    // Chromium/Windows/display-scaling combination, so on some machines the
    // capture came out several times wider than the slip. The extra width is
    // blank paper, and the downscale to the printer's dots then squeezed the
    // whole receipt into a fraction of the roll — a narrow slip with a wide
    // empty right margin, exactly as reported.
    //
    // Layout does not change under zoom (the slip is sized in mm, an absolute
    // unit), so the 1x numbers stay correct and there is nothing to re-read.
    const baseWidth = metrics.width;
    const baseHeight = metrics.height;
    try {
      win.webContents.setZoomFactor(zoom);
      await new Promise(resolve => setTimeout(resolve, 20));
    } catch { /* keep 1x layout */ }

    // Resize before capture so capturePage includes the complete receipt rather
    // than only the old 900px viewport (the source of truncated short strips).
    // capturePage uses device-independent pixels while getBoundingClientRect
    // reports CSS pixels, so include the zoom once to capture the entire slip.
    const capW = Math.ceil(baseWidth * zoom);
    const capH = Math.ceil(baseHeight * zoom);
    win.setContentSize(Math.min(4000, capW), Math.min(30000, capH));
    await new Promise(resolve => setImmediate(resolve));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: Math.min(4000, capW), height: Math.min(30000, capH) });
    try { win.webContents.setZoomFactor(1); } catch {}
    if (image.isEmpty()) throw new Error('Rendered receipt capture is empty');
    let diag = null;
    const bytes = escposRasterBytes(image, paperLabel, options.autoCut !== false, {
      onDiagnostics: d => { diag = d; },
      darkness: options.darkness,
      bold: options.boldPrint === true,
      marginLeftMm,
      marginRightMm,
      bottomFeedLines: options.bottomFeedLines,
    });
    // A healthy slip fills nearly the whole printable width. Anything much
    // narrower means the capture was wider than the slip and the downscale
    // squeezed it into part of the roll — the narrow-receipt-with-a-wide-
    // right-margin fault. Record it so the cause is visible in the log
    // instead of being guessed at from a photograph.
    if (diag && diag.coverage > 0 && diag.coverage < 0.75) {
      try {
        appendLog('WARN', 'DT-Print narrow slip',
          `ink covered ${(diag.coverage * 100).toFixed(0)}% of ${diag.contentDots} dots ` +
          `(capture ${baseWidth}x${baseHeight} css px, zoom ${zoom.toFixed(2)})`);
      } catch {}
    }

    const copies = Math.max(1, Number(options.copies) || 1);
    const result = await sendRawWithWarmWorker(String(options.printerName || '').trim(), bytes, copies);
    return { ...result, durationMs: Date.now() - started, renderedHeightPx: baseHeight, bytes: bytes.length };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e), durationMs: Date.now() - started };
  } finally {
    // Always hand the worker back at 1x. A job that threw between
    // setZoomFactor and the reset used to leave the zoom applied, so the
    // NEXT slip was measured and captured at the wrong scale.
    try { if (printWorker && !printWorker.isDestroyed()) printWorker.webContents.setZoomFactor(1); } catch {}
  }
  });
});

ipcMain.handle('print-receipt', async (_event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No window' };
  // FREEZE FIX: this handler must ALWAYS resolve. A rejected invoke() made
  // the renderer throw out of its print function, skipping the cleanup that
  // takes the POS out of print mode — the window then stayed blank until
  // the app was restarted. Failures are reported as a value instead.
  try {
    return await runPrintJob(mainWindow.webContents, options);
  } catch (e) {
    const error = String((e && e.message) || e);
    try { appendLog('ERROR', 'DT-Print print-receipt crashed', error); } catch {}
    return { success: false, error };
  }
});

async function runPrintJob(targetContents, options = {}) {
  if (!targetContents || targetContents.isDestroyed()) return { success: false, error: 'No window' };


  const copies = Math.max(1, Number(options.copies) || 1);
  const usePrinterDefaultPageSize = options.usePrinterDefaultPageSize === true;

  const baseOptions = {
    silent: options.silent !== false,
    printBackground: true,
    margins: { marginType: 'none' },
    copies,
  };

  // ============================================================
  // PRINTER NAME RESOLUTION
  //
  // Reported fault: the app said printer "BIXOLON SRP-352plusIII (Copy 1)"
  // was not found although Windows had it installed. The old code compared
  // names for EXACT equality and hard-failed on a miss, so it never even
  // attempted the print and the fallback chain never ran.
  //
  // Resolution is delegated to matchPrinterName (the single shared matcher),
  // which never hard-fails: an unmatched name is handed to Windows as-is,
  // because the spooler frequently knows names Electron's list does not
  // carry. If that fails too, the job falls back to the default printer.
  // ============================================================
  let deviceName = '';
  let printerList = [];
  let matchStage = 'none';
  if (options.printerName) {
    const requested = String(options.printerName).replace(/\u00A0/g, ' ').trim();
    try {
      printerList = (await targetContents.getPrintersAsync()) || [];
      // ONE matcher for the whole app — see matchPrinterName above. This used
      // to be a second, inline copy of the same six stages.
      const hit = matchPrinterName(requested, printerList);
      deviceName = hit.name;
      matchStage = hit.stage;
      if (matchStage === 'passthrough') {
        appendLog('WARN', 'DT-Print printer-not-in-list',
          `requested="${requested}" available="${printerList.map(p => p.name).join(' | ')}" → passthrough`);
      }
    } catch (e) {
      deviceName = requested;
      matchStage = 'enumerate-failed';
    }
  }

  // ---- Build the candidate strategies ----
  // custom  : explicit pageSize (best on Epson/generic ESC-POS Windows drivers)
  // driver  : NO pageSize — printer ki apni preferences (BIXOLON 352 / 111 Plus
  //           jaise drivers custom page size REJECT kar dete hain → job fail)
  // minimal : sirf silent+copies (aakhri koshish)
  const width = Number(options.pageWidthMicrons) || 80000;
  const hasExplicitHeight = Number(options.pageHeightMicrons) > 0;
  const height = hasExplicitHeight
    ? Math.max(20000, Number(options.pageHeightMicrons))
    : null;

  const strategies = {
    ...(hasExplicitHeight ? { custom: { ...baseOptions, pageSize: { width, height } } } : {}),
    driver: { ...baseOptions },
    minimal: { silent: baseOptions.silent, copies },
  };
  // FREEZE FIX: `custom` only exists when an explicit page height was sent.
  // Assigning into it unconditionally threw a TypeError for every job that
  // used the printer's default page size — and because that throw escaped
  // both this function's try block and the `print-receipt` handler, the
  // renderer's await rejected before it could take the POS out of print
  // mode. That is the white, stuck screen after a KOT. Assign per strategy.
  if (deviceName) {
    for (const s of Object.values(strategies)) s.deviceName = deviceName;
  }

  // Order: agar printer ke liye pehle se koi strategy chali thi to wohi pehle.
  let order = hasExplicitHeight && !usePrinterDefaultPageSize
    ? ['custom', 'driver', 'minimal']
    : ['driver', ...(hasExplicitHeight ? ['custom'] : []), 'minimal'];
  const remembered = deviceName ? printStrategyMemory.get(deviceName) : null;
  if (remembered) order = [remembered, ...order.filter(s => s !== remembered)];
  // A remembered strategy can name one that does not exist for this job
  // (e.g. 'custom' without an explicit height). Never dispatch undefined
  // options to webContents.print.
  order = order.filter(s => !!strategies[s]);

  // FREEZE FIX: some Windows thermal drivers never invoke the print
  // callback when the spooler stalls. Without a cap the await below never
  // settles, the print queue's job stays "printing" and the POS sits in
  // print mode. Treat silence as a failed attempt and move to the next
  // strategy — the job is reported, not lost.
  const PRINT_CALLBACK_TIMEOUT_MS = 12000;
  const tryPrint = (opts) => new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ success: false, error: 'printer did not respond in time' }),
      PRINT_CALLBACK_TIMEOUT_MS,
    );
    try {
      targetContents.print(opts, (success, failureReason) => {
        finish({ success: !!success, error: failureReason || null });
      });
    } catch (e) {
      finish({ success: false, error: String(e && e.message ? e.message : e) });
    }
  });

  try {
    appendLog('INFO', 'DT-Print request',
      `printer="${deviceName || options.printerName || 'default'}" ` +
      `paper=${options.paperLabel || '80mm'} order=${order.join('>')} ` +
      `pageSize=${width}x${height} copies=${copies} silent=${baseOptions.silent}`);
  } catch {}

  const attempts = [];
  for (const name of order) {
    const res = await tryPrint(strategies[name]);
    attempts.push(`${name}:${res.success ? 'ok' : (res.error || 'fail')}`);
    if (res.success) {
      if (deviceName) { printStrategyMemory.set(deviceName, name); saveStrategyMemory(); }
      try {
        appendLog('INFO', 'DT-Print result',
          `result=success strategy=${name} match=${matchStage} printer="${deviceName || 'default'}" attempts=[${attempts.join(' | ')}]`);
      } catch {}
      return { success: true, error: null, strategy: name, matchStage };
    }
    if (/cancel/i.test(String(res.error || ''))) break;
  }

  // ---- AAKHRI SAFETY NET ----
  // Named printer par sab kuch fail ho gaya. Ho sakta hai naam hi ghalat ho
  // (rename/duplicate). Windows ke DEFAULT printer par ek koshish kar lo —
  // kaam ruke na. (Sirf tab jab humne koi naam bheja tha.)
  if (deviceName) {
    const noName = { ...baseOptions };
    const res = await tryPrint(noName);
    attempts.push(`default-printer:${res.success ? 'ok' : (res.error || 'fail')}`);
    if (res.success) {
      try {
        appendLog('WARN', 'DT-Print result',
          `result=success-on-default requested="${deviceName}" match=${matchStage} attempts=[${attempts.join(' | ')}]`);
      } catch {}
      return {
        success: true, error: null, strategy: 'default-printer', matchStage,
        warning: `Printed on the Windows default printer because "${deviceName}" could not be used.`,
      };
    }
  }

  const available = printerList.map(p => p.name).filter(Boolean);
  try {
    appendLog('ERROR', 'DT-Print result',
      `result=fail printer="${deviceName || 'default'}" match=${matchStage} ` +
      `available="${available.join(' | ')}" attempts=[${attempts.join(' | ')}]`);
  } catch {}
  return {
    success: false,
    error:
      `Print failed on "${deviceName || 'default printer'}".\n` +
      (available.length
        ? `Printers Windows reports: ${available.join(', ')}.\n`
        : `Windows reported no printers at all — check that the print spooler service is running.\n`) +
      `Tried: ${attempts.join(' | ')}`,
    attempts,
    available,
    matchStage,
  };
}

// Show Save dialog for backup export
// ============================================================
// PRINT DIAGNOSTICS (v1.0.39)
// Requirement 16: printer masla aane par asal wajah pakadne ke liye.
// NOTE: koi customer/business data yahan record NAHI hota — sirf machine,
// printer aur driver ki technical info.
// ============================================================
ipcMain.handle('print-diagnostics', async () => {
  try {
    let printers = [];
    try {
      printers = (await mainWindow.webContents.getPrintersAsync()) || [];
    } catch (e) { printers = []; }
    return {
      success: true,
      data: {
        appVersion: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        platform: process.platform,
        osRelease: os.release(),
        arch: process.arch,
        timestamp: new Date().toISOString(),
        printers: printers.map(p => ({
          name: p.name,
          displayName: p.displayName,
          isDefault: !!p.isDefault,
          status: p.status,
          // driver/page info jahan available ho
          description: p.description || '',
          options: p.options || {},
          workingStrategy: printStrategyMemory.get(p.name) || null,
        })),
      },
    };
  } catch (e) {
    return { success: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle('show-save-dialog', async (_event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Backup',
    defaultPath: defaultName || 'desi-pos-backup.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  return result;
});

// Show Open dialog for backup import
// ============================================================
// PICK A VIDEO FOR THE CUSTOMER DISPLAY
//
// Why this is a main-process dialog and not window.prompt().
//
// The Add Video button used to open `window.prompt()` and ask the shop to
// TYPE a path. Electron does not implement prompt() — it returns null and
// writes "prompt() is and will not be supported" to the console — so in the
// packaged Windows app the button did nothing at all. It worked when tested
// in a browser, which is exactly how it shipped.
//
// A native file dialog is also simply the right control: nobody should be
// typing `file:///C:/Users/.../promo.mp4` by hand.
//
// The video is NOT copied. Only its path is stored, because these settings
// live in localStorage alongside the banners and a promo video is tens of
// megabytes. The file therefore has to stay where it is, which the settings
// screen says plainly.
// ============================================================
ipcMain.handle('pick-media-file', async (_event, kind = 'video') => {
  const filters = kind === 'video'
    ? [{ name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv'] }]
    : [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }];
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: kind === 'video' ? 'Choose a video for the customer display' : 'Choose an image',
      filters,
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) {
      return { success: false, canceled: true };
    }
    const filePath = result.filePaths[0];
    let sizeBytes = 0;
    try { sizeBytes = fs.statSync(filePath).size; } catch { /* size is informational */ }
    return {
      success: true,
      path: filePath,
      name: path.basename(filePath),
      sizeBytes,
      // A file:// URL is what a <video src> needs. The packaged app itself is
      // loaded from file://, so this is same-scheme and plays; under the dev
      // server (http://localhost) the browser blocks it, which the settings
      // screen warns about rather than failing silently.
      url: pathToFileUrl(filePath),
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
});

/** Windows path -> file:// URL, with each segment escaped. */
function pathToFileUrl(filePath) {
  const normalised = String(filePath).replace(/\\/g, '/');
  const withSlash = normalised.startsWith('/') ? normalised : '/' + normalised;
  return 'file://' + withSlash.split('/').map(encodeURIComponent).join('/').replace(/^%2F/, '/');
}

ipcMain.handle('show-open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Backup',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });
  return result;
});

// Write file
ipcMain.handle('write-file', async (_event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, data, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Read file
ipcMain.handle('read-file', async (_event, filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== LAN / Network ESC/POS Printing =====
// Sends raw ESC/POS bytes directly to a network thermal printer
// over TCP (typical port 9100). No Windows driver needed.
function humanizeNetError(err) {
  const code = (err && err.code) || '';
  const msg = (err && err.message) || String(err);
  switch (code) {
    case 'ETIMEDOUT':
    case 'ERR_SOCKET_TIMEOUT':
      return 'Could not connect to the printer (timed out). Check that the printer is switched on, the network cable is connected, the computer and printer are on the same network, and the IP address is correct.';
    case 'ECONNREFUSED':
      return 'The printer refused the connection. The port may be wrong (9100 is the usual one), or another application is already using the printer.';
    case 'EHOSTUNREACH':
      return 'The printer is on a different subnet. The computer and the printer need IP addresses in the same range — for example both 192.168.1.x.';
    case 'ENETUNREACH':
      return 'The network is unreachable. Check the network cable, or restart the router.';
    case 'EHOSTDOWN':
      return 'The printer is switched off or restarting.';
    case 'ENOTFOUND':
      return 'The printer IP address could not be found. Run the printer self-test print to read its current IP.';
    case 'ECONNRESET':
      return 'The printer dropped the connection. Power cycle it: switch off, wait ten seconds, switch on.';
    default:
      return msg || 'Unknown network error';
  }
}

// Attempt one TCP send. Resolves with { success, error }.
function sendEscposOnce(host, port, buffer, timeout) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      try { client.destroy(); } catch {}
      resolve(result);
    };
    client.setTimeout(timeout);
    client.on('timeout', () => finish({ success: false, error: humanizeNetError({ code: 'ETIMEDOUT' }) }));
    client.on('error', (err) => finish({ success: false, error: humanizeNetError(err), code: err.code }));
    client.connect(port, host, () => {
      client.write(buffer, (err) => {
        if (err) return finish({ success: false, error: humanizeNetError(err), code: err.code });
        // small delay to let printer buffer flush
        setTimeout(() => finish({ success: true }), 400);
      });
    });
  });
}

ipcMain.handle('print-lan-escpos', async (_event, options = {}) => {
  const host = options.host;
  const port = Number(options.port) || 9100;
  const timeout = Number(options.timeout) || 6000;
  const maxAttempts = Math.max(1, Number(options.retries) || 3);
  const data = options.data; // Array<number> | base64 string
  if (!host) return { success: false, error: 'No printer IP' };
  if (!data) return { success: false, error: 'No data' };

  let buffer;
  if (Array.isArray(data)) {
    buffer = Buffer.from(data);
  } else if (typeof data === 'string') {
    buffer = Buffer.from(data, 'base64');
  } else {
    return { success: false, error: 'Invalid data format' };
  }

  // Retry loop — network printers often need 2-3 attempts (thermal buffers,
  // WiFi router hiccups, printer just woke from sleep).
  let last = { success: false, error: 'No attempts made' };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await sendEscposOnce(host, port, buffer, timeout);
    if (last.success) return { success: true, attempts: attempt };
    // Do not retry on refusals — root cause is config, not transient
    if (last.code === 'ECONNREFUSED' || last.code === 'ENOTFOUND') break;
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 600));
  }
  return { success: false, error: last.error, attempts: maxAttempts };
});

// Ping LAN printer (quick TCP connect test)
ipcMain.handle('test-lan-printer', async (_event, options = {}) => {
  const host = options.host;
  const port = Number(options.port) || 9100;
  if (!host) return { success: false, error: 'No IP' };
  return new Promise((resolve) => {
    const client = new net.Socket();
    let done = false;
    const finish = (r) => { if (!done) { done = true; try { client.destroy(); } catch {} resolve(r); } };
    client.setTimeout(4000);
    client.on('timeout', () => finish({ success: false, error: humanizeNetError({ code: 'ETIMEDOUT' }) }));
    client.on('error', (err) => finish({ success: false, error: humanizeNetError(err), code: err.code }));
    client.connect(port, host, () => finish({ success: true }));
  });
});

// ===== Printer Diagnostics IPC =====
// Generic TCP ping for any host:port (used to verify network printer reachability)
// ============================================================
// KITCHEN DISPLAY — external screens
//
// What this can and cannot know
// -----------------------------
// Electron reports the displays the OPERATING SYSTEM has: id, label, size,
// scale and position. It does NOT report the cable. Windows does not expose
// "this monitor is on HDMI" through any API Electron surfaces, so inventing
// an HDMI/USB/VGA picker would be a label with nothing behind it — it would
// look informative and be a guess.
//
// So the picker shows what is real and sufficient: each display's OS label,
// its resolution, and which one is primary. A kitchen TV on HDMI, a second
// monitor on VGA and a USB display adapter all appear the same way, because
// once the OS has them they ARE the same thing to the application — a screen
// with bounds you can put a window on. Whichever cable it arrived by, the
// window lands on it.
//
// The KDS window is a real second window, positioned inside the chosen
// display's bounds and then made fullscreen, which is how the OS puts it on
// that physical screen.
// ============================================================
let kdsWindow = null;

/** Serialise one Electron Display for the renderer's picker. */
function describeDisplay(d, primaryId) {
  const w = d.size?.width ?? d.bounds?.width ?? 0;
  const h = d.size?.height ?? d.bounds?.height ?? 0;
  return {
    id: d.id,
    // `label` is the OS's own monitor name where it has one. It is often
    // blank on Windows, so a readable fallback is built from the resolution.
    label: (d.label && String(d.label).trim()) || `Display ${w}x${h}`,
    width: w,
    height: h,
    scaleFactor: d.scaleFactor || 1,
    bounds: d.bounds,
    primary: d.id === primaryId,
    internal: !!d.internal,
    rotation: d.rotation || 0,
  };
}

ipcMain.handle('list-displays', async () => {
  try {
    const primary = screen.getPrimaryDisplay();
    const all = screen.getAllDisplays().map(d => describeDisplay(d, primary.id));
    return { success: true, displays: all, primaryId: primary.id };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e), displays: [] };
  }
});

// ============================================================
// A SCREEN WAS PLUGGED IN, OR PULLED OUT.
//
// Windows tells Electron the moment a monitor appears or disappears, whatever
// it arrived on — HDMI, DisplayPort, VGA through an adapter, a USB display.
// Relaying that to the renderer means the Display Center list is right the
// instant a TV is switched on, instead of the shop pressing refresh and
// wondering why nothing is there.
//
// It is a NOTIFICATION, not an action. Nothing opens, moves or closes by
// itself: a window jumping to another monitor mid-service, or a display
// re-opening over the till while a bill is being taken, is exactly the
// disturbance this is supposed to prevent. The shop clicks the screen it
// wants; the software only keeps the list honest.
// ============================================================
function broadcastDisplays(reason) {
  let payload;
  try {
    const primary = screen.getPrimaryDisplay();
    payload = {
      reason,
      displays: screen.getAllDisplays().map(d => describeDisplay(d, primary.id)),
      primaryId: primary.id,
    };
  } catch (e) {
    payload = { reason, displays: [], error: String((e && e.message) || e) };
  }
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send('displays-changed', payload);
    } catch { /* a window closing mid-broadcast is not an error */ }
  }
}

try {
  screen.on('display-added', () => broadcastDisplays('added'));
  screen.on('display-removed', () => broadcastDisplays('removed'));
  // A resolution or scaling change moves the same screen's bounds, which is
  // what an already-open display window is positioned by.
  screen.on('display-metrics-changed', () => broadcastDisplays('changed'));
} catch { /* older Electron: the renderer still polls */ }

ipcMain.handle('open-kds-window', async (_event, options = {}) => {
  try {
    const url = String(options.url || '');
    if (!url) return { success: false, error: 'No Kitchen Display address was given.' };

    const displays = screen.getAllDisplays();
    const wanted = Number(options.displayId);
    const target = displays.find(d => d.id === wanted)
      // Prefer an EXTERNAL screen when nothing was chosen: a kitchen display
      // on the cashier's own monitor helps nobody.
      || displays.find(d => !d.internal && d.id !== screen.getPrimaryDisplay().id)
      || screen.getPrimaryDisplay();

    if (kdsWindow && !kdsWindow.isDestroyed()) {
      try { kdsWindow.destroy(); } catch {}
      kdsWindow = null;
    }

    const b = target.bounds;
    kdsWindow = new BrowserWindow({
      // Positioned INSIDE the chosen display's bounds — this is what puts the
      // window on that physical screen before fullscreen takes over.
      x: b.x + 40,
      y: b.y + 40,
      width: Math.max(800, b.width - 80),
      height: Math.max(600, b.height - 80),
      backgroundColor: '#0b1220',
      autoHideMenuBar: true,
      title: 'Kitchen Display',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    kdsWindow.on('closed', () => { kdsWindow = null; });
    await kdsWindow.loadURL(url);

    if (options.fullscreen !== false) {
      try { kdsWindow.setFullScreen(true); } catch { /* some drivers refuse */ }
    }
    kdsWindow.show();

    try {
      appendLog('INFO', 'KDS display',
        `opened on display ${target.id} (${b.width}x${b.height} at ${b.x},${b.y}) primary=${target.id === screen.getPrimaryDisplay().id}`);
    } catch {}

    return {
      success: true,
      displayId: target.id,
      bounds: b,
      primary: target.id === screen.getPrimaryDisplay().id,
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('close-kds-window', async () => {
  try {
    if (kdsWindow && !kdsWindow.isDestroyed()) kdsWindow.destroy();
    kdsWindow = null;
    return { success: true };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('kds-window-open', async () => ({
  success: true,
  open: !!(kdsWindow && !kdsWindow.isDestroyed()),
}));

app.on('before-quit', () => {
  try { if (kdsWindow && !kdsWindow.isDestroyed()) kdsWindow.destroy(); } catch {}
});

// ============================================================
// LAN PRINTER DISCOVERY
//
// Network thermal printers listen on TCP 9100 (the "RAW"/JetDirect port).
// There is no broadcast protocol they all agree on, so the reliable way to
// find one is to probe that port across the machine's own subnet — which is
// exactly what a printer setup wizard does.
//
// Deliberately narrow and honest about it:
//   • Only /24 subnets are scanned. Anything larger is thousands of probes,
//     and a restaurant counter is never on one.
//   • Only the interfaces this machine actually has, never a guessed range.
//   • Short timeout, capped concurrency: the scan must not saturate the
//     network the POS is also using to take orders.
//   • A host that merely ACCEPTS a connection on 9100 is REPORTED, not
//     assumed to be a printer. Nothing is auto-configured; the user still
//     chooses. Claiming certainty we do not have would be worse than a
//     manual IP box.
// ============================================================
function localIpv4Subnets() {
  const out = [];
  try {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list || []) {
        if (i.family !== 'IPv4' || i.internal) continue;
        // Only /24 — see above.
        if (String(i.netmask) !== '255.255.255.0') continue;
        const parts = String(i.address).split('.');
        if (parts.length !== 4) continue;
        out.push({ base: `${parts[0]}.${parts[1]}.${parts[2]}`, self: i.address });
      }
    }
  } catch { /* no interfaces we can read */ }
  return out;
}

/** Probe one host:port. Resolves true only on a completed connection. */
function probePort(host, port, timeout) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch {}
      resolve(ok);
    };
    sock.setTimeout(timeout);
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(port, host, () => done(true));
  });
}

ipcMain.handle('scan-lan-printers', async (_event, options = {}) => {
  const port = Number(options.port) || 9100;
  const timeout = Math.max(150, Math.min(2000, Number(options.timeout) || 400));
  const concurrency = Math.max(8, Math.min(128, Number(options.concurrency) || 64));
  const started = Date.now();

  const subnets = localIpv4Subnets();
  if (!subnets.length) {
    return { success: false, error: 'No IPv4 network with a /24 subnet was found on this machine.', printers: [] };
  }

  const targets = [];
  for (const { base, self } of subnets) {
    for (let n = 1; n <= 254; n++) {
      const ip = `${base}.${n}`;
      if (ip !== self) targets.push(ip);
    }
  }

  const found = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const ip = targets[cursor++];
      if (await probePort(ip, port, timeout)) found.push(ip);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  found.sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
  });

  try {
    appendLog('INFO', 'DT-Print lan scan',
      `subnets=${subnets.map(s => s.base + '.0/24').join(',')} port=${port} ` +
      `found=${found.length} in ${Date.now() - started}ms`);
  } catch {}

  return {
    success: true,
    port,
    scanned: targets.length,
    durationMs: Date.now() - started,
    subnets: subnets.map(s => `${s.base}.0/24`),
    printers: found.map(host => ({ host, port })),
  };
});

ipcMain.handle('ping-host', async (_event, options = {}) => {
  const host = options.host;
  const port = Number(options.port) || 9100;
  const timeout = Number(options.timeout) || 3500;
  if (!host) return { ok: false, error: 'No host' };
  const start = Date.now();
  // Try up to 2 attempts — first packet often lost on cold LAN
  const tryOnce = () => new Promise((resolve) => {
    const client = new net.Socket();
    let done = false;
    const finish = (r) => { if (!done) { done = true; try { client.destroy(); } catch {} resolve(r); } };
    client.setTimeout(timeout);
    client.on('timeout', () => finish({ ok: false, error: humanizeNetError({ code: 'ETIMEDOUT' }), code: 'ETIMEDOUT', ms: Date.now() - start }));
    client.on('error', (err) => finish({ ok: false, error: humanizeNetError(err), code: err.code, ms: Date.now() - start }));
    client.connect(port, host, () => finish({ ok: true, ms: Date.now() - start }));
  });
  let r = await tryOnce();
  if (!r.ok && r.code !== 'ECONNREFUSED' && r.code !== 'ENOTFOUND') {
    await new Promise((res) => setTimeout(res, 400));
    r = await tryOnce();
  }
  // Add subnet hint if unreachable
  if (!r.ok) {
    try {
      const ifaces = os.networkInterfaces();
      const locals = [];
      for (const list of Object.values(ifaces)) {
        for (const i of list || []) {
          if (i.family === 'IPv4' && !i.internal) locals.push(i.address);
        }
      }
      const hostPrefix = host.split('.').slice(0, 3).join('.');
      const sameSubnet = locals.some((ip) => ip.startsWith(hostPrefix + '.'));
      r.localIps = locals;
      if (!sameSubnet && locals.length) {
        r.error = `${r.error} | Laptop IPs: ${locals.join(', ')} — printer (${host}) different subnet me hai. Same range me lao (e.g. ${locals[0].split('.').slice(0,3).join('.')}.x)`;
      }
    } catch {}
  }
  return r;
});

// Run a shell command (used for spooler diagnostics & auto-fix on Windows)
function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    try {
      const { spawn } = require('child_process');
      const child = spawn(cmd, args, { windowsHide: true, ...opts });
      let out = '', err = '';
      child.stdout && child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr && child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('error', (e) => resolve({ code: -1, out, err: err || e.message }));
      child.on('close', (code) => resolve({ code, out, err }));
    } catch (e) {
      resolve({ code: -1, out: '', err: e.message });
    }
  });
}

// Windows Print Spooler status (uses `sc query Spooler`)
ipcMain.handle('printer-spooler-status', async () => {
  if (process.platform !== 'win32') return { running: true, platform: process.platform, note: 'Not Windows — spooler not applicable' };
  const r = await runCmd('sc', ['query', 'Spooler']);
  const running = /STATE\s*:\s*4\s*RUNNING/i.test(r.out);
  return { running, raw: r.out || r.err };
});

// Restart spooler (requires admin on Windows — will fail silently otherwise)
ipcMain.handle('printer-restart-spooler', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Only on Windows' };
  const stop = await runCmd('net', ['stop', 'Spooler']);
  const start = await runCmd('net', ['start', 'Spooler']);
  const ok = /successful|started/i.test(start.out);
  return { success: ok, stopOut: stop.out, startOut: start.out, error: ok ? null : (start.err || start.out) };
});

// Clear all stuck print jobs (Windows: delete files in spool folder)
ipcMain.handle('printer-clear-queue', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Only on Windows' };
  try {
    const spoolDir = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'spool', 'PRINTERS');
    if (!fs.existsSync(spoolDir)) return { success: true, cleared: 0 };
    const files = fs.readdirSync(spoolDir);
    let cleared = 0;
    for (const f of files) {
      try { fs.unlinkSync(path.join(spoolDir, f)); cleared++; } catch {}
    }
    return { success: true, cleared };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===== Auto-update IPC =====
ipcMain.handle('open-external', async (_e, url) => {
  try { await shell.openExternal(url); return { success: true }; }
  catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('download-and-run-installer', async (_event, url) => {
  if (!url) return { success: false, error: 'No URL' };
  return new Promise((resolve) => {
    try {
      const tmpDir = app.getPath('temp');
      const fileName = `DT-POS-Update-${Date.now()}.exe`;
      const filePath = require('path').join(tmpDir, fileName);
      const file = fs.createWriteStream(filePath);
      const lib = url.startsWith('https') ? https : http;

      const doGet = (u, redirects = 0) => {
        lib.get(u, (res) => {
          // follow redirects
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
            res.resume();
            return doGet(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) {
            file.close(); try { fs.unlinkSync(filePath); } catch {}
            return resolve({ success: false, error: `HTTP ${res.statusCode}` });
          }
          const total = parseInt(res.headers['content-length'] || '0', 10);
          let received = 0;
          res.on('data', (chunk) => {
            received += chunk.length;
            if (total && mainWindow) {
              const pct = Math.min(99, Math.floor((received / total) * 100));
              try { mainWindow.webContents.send('update-progress', pct); } catch {}
            }
          });
          res.pipe(file);
          file.on('finish', () => {
            file.close(() => {
              if (mainWindow) { try { mainWindow.webContents.send('update-progress', 100); } catch {} }
              // Launch installer then quit so it can replace files
              shell.openPath(filePath).then((err) => {
                if (err) return resolve({ success: false, error: err });
                resolve({ success: true });
                setTimeout(() => app.quit(), 1500);
              });
            });
          });
        }).on('error', (err) => {
          try { fs.unlinkSync(filePath); } catch {}
          resolve({ success: false, error: err.message });
        });
      };
      doGet(url);
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// ============================================================
// APPROXIMATE LOCATION (main process)
// Renderer se IP-geolocation calls kabhi kabhi CSP/CORS ki wajah se fail
// hoti thin — is liye ab Node khud fetch karta hai (koi browser pabandi
// nahi). Sirf approximate city/region/country + lat/lon.
// ============================================================
function fetchJson(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, { headers: { 'User-Agent': 'DT-POS' } }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      });
      req.setTimeout(timeoutMs, () => { try { req.destroy(); } catch {} resolve(null); });
      req.on('error', () => resolve(null));
    } catch { resolve(null); }
  });
}

ipcMain.handle('get-ip-location', async () => {
  const providers = [
    ['https://ipapi.co/json/', (j) => ({ city: j.city, region: j.region, country: j.country_name || j.country, latitude: j.latitude, longitude: j.longitude, ip: j.ip })],
    ['https://ipwho.is/', (j) => (j && j.success !== false ? { city: j.city, region: j.region, country: j.country, latitude: j.latitude, longitude: j.longitude, ip: j.ip } : null)],
    ['https://get.geojs.io/v1/ip/geo.json', (j) => ({ city: j.city, region: j.region, country: j.country, latitude: Number(j.latitude), longitude: Number(j.longitude), ip: j.ip })],
    ['https://ipinfo.io/json', (j) => {
      const [la, lo] = String(j.loc || '').split(',');
      return { city: j.city, region: j.region, country: j.country, latitude: Number(la), longitude: Number(lo), ip: j.ip };
    }],
  ];
  for (const [url, map] of providers) {
    const j = await fetchJson(url);
    if (!j) continue;
    try {
      const out = map(j);
      if (out && (out.city || out.country)) return { success: true, ...out };
    } catch {}
  }
  return { success: false };
});

// ============================================================
// DIRECT RAW (ESC/POS) PRINTING — v1.1.2
// POS -> raw bytes -> Windows spooler (RAW datatype) -> printer -> cut.
// No HTML, no hidden window, no page layout: the printer receives exactly
// the bytes we build, which is why it starts instantly and never emits a
// half slip. Implemented with a tiny winspool.drv P/Invoke through
// PowerShell so no native module has to be compiled/shipped.
// ============================================================
const RAW_PS = `
$ErrorActionPreference = "Stop"
$src = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class DtRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static void SendBytes(string printer, byte[] bytes) {
    IntPtr h; int written = 0;
    if (!OpenPrinter(printer.Normalize(), out h, IntPtr.Zero))
      throw new Exception("OpenPrinter failed for '" + printer + "' (" + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = "DT POS Receipt"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter failed (" + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed (" + Marshal.GetLastWin32Error() + ")");
        IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
        try {
          Marshal.Copy(bytes, 0, p, bytes.Length);
          if (!WritePrinter(h, p, bytes.Length, out written))
            throw new Exception("WritePrinter failed (" + Marshal.GetLastWin32Error() + ")");
        } finally { Marshal.FreeCoTaskMem(p); }
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
Add-Type -TypeDefinition $src -Language CSharp
[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()
while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  try {
    $req = $line | ConvertFrom-Json
    $printer = [string]$req.printerName
    if ([string]::IsNullOrWhiteSpace($printer)) {
      $d = Get-CimInstance -Class Win32_Printer -Filter "Default=True" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($d) { $printer = $d.Name }
    }
    if ([string]::IsNullOrWhiteSpace($printer)) { throw "No printer" }
    $bytes = [Convert]::FromBase64String([string]$req.data)
    $copies = [Math]::Max(1, [int]$req.copies)
    for ($i = 0; $i -lt $copies; $i++) { [DtRawPrinter]::SendBytes($printer, $bytes) }
    [Console]::Out.WriteLine("OK:" + [string]$req.id)
  } catch {
    $msg = ([string]$_.Exception.Message) -replace "[\r\n]+", " "
    [Console]::Out.WriteLine("ERR:" + [string]$req.id + ":" + $msg)
  }
  [Console]::Out.Flush()
}
`;

let rawScriptPath = null;
function ensureRawScript() {
  if (rawScriptPath && fs.existsSync(rawScriptPath)) return rawScriptPath;
  // Version the helper path so an older app's one-shot script cannot be reused
  // after an update (that stale script waited for command-line arguments).
  const p = path.join(os.tmpdir(), 'dtpos-rawprint-worker-v2.ps1');
  fs.writeFileSync(p, RAW_PS, 'utf8');
  rawScriptPath = p;
  return p;
}

// Keep one PowerShell/Winspool bridge alive for the full POS session. The old
// implementation launched PowerShell and compiled the C# bridge for EVERY
// receipt, which alone could cost 2–5 seconds. The warm worker compiles once at
// startup; each later click only writes one JSON line and reaches Winspool.
let rawWorker = null;
let rawWorkerReady = null;
let rawWorkerBuffer = '';
let rawPending = null;

function stopRawWorker() {
  try { rawWorker?.kill(); } catch {}
  rawWorker = null;
  rawWorkerReady = null;
  rawWorkerBuffer = '';
  if (rawPending) {
    rawPending.resolve({ success: false, error: 'Direct print worker stopped' });
    rawPending = null;
  }
}

function getRawWorker() {
  if (process.platform !== 'win32') return Promise.reject(new Error('Windows only'));
  if (rawWorker && rawWorkerReady) return rawWorkerReady;
  const { spawn } = require('child_process');
  const script = ensureRawScript();
  rawWorker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  rawWorkerReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Direct print worker startup timed out')), 8000);
    const onData = (chunk) => {
      rawWorkerBuffer += String(chunk || '');
      const lines = rawWorkerBuffer.split(/\r?\n/);
      rawWorkerBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim() === 'READY') {
          clearTimeout(timer);
          resolve(rawWorker);
          continue;
        }
        if (!rawPending) continue;
        if (line.startsWith(`OK:${rawPending.id}`)) {
          const pending = rawPending;
          rawPending = null;
          pending.resolve({ success: true });
        } else if (line.startsWith(`ERR:${rawPending.id}:`)) {
          const pending = rawPending;
          rawPending = null;
          pending.resolve({ success: false, error: line.slice(`ERR:${pending.id}:`.length) || 'raw print failed' });
        }
      }
    };
    rawWorker.stdout.on('data', onData);
    rawWorker.once('error', (e) => { clearTimeout(timer); reject(e); stopRawWorker(); });
    rawWorker.once('exit', () => { clearTimeout(timer); stopRawWorker(); });
  });
  return rawWorkerReady;
}

/** How long one RAW job may take before the printer is declared stalled. */
const RAW_PRINT_TIMEOUT_MS = 5000;

let rawPrintChain = Promise.resolve();
function sendRawWithWarmWorker(printerName, buffer, copies) {
  const task = () => getRawWorker().then(worker => new Promise((resolve) => {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    // A stalled printer must never hold the cashier. Five seconds is well
    // past a healthy USB thermal job (which answers in well under one) and
    // short enough that an unplugged printer surfaces an error while the POS
    // stays responsive. The caller falls back to the driver path on timeout.
    const timer = setTimeout(() => {
      if (rawPending?.id === id) rawPending = null;
      resolve({ success: false, error: 'Direct print timed out' });
      stopRawWorker();
    }, RAW_PRINT_TIMEOUT_MS);
    rawPending = {
      id,
      resolve: (result) => { clearTimeout(timer); resolve(result); },
    };
    worker.stdin.write(JSON.stringify({ id, printerName, copies, data: buffer.toString('base64') }) + '\n');
  }));
  const run = rawPrintChain.then(task, task);
  rawPrintChain = run.then(() => undefined, () => undefined);
  return run;
}

app.whenReady().then(() => {
  if (process.platform === 'win32') setTimeout(() => { getRawWorker().catch(() => {}); }, 300);
});
app.on('before-quit', stopRawWorker);

// Windows OneCore voices (Hindi and other language packs Chromium cannot list).
require('./windowsSpeech.cjs').registerSpeechIpc(ipcMain, app);

/** List of installed printer names (used to resolve/verify a target). */
ipcMain.handle('print-raw', async (_event, options = {}) => {
  const started = Date.now();
  try {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Direct printing is available on Windows only' };
    }
    const data = options.data;
    const buffer = Array.isArray(data)
      ? Buffer.from(data)
      : (typeof data === 'string' ? Buffer.from(data, 'base64') : null);
    if (!buffer || buffer.length < 8) return { success: false, error: 'No data' };

    const copies = Math.max(1, Number(options.copies) || 1);
    const requested = String(options.printerName || '').trim();

    // ===== SHARED NAME MATCHING =====
    // winspool's OpenPrinter wants the exact Windows device name. Handing it
    // the stored setting verbatim meant a printer installed as
    // "BIXOLON SRP-352plusIII (Copy 1)", or one carrying a non-breaking
    // space, failed to open on the raw path while the very same printer
    // printed fine through the driver. Same matcher as runPrintJob.
    let printerName = requested;
    let matchStage = 'none';
    if (requested) {
      const hit = matchPrinterName(requested, await listSystemPrinters());
      printerName = hit.name || requested;
      matchStage = hit.stage;
    }

    const result = await sendRawWithWarmWorker(printerName, buffer, copies);
    if (!result.success) {
      try {
        appendLog('WARN', 'DT-Print raw failed',
          `requested="${requested}" resolved="${printerName}" match=${matchStage} error=${result.error || 'unknown'}`);
      } catch {}
    }
    return { ...result, matchStage, printerName, durationMs: Date.now() - started };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
});
