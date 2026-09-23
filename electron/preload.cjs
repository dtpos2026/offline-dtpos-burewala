const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App version (read from package.json baked into the installer)
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Printing
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getPrinterDetails: () => ipcRenderer.invoke('get-printer-details'),
  listSerialPorts: () => ipcRenderer.invoke('list-serial-ports'),
  // Weighing scale: kaunsa COM port use karna hai (COM3 / COM4 …)
  setPreferredSerialPort: (portName) => ipcRenderer.invoke('set-preferred-serial-port', portName),
  getPreferredSerialPort: () => ipcRenderer.invoke('get-preferred-serial-port'),
  // License
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  licenseSave: (payload) => ipcRenderer.invoke('license-save', payload),
  licenseLoad: () => ipcRenderer.invoke('license-load'),
  licenseClear: () => ipcRenderer.invoke('license-clear'),
  printWindowsTestPage: (name) => ipcRenderer.invoke('print-windows-test-page', name),
  openPrinterProperties: (name) => ipcRenderer.invoke('open-printer-properties', name),
  // System info — hostname (DESKTOP-XXXX), MAC addresses, CPU, total RAM
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  // Device monitoring — manufacturer / model / Windows version
  getDeviceHardware: () => ipcRenderer.invoke('get-device-hardware'),
  // Approximate location (city/region/country + lat/lon) fetched by the
  // desktop app itself — no browser CORS/CSP limits.
  getIpLocation: () => ipcRenderer.invoke('get-ip-location'),
  printReceipt: (options) => ipcRenderer.invoke('print-receipt', options),
  // Fast path: slip ka HTML chhupi hui print window me print hota hai,
  // POS screen bilkul free rehti hai.
  printHtml: (options) => ipcRenderer.invoke('print-html', options),
  // Exact-template fast path: render HTML, rasterize it and send one RAW
  // ESC/POS job with a single cut command.
  printHtmlEscpos: (options) => ipcRenderer.invoke('print-html-escpos', options),
  // v1.0.39: printer compatibility diagnostics
  resetPrintStrategy: (printerName) => ipcRenderer.invoke('print-strategy-reset', printerName),
  getPrintDiagnostics: () => ipcRenderer.invoke('print-diagnostics'),
  printLanEscpos: (options) => ipcRenderer.invoke('print-lan-escpos', options),
  // DIRECT RAW printing — ESC/POS bytes straight to a USB/driver printer.
  // No HTML, no preview, no dialog: fastest and most reliable path.
  printRaw: (options) => ipcRenderer.invoke('print-raw', options),
  testLanPrinter: (options) => ipcRenderer.invoke('test-lan-printer', options),
  // Probe TCP 9100 across this machine's own /24 subnets to find network
  // thermal printers. Reports what answered; configures nothing by itself.
  scanLanPrinters: (options) => ipcRenderer.invoke('scan-lan-printers', options),

  // Kitchen Display on an external screen. The OS reports the displays it
  // has; it does not report which cable each arrived by, so the picker shows
  // real labels and resolutions rather than a guessed HDMI/VGA badge.
  listDisplays: () => ipcRenderer.invoke('list-displays'),
  openKdsWindow: (options) => ipcRenderer.invoke('open-kds-window', options),
  closeKdsWindow: () => ipcRenderer.invoke('close-kds-window'),
  isKdsWindowOpen: () => ipcRenderer.invoke('kds-window-open'),
  pingHost: (options) => ipcRenderer.invoke('ping-host', options),
  spoolerStatus: () => ipcRenderer.invoke('printer-spooler-status'),
  restartSpooler: () => ipcRenderer.invoke('printer-restart-spooler'),
  clearPrintQueue: () => ipcRenderer.invoke('printer-clear-queue'),

  // File dialogs
  showSaveDialog: (defaultName) => ipcRenderer.invoke('show-save-dialog', defaultName),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  // Native file chooser for a customer-display video. Electron does not
  // implement window.prompt(), so the old "type the path" flow silently did
  // nothing in the packaged app.
  pickMediaFile: (kind) => ipcRenderer.invoke('pick-media-file', kind),

  // A monitor was plugged in or pulled out. Notification only — nothing opens
  // or moves by itself, because a window jumping screens mid-service is the
  // disturbance this exists to prevent.
  onDisplaysChanged: (handler) => {
    const fn = (_e, payload) => { try { handler(payload); } catch {} };
    ipcRenderer.on('displays-changed', fn);
    return () => ipcRenderer.removeListener('displays-changed', fn);
  },

  // File I/O
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

  // JSON DB (file-based, atomic)
  dbRead: () => ipcRenderer.invoke('db-read'),
  dbWrite: (jsonStr) => ipcRenderer.invoke('db-write', jsonStr),
  dbBackup: (jsonStr, label) => ipcRenderer.invoke('db-backup', jsonStr, label),
  dbListBackups: () => ipcRenderer.invoke('db-list-backups'),
  dbLog: (level, event, detail) => ipcRenderer.invoke('db-log', level, event, detail),
  dbReadLog: () => ipcRenderer.invoke('db-read-log'),
  // Write a line into the app's own rolling log file, so a fault in the POS
  // leaves a trace instead of vanishing into a bare catch.
  appLog: (level, event, detail) => ipcRenderer.invoke('app-log', level, event, detail),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  getDataPaths: () => ipcRenderer.invoke('get-data-paths'),
  openDataFolder: (which) => ipcRenderer.invoke('open-data-folder', which),

  // Auto-start on Windows boot
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),

  // Windows OneCore speech voices (see electron/windowsSpeech.cjs)
  ttsVoices: (refresh) => ipcRenderer.invoke('tts-voices', !!refresh),
  ttsSpeak: (job) => ipcRenderer.invoke('tts-speak', job),
  ttsCancel: () => ipcRenderer.invoke('tts-cancel'),

  // Auto-update
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  downloadAndRunInstaller: (url) => ipcRenderer.invoke('download-and-run-installer', url),
  onUpdateProgress: (cb) => {
    const listener = (_e, pct) => { try { cb(pct); } catch {} };
    ipcRenderer.on('update-progress', listener);
    return () => ipcRenderer.removeListener('update-progress', listener);
  },
});
