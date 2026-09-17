# DT POS Enterprise — Build & Release Guide

Version: **1.0.40**

---

## 1. Prerequisites

- Node.js **20.x** LTS, npm 10+
- Git
- Windows machine (for the `.exe` installer)

No cloud CLI is needed — v1.0.40 is a fully offline product.

---

## 2. Install dependencies

```bash
npm install
```

If you hit a rollup native binary error on Windows:

```bash
npm run fix:win
```

---

## 3. Local dev

```bash
npm run dev          # web preview
npm run build        # production bundle
npm run electron     # desktop shell (run after npm run build)
```

---

## 4. Checks before you ship

```bash
npm run lint
npm test             # vitest
npm run build
```

---

## 5. Windows desktop installer

```bash
npm run dist
```

Output: `dist-installer/DT-POS-Enterprise-Setup-v1.0.40.exe`

Installer/app icon: `electron/icon.ico` (Digital Target mark).

For an unpacked test build (faster, no installer):

```bash
npm run dist:dir
```

---

## 6. Super Admin panel (internal)

```bash
npm run superadmin           # http://localhost:5180
npm run build:superadmin     # static build into superadmin/dist
```

Issue licences, keep the client registry, and see every activated machine on
the device map. See `LICENSE_SETUP.md` and `superadmin/README.md`.

---

## 7. Release checklist

- [ ] `src/lib/version.ts` APP_VERSION = `1.0.40`
- [ ] `package.json` version = `1.0.40`
- [ ] `npm test` passes
- [ ] `npm run build` passes with no errors
- [ ] `npm run dist` produces the installer
- [ ] Installer runs on a clean Windows machine with **no network adapter**
- [ ] Billing, silent print, printer-offline fallback and the scale all verified
- [ ] Tested on one pilot restaurant before mass rollout
