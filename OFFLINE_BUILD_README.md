# DT POS — OFFLINE BUILD (v1.0.40)

## What this build is
- **100% offline.** No Firebase, no Firestore, no cloud SDK, no telemetry.
  There is not a single cloud package in `package.json` and the produced
  bundle contains no cloud client code.
- All data lives in **AppData**:
  - Portable mode: `<EXE-folder>/DT-POS-Data/dtpos-data.json`
  - Installed: `%APPDATA%/DT-POS-RESTAURANT-SYSTEM/dtpos-data.json`
- Default login: **username `admin` / password `admin12`**
  (the admin then creates the other users, branches and menu).
- Licensing is offline too — see `LICENSE_SETUP.md`.
- WhatsApp (scan-based), the online-order portal and map tiles still need the
  internet **when the shop chooses to use them**; billing never does.

## Build the Windows installer
```bash
npm install
npm run dist
```
Output: `dist-installer/DT-POS-Enterprise-Setup-v1.0.40.exe`

## The "no cloud" layer
`src/lib/offlineNoCloud.ts` exposes an inert, document-store-shaped API. A lot
of legacy code was written against a cloud database; rather than rewrite those
call sites (and risk changing working billing logic), each one now resolves to
a no-op: every write is discarded, every read returns an empty snapshot, and
`isCloudConfigured()` is permanently `false`, so the cloud branches are
unreachable. Nothing in that module talks to a network.
