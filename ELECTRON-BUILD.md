# DT POS RESTAURANT SYSTEM — Windows Desktop Build Guide

## Prerequisites

- **Node.js** 18+ installed
- **npm** or **bun** package manager
- Windows OS (for building the installer)

## Quick Start

```bash
# 1. Install all dependencies
npm install

# 1.1 Windows Rollup fix (agar build error aaye)
npm run fix:rollup-win

# 2. Build the React frontend
npm run build

# 3. Package as Windows desktop app
npx electron-builder --win --config electron-builder.json
```

## Output

After a successful build, you'll find the installers in the `release/` folder:

| File | Description |
|------|-------------|
| `DT POS RESTAURANT SYSTEM x.x.x Setup.exe` | Full NSIS installer (recommended) |
| `DT POS RESTAURANT SYSTEM x.x.x Portable.exe` | Portable — no install needed |

## Development Mode

To test the app in Electron during development:

```bash
# Terminal 1: Start Vite dev server
npm run dev

# Terminal 2: Launch Electron (loads from localhost:8080)
npx electron electron/main.js
```

## Data Storage

- All data is stored in `localStorage` within Electron's user data directory
- Location: `%APPDATA%/DT POS RESTAURANT SYSTEM/`
- Use Backup & Restore (in-app) to export/import data as JSON files

## Thermal Printer Setup

1. Install your thermal printer's Windows driver (typically USB or network)
2. Ensure the printer appears in Windows **Devices & Printers**
3. In the app, go to **Backup & Restore** or receipt printing — it auto-detects available printers
4. The app uses silent printing (80mm paper width) by default

## Custom App Icon

Replace `electron/icon.ico` with your own 256×256 `.ico` file before building.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Blank screen on launch | Run `npm run build` first — Electron loads from `dist/` |
| `Cannot find module @rollup/rollup-win32-x64-msvc` | Run `rmdir /s /q node_modules`, `del package-lock.json`, `npm install`, then `npm run fix:rollup-win` |
| Printer not detected | Check Windows printer drivers are installed |
| Data missing after update | Data persists in `%APPDATA%` — safe across reinstalls |
| Build fails on non-Windows | Use a Windows machine or CI with Windows runner |
