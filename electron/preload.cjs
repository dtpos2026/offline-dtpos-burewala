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
  pingHost: (options) => ipcRenderer.invoke('ping-host', options),
  spoolerStatus: () => ipcRenderer.invoke('printer-spooler-status'),
  restartSpooler: () => ipcRenderer.invoke('printer-restart-spooler'),
  clearPrintQueue: () => ipcRenderer.invoke('printer-clear-queue'),

  // File dialogs
  showSaveDialog: (defaultName) => ipcRenderer.invoke('show-save-dialog', defaultName),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),

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
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  getDataPaths: () => ipcRenderer.invoke('get-data-paths'),
  openDataFolder: (which) => ipcRenderer.invoke('open-data-folder', which),

  // Auto-start on Windows boot
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),

  // Auto-update
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  downloadAndRunInstaller: (url) => ipcRenderer.invoke('download-and-run-installer', url),
  onUpdateProgress: (cb) => {
    const listener = (_e, pct) => { try { cb(pct); } catch {} };
    ipcRenderer.on('update-progress', listener);
    return () => ipcRenderer.removeListener('update-progress', listener);
  },
});
