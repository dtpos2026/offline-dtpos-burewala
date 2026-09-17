# DT POS — Super Admin Panel

Digital Target's internal console for **DT POS Enterprise v1.0.40+**. It
replaces the old Firebase Super Admin portal: no cloud project, no Firestore,
no server. Everything runs in the browser on your own machine.

## Run

```bash
npm run superadmin           # http://localhost:5180
npm run build:superadmin     # static build in superadmin/dist
```

The built folder opens straight from disk — copy it to a USB stick if you want
it on another machine.

## What it does

| Tab | Purpose |
| --- | --- |
| **Dashboard** | Active / expiring / expired counts, and which shops need a renewal in the next 30 days |
| **Issue License** | Mint a signed key for a plan, device count and duration; copy it or send it on WhatsApp |
| **Clients** | Every licence you issued — search, suspend, delete, export to CSV, back up and restore |
| **Device Map** | Every activated machine plotted where it was activated |
| **Verify Key** | Check a key a customer read out to you — plan, devices, expiry |

## The workflow

1. **Issue a licence.** Pick the plan; send the key to the shop with the installer.
2. **The shop activates.** No internet needed — the key proves itself.
3. **The shop's screen shows an activation code** and offers to send it on WhatsApp.
4. **Paste that code** under *Device Map → Register a device*. The client is linked
   and the machine appears on the map with its exact coordinates.

Step 3 is optional for the shop — their POS already works without it. It exists
so you know who is running your software and where.

## Where the data lives

In this browser's `localStorage`, on this machine only. That means:

- **Back it up.** *Clients → Export backup* writes a JSON file; *Import backup*
  reads it in and merges. Do this after issuing keys.
- Clearing the browser's site data wipes the registry. Keys already given to
  customers keep working — only your record of them is lost.

## What it cannot do

The POS is a genuinely offline product, so this panel **cannot reach a shop's
computer**. *Suspend* marks a client in your own records; it does not switch
their software off.

The control you do have is the **expiry date on the key you issue**. Issue
monthly or yearly keys and a shop has to come back to you to keep running.
A lifetime key is exactly that — permanent, with no way to withdraw it.

## Map tiles

The map fetches tiles from OpenStreetMap, so this panel needs internet to draw
the map. That is your machine using the internet — the POS in the shop never
does.

## Cloud (Firebase) — added

The panel now signs in with a Digital Target staff account and keeps the
client registry + support messages in Firestore (project `dtpos-offline`),
so every staff machine sees the same records. `localStorage` stays as the
offline mirror and Export/Import backup still work.

**One-time setup in the Firebase console:**

1. *Authentication → Sign-in method* → enable **Email/Password**, then add
   your staff accounts under *Users*.
2. *Firestore Database* → create the database, then paste these rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /clients/{id}          { allow read, write: if request.auth != null; }
    match /supportMessages/{id}  { allow read, write: if request.auth != null; }
  }
}
```

The POS software is untouched: it never talks to Firebase and keeps working
with no internet.
