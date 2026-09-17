# Build Windows Installer — DT POS Enterprise

Yeh guide bataati hai ke Windows par DT POS Enterprise ka `.exe` installer kaise banayein.

---

## 1. Requirements (Windows machine)

- Windows 10 ya 11 (64-bit)
- Node.js 20 LTS — https://nodejs.org/
- Git (optional) — https://git-scm.com/
- ~3 GB free disk space

> Note: Installer Windows par hi banta hai (Linux/Mac se cross-build NSIS ke liye recommended nahi).

---

## 2. Setup

Project folder me terminal (PowerShell ya CMD) kholein:

```bash
npm install
```

(Pehli baar ~5–10 min lagte hain, Electron + dependencies download hote hain.)

Agar Windows par Rollup ka error aaye:

```bash
npm run fix:win
```

---

## 3. Build Frontend

```bash
npm run build
```

Output `dist/` folder me jaata hai.

---

## 4. Build Installer

```bash
npm run dist
```

Yeh internally chalata hai:
1. `vite build` (frontend)
2. `electron-builder --win` (installer)

Final output:

```
dist-installer/DT-POS-Enterprise-Setup-v1.0.1.exe
```

---

## 5. Installer Behavior

| Item | Value |
|---|---|
| App Name | DT POS Enterprise |
| Publisher | Digital Target |
| Installer File | `DT-POS-Enterprise-Setup-v1.0.1.exe` |
| Desktop Shortcut | ✅ Auto |
| Start Menu Shortcut | ✅ Auto (under "Digital Target") |
| Control Panel Uninstall | ✅ "DT POS Enterprise" |
| Install Location | User can choose (default: `%LocalAppData%\Programs\DT POS Enterprise`) |
| App Data | `%AppData%\DT POS Enterprise\` |
| Per-User Install | ✅ (no admin required) |

---

## 6. Version Bump

Single source of truth: `src/lib/version.ts`

```ts
export const APP_VERSION = '1.0.0';
```

Aur match karein:
- `package.json` → `"version": "1.0.0"`
- `electron-builder.json` → `extraMetadata.version`

Teeno same rahein. Naye release ke liye teeno me version badlein, phir `npm run dist`.

---

## 7. Commands Summary

```bash
npm install        # one-time setup
npm run build      # build frontend only
npm run dist       # build frontend + Windows installer
```

---

## 8. Troubleshooting

**"electron-builder: command not found"**
→ `npm install` dobara chalayein.

**Antivirus installer ko block kare**
→ Code signing certificate add karna padega (production release ke liye recommended). Currently unsigned installer hai.

**Build slow / hang**
→ Antivirus ko temporarily disable karein ya project folder exclude karein.

**Icon missing**
→ `electron/icon.ico` (256x256 multi-resolution) maujood hona chahiye.
