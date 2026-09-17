# DT POS Enterprise — Windows + Super Admin deploy commands

> Ye file sirf command reference hai. Project folder me CMD / PowerShell / Terminal khol kar chalayein.

---

## 1. Pehli baar setup (Windows)

Node.js 18+ installed hona chahiye: https://nodejs.org

```cmd
cd "C:\path\to\dt-pos-enterprise"
npm install
```

Agar Windows build me Rollup error aaye:

```cmd
npm run fix:win
```

---

## 2. POS software local test karna (browser me)

```cmd
npm run dev
```

Browser open hoga: http://localhost:8080

---

## 3. POS Windows EXE / installer banana

### A) Full installer (.exe setup)

```cmd
npm run dist
```

Output:

```
dist-installer\DT-POS-Enterprise-Setup-v1.0.40.exe
```

### B) Sirf portable folder (bina installer ke)

```cmd
npm run dist:dir
```

Output:

```
dist-installer\win-unpacked\
```

Is folder me `DT POS Enterprise.exe` milta hai — seedha chalao.

---

## 4. Super Admin panel local test karna

```cmd
npm run superadmin
```

Ya manually:

```cmd
cd superadmin
npm run dev
```

Usually open hoga: http://localhost:5173

---

## 5. Super Admin panel deploy karna (Firebase Hosting)

### Step A — Firebase CLI install + login (ek hi baar)

```cmd
npm install -g firebase-tools
firebase login
```

### Step B — Super Admin build karna

```cmd
npm run build:superadmin
```

Ya manually:

```cmd
cd superadmin
npm install
npm run build
```

Build output folder: `superadmin\dist`

### Step C — firebase.json banana (pehli baar)

`superadmin\firebase.json` naam se yeh file banaein:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

### Step D — Firestore rules upload karna

`superadmin\firestore.rules` file already bani hui hai. Firebase Console se ya CLI se upload karein:

```cmd
cd superadmin
firebase deploy --only firestore:rules
```

### Step E — Hosting deploy

```cmd
cd superadmin
firebase init hosting
firebase deploy --only hosting
```

Aapko live URL mil jayega, e.g.:

```
https://dtpos-offline.web.app
```

---

## 6. Dono ek saath build karna

```cmd
npm run build:all
```

Ye POS + Super Admin dono build kar dega.

---

## 7. Zaroori Firebase Console steps (Super Admin chalane ke liye)

1. https://console.firebase.google.com/project/dtpos-offline
2. Authentication → Sign-in method → Email/Password ON karein
3. Authentication → Users → apna staff user banaein (email/password)
4. Firestore Database create karein
5. Firestore rules me `superadmin/firestore.rules` ki rules daalein
6. Hosting enable karein

---

## Quick cheat sheet

| Kaam | Command |
|------|---------|
| POS local test | `npm run dev` |
| POS Windows installer | `npm run dist` |
| POS portable folder | `npm run dist:dir` |
| Super Admin local test | `npm run superadmin` |
| Super Admin build | `npm run build:superadmin` |
| Super Admin deploy | `cd superadmin && firebase deploy --only hosting` |
| Dono build | `npm run build:all` |
