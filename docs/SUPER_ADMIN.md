# DT POS — Super Admin panel: complete reference

> **Roman Urdu mein khulasa:** Super Admin ek alag web panel hai (folder `superadmin/`) jis se
> Digital Target apne restaurants ke licence banata hai, unke computers dekhta/rokta hai, invoice banata
> hai aur unse baat karta hai. POS khud kabhi "online" hone par majboor nahi — licence key khud apna
> saboot hoti hai (HMAC signature). Yeh file batati hai ke panel kaise bana hai, kaun si cheez kahan hai,
> aur **section 16** mein step-by-step likha hai ke isi tarah ka doosra panel kisi aur product/client ke
> liye kaise banayein (aur AI ko dene ke liye ready prompt bhi hai).

Written against **DT POS Enterprise v1.16.1**. Everything below was read from the source in this
repository; where something could not be verified (for example, behaviour against the live Firebase
project) it says so.

---

## Contents

1. [What it is](#1-what-it-is)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Tech stack and dependencies](#3-tech-stack-and-dependencies)
4. [Repository map](#4-repository-map)
5. [Run, build, deploy, first-time Firebase setup](#5-run-build-deploy-first-time-firebase-setup)
6. [How the app is wired (`App.tsx`)](#6-how-the-app-is-wired-apptsx)
7. [Data model and Firestore](#7-data-model-and-firestore)
8. [The licence system](#8-the-licence-system)
9. [The POS ↔ cloud contract](#9-the-pos--cloud-contract)
10. [Every screen](#10-every-screen)
11. [Offline Billing / ERP](#11-offline-billing--erp)
12. [Design system and UI building blocks](#12-design-system-and-ui-building-blocks)
13. [Security model and honest limits](#13-security-model-and-honest-limits)
14. [Tests](#14-tests)
15. [Known gotchas and housekeeping](#15-known-gotchas-and-housekeeping)
16. [Blueprint: build a similar panel for another product](#16-blueprint-build-a-similar-panel-for-another-product)
17. [Appendix A — Firestore rules (verbatim)](#appendix-a--firestore-rules-verbatim)
18. [Appendix B — Field dictionary](#appendix-b--field-dictionary)

---

## 1. What it is

The Super Admin is Digital Target's **internal console** for the DT POS product. It is **not** part of
the Windows POS app; it is a separate static web app that staff open in a browser.

| Job | Where in the panel |
| --- | --- |
| Issue signed licence keys (plan, expiry, number of computers) | Issue License |
| Keep a registry of every client, renew/extend, re-issue keys | Clients |
| Suspend / revoke / set "pending payment" for a whole licence | Clients → row menu |
| See every installation reporting to the cloud; activate, suspend, revoke or delete one computer | Devices |
| Register a shop's activation code; see where machines run | Device Map |
| Bill the clients: invoices (A4 + 80 mm), QR that customers can verify | Offline Billing |
| Two-way notes with shops | Support |
| Check a key a customer reads out over the phone | Verify Key |

Design principle that shapes everything: **the POS must keep working with no internet.** A licence key
carries its own plan, expiry and device count and is authenticated with an HMAC signature, so a shop
can activate on a computer that has never been online. The cloud is an *extra* layer (live status,
device monitoring, support, billing), never a precondition for billing in the shop.

What the panel **cannot** do: reach into a shop computer that is offline. For such a computer the only
control is the expiry date inside its key (see [13](#13-security-model-and-honest-limits)).

---

## 2. Architecture at a glance

```
                     ┌────────────────────────────────────────────────┐
  Digital Target     │  Super Admin (static web app, superadmin/)     │
  staff browser ───▶ │  React + Firebase SDK (Auth + Firestore)       │
                     └──────────────┬─────────────────────────────────┘
                                    │ signed-in staff (email/password)
                                    ▼
                     ┌────────────────────────────────────────────────┐
                     │ Firebase project  (Auth · Firestore · Hosting) │
                     │  clients, licenseStatus, deviceStatus,         │
                     │  licenseDevices, devices, supportMessages,     │
                     │  offlineInvoices, offlineBilling, invoiceVerify│
                     └──────────────▲─────────────────────────────────┘
                                    │ plain Firestore REST + public web key
                                    │ (no Firebase SDK in the POS bundle)
                     ┌──────────────┴─────────────────────────────────┐
  Shop computers ──▶ │  DT POS (Electron, offline-first)              │
                     │  local vault · licence gate · cloudLink.ts     │
                     └────────────────────────────────────────────────┘

  Two channels, deliberately separate:

  OFFLINE channel  (works with no internet)
    Super Admin ──licence key DTPOS-XXXX-XXXX-XXXX-XXXX──▶ shop   (WhatsApp / phone)
    shop ──activation code DTR1.<payload>.<sig>──────────▶ Super Admin (WhatsApp / phone)

  CLOUD channel    (best effort, only when the shop PC is online)
    POS ──heartbeat every 5 min──▶ devices/{deviceId}
    POS ◀──status check every 60 s── licenseStatus/{key}, deviceStatus/{deviceId}
    POS ──append own ID──▶ licenseDevices/{key}   (device slots)
```

Public pages served from the same hosting:

* `…/scan.html` — what a **receipt QR** opens on a customer's phone (bill is in the URL fragment, never
  sent to a server).
* `…/?verify=<code>` — what an **invoice QR** opens: the public invoice verification page.

---

## 3. Tech stack and dependencies

| Area | Choice |
| --- | --- |
| UI | React 18, TypeScript (`strict: false`), Vite 5 |
| Styling | Inline styles fed by CSS variables (`theme.ts` → `var(--ui-*)`), a little Tailwind 3 for base, `index.css` for shared behaviour |
| Icons | `lucide-react` 0.462 |
| Cloud | `firebase` 12 (Auth email/password + Firestore); Firebase Hosting for deploy |
| Maps | `leaflet` 1.9 with OpenStreetMap tiles (**needs internet**) |
| QR | `qrcode` (see the dependency gotcha in [15](#15-known-gotchas-and-housekeeping)) |
| Fonts | `@fontsource/manrope` + `@fontsource/jetbrains-mono`, bundled so the panel looks identical offline |
| Shared with the POS | alias `@pos → ../src`: `licensing/licenseKey`, `licensing/activationReceipt`, `lib/uiStyle` (+ `uiThemes`), `styles/ui-tokens.css` |

`superadmin/vite.config.ts` sets `base: './'` (relative assets, so it can sit at any hosting path),
dev server port **5180**, and `server.fs.allow` for the parent folder (needed for the `@pos` alias).

**Why the key code is aliased, not copied:** the tool that *mints* keys and the POS that *checks* them
must never drift. One file (`src/licensing/licenseKey.ts`) is the single source of truth for both.

---

## 4. Repository map

```
superadmin/
├─ README.md                 short setup note (partly older than this document)
├─ firebase.json             hosting (dist + SPA rewrite) and Firestore rules file
├─ .firebaserc               default Firebase project id
├─ firestore.rules           ★ the authoritative rules (Appendix A)
├─ index.html                <html data-ui="modern">, title, favicon
├─ vite.config.ts · tsconfig.json · tailwind.config.js · postcss.config.js
├─ public/
│  ├─ dt-mark.png            brand mark (white on transparent)
│  └─ scan.html              public receipt page opened by receipt QR codes
└─ src/
   ├─ main.tsx               loads fonts + shared tokens; shows <Verify> if ?verify= else <App>
   ├─ App.tsx                shell, cloud sync loop, Dashboard, Issue, Clients, EditClient, Map tab, Verify Key
   ├─ CloudGate.tsx          sign-in screen + "Test cloud connection"
   ├─ Devices.tsx            live installations and per-computer control
   ├─ DeviceMap.tsx          Leaflet map component (+ escapeHtml)
   ├─ LiveDeviceMap.tsx      map fed by device heartbeats
   ├─ Support.tsx            messages to/from shops
   ├─ Billing.tsx            invoices list, editor, preview/export, invoice settings
   ├─ Verify.tsx             public invoice verification page
   ├─ ui.tsx                 shared building blocks (Modal, RowMenu, confirm/toast, …)
   ├─ theme.ts               style constants mapped to design tokens
   ├─ index.css              base, responsive rail, focus/hover behaviour
   ├─ registry.ts            Client/DeviceRecord types, status maths, backup/CSV  (no Firebase)
   ├─ deviceState.ts         DeviceDoc, online/last-seen/location wording, serverDecision (no Firebase)
   ├─ pins.ts                registry → map pins
   ├─ cloud.ts               every Firestore/Auth call for clients, devices, statuses, messages
   ├─ billingModel.ts        invoice data, numbering, totals, verify code, masking (no Firebase)
   ├─ billingCloud.ts        invoice/profile storage + public verification record
   ├─ invoiceRender.ts       pure layout → canvas painting for A4 and 80 mm
   ├─ firebase.ts            Firebase app/db/auth (config object lives here)
   └─ firestoreSafe.ts       strips `undefined` from writes

Shared with the POS (outside superadmin/):
   src/licensing/licenseKey.ts          mint + verify keys, plans
   src/licensing/activationReceipt.ts   DTR1 activation code encode/decode
   src/licensing/licenseVerdict.ts      how the POS decides from server records (pure)
   src/licensing/licenseSync.ts         POS background status check + slot claim
   src/lib/cloudLink.ts                 POS REST client: heartbeat, status fetch, slot ledger
   src/lib/cloudMessages.ts             POS side of Support messages
   src/lib/uiStyle.ts · uiThemes.ts     theme engine
   src/styles/ui-tokens.css             design tokens
```

**Pattern worth copying:** logic that can be unit-tested lives in files with **no Firebase import**
(`registry.ts`, `deviceState.ts`, `billingModel.ts`, `invoiceRender.ts`); Firebase calls are isolated in
`cloud.ts` / `billingCloud.ts`.

---

## 5. Run, build, deploy, first-time Firebase setup

### Commands (from the repository root)

| Command | What it does |
| --- | --- |
| `npm run superadmin` | Dev server at `http://localhost:5180` |
| `npm run build:superadmin` | `npm --prefix superadmin install` then a production build into `superadmin/dist` |
| `npm run build:all` | POS build, then Super Admin build |

### Deploy

```
cd superadmin
firebase login
firebase deploy            # hosting (dist) + firestore.rules
```

`firebase.json` serves `dist` with a catch-all rewrite to `/index.html`; `public/scan.html` and
`public/dt-mark.png` are copied into `dist` by Vite and served from the site root. The POS's default
receipt-QR page is `DEFAULT_SCAN_PAGE = 'https://dtpos-offline.web.app/scan.html'`
(`src/lib/receiptCodes.ts`), so scan.html **must be published** for those QR codes to open.

### First-time Firebase console setup (once per project)

1. Create the project; note the web app config.
2. **Authentication → Sign-in method → Email/Password → Enable.**
3. **Authentication → Users → Add user** for each staff member. *Every signed-in user is a full admin*
   (see [13](#13-security-model-and-honest-limits)).
4. **Firestore Database → Create database.**
5. **Firestore → Rules →** paste `superadmin/firestore.rules` → **Publish.** Until the rules are
   published, device slots return HTTP 403 on the POS side and the Devices screen cannot list ledgers.
6. Put the web config into `superadmin/src/firebase.ts` (and the project id + public key into
   `src/lib/cloudLink.ts` / `cloudMessages.ts` on the POS side).
7. Open the sign-in screen and press **Test cloud connection**: it checks the project id, that
   Email/Password is enabled (Identity Toolkit probe), that the Firestore database exists
   (REST probe: 403/401 means "exists and rules demand sign-in", which is good), and whether a staff
   session exists. It touches no document.

---

## 6. How the app is wired (`App.tsx`)

* `main.tsx` imports bundled fonts, `@pos/styles/ui-tokens.css` and `index.css`, calls
  `applyUiStyle('modern')` (the panel is always the Modern look; only the *theme* is chosen), then
  renders `<Verify code>` if the URL has `?verify=`, otherwise `<App />`.
* There is **no router**: the current tab is React state (`dashboard` by default), so a refresh returns
  to the Dashboard. Tabs: `dashboard · issue · clients · devices · map · billing · support · verify`.
* **Auth gate:** `watchAdmin` → until Firebase answers, a "Loading…" screen; no user → `<CloudGate/>`;
  signed in → the shell inside `<FeedbackProvider>` (styled confirm dialogs and toasts).
* **Registry state** is `clients: Client[]`, initialised from the localStorage mirror
  (`loadClients`) and saved back on every change.
* **Live cloud sync (the core loop):**
  * `watchClients` (Firestore `onSnapshot` on `clients`) — the **cloud wins**: each snapshot replaces
    local state and fills a `synced` ref (`Map<key, JSON string>`).
  * A second effect compares every client to `synced`. A changed client is pushed with `pushClient`;
    a key that disappeared is removed with `removeClient`.
  * If a push fails the entry is deleted from `synced`, so the **next change retries it** instead of
    silently dropping it, and a red banner "Cloud: Could not save …" appears.
* `watchMessages` feeds the unread badge on Support (`from === 'shop' && !read`).
* **Rule of hooks:** every hook in `App` runs before the early returns (`authReady`, `!admin`); keep it
  that way when adding state.
* The page header ("PageBar") shows breadcrumb, title, hint, client/device counts and an
  **Issue license** button on Dashboard and Clients.

---

## 7. Data model and Firestore

### 7.1 Client registry (`registry.ts`)

```ts
interface DeviceRecord { id: string; activatedAt: number; lat?: number; lng?: number;
                         appVersion?: string; approved?: boolean }
interface Client { key: string; business: string; owner: string; phone: string;
                   plan: LicensePlan; maxDevices: number; expiryDate: number | null;
                   issuedAt: number; suspended?: boolean; notes?: string; devices: DeviceRecord[] }
```

* `key` is the primary key. Firestore document id = `docIdFor(key)` = key with every character outside
  `[A-Za-z0-9_-]` replaced by `_`, cut to 200 characters (same function on the POS side).
* `statusOf(c)`: `suspended` flag → **suspended**; else past `expiryDate` → **expired**; else **active**.
* `daysLeft(c)`: `ceil((expiry − now)/day)`, `null` for lifetime. "Ending soon" = active and ≤ 14 days
  (Dashboard) or ≤ 30 days (Clients filter and renewals list).
* `slotUsage(c)` = `{ used: devices.length, max: max(1, maxDevices), full }`.
* `mergeDevice` adds a new machine or refreshes a returning one; `removeDevice(client, id)` frees a slot.
* `deviceFromReceipt` only includes `lat/lng/appVersion/approved` when present (Firestore rejects
  `undefined`).
* Backups: `exportBackup` (JSON `{v:1, exportedAt, clients}`), `exportCsv`, `importBackup` (merge;
  the record with the newer `issuedAt` wins).
* localStorage mirror keys: `dtpos-superadmin-registry`, `dtpos-superadmin-invoices`,
  `dtpos-superadmin-billing-profile`; theme keys `dtpos-ui-style`, `dtpos-ui-theme`, `dtpos-ui-accent`.

### 7.2 Firestore collections

| Collection / doc | Purpose | Written by | Read by |
| --- | --- | --- | --- |
| `clients/{docIdFor(key)}` | The registry (one licence per doc, plus `updatedAt`) | staff | staff |
| `licenseStatus/{docIdFor(key)}` | Licence-wide decision: `{status, message, updatedAt, by}` | staff | POS (`get` one doc); staff (list) |
| `deviceStatus/{docIdFor(deviceId)}` | Decision for **one computer**: `{deviceId, status, message, updatedAt, by}`; status `deleted` is a tombstone | staff | POS (`get`); staff (list) |
| `licenseDevices/{docIdFor(key)}` | Device-slot ledger `{devices: string[], updatedAt}` | POS may only **append exactly one** id; staff anything | POS (`get`); staff (list) |
| `devices/{docIdFor(deviceId)}` | Heartbeat from each installation (see [Appendix B](#appendix-b--field-dictionary)) | POS (own doc only, < 45 fields); staff delete | staff |
| `supportMessages/{autoId}` | Notes both ways `{clientKey, business, phone, from, text, createdAt, read, serverAt}` | staff; POS only `from=='shop'`, text < 2000 chars | everyone (see [13](#13-security-model-and-honest-limits)) |
| `offlineInvoices/{id}` | Invoices | staff | staff |
| `offlineBilling/profile` | Invoice branding/profile | staff | staff |
| `invoiceVerify/{code}` | Public record an invoice QR opens | staff | anyone with the code (`get`); staff (list) |
| `health/*` | Write/delete probe | staff | staff |
| everything else | denied | — | — |

### 7.3 Writing safely

Firestore rejects a whole write when any field is `undefined`. Therefore: every write goes through
`firestoreSafe()` (recursively removes `undefined`, keeps `null/0/false/''`, passes Firestore sentinels
through), **and** `firebase.ts` initialises Firestore with `ignoreUndefinedProperties: true` as a safety
net. `pushClient` uses `setDoc(..., {merge: true})` so a status write that touches only `suspended`
cannot wipe other fields.

---

## 8. The licence system

### 8.1 Key format (`src/licensing/licenseKey.ts`)

`DTPOS-XXXX-XXXX-XXXX-XXXX` — the four groups are 16 Base32 characters = **8 payload + 8 signature**.
Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0, 1, so keys can be read aloud).

Payload, 40 bits, big-endian:

| Field | Bits | Notes |
| --- | --- | --- |
| version | 3 | currently 1 |
| plan | 3 | index in `PLAN_CODES` = `trial, monthly, quarterly, halfyearly, yearly, lifetime` — **order is part of the wire format: only append** |
| maxDevices | 6 | 1 … 63 |
| expiryDays | 16 | days after `EPOCH_DAY` (2024-01-01 UTC); **0 = never expires** |
| serial | 12 | random, makes each key unique |

Signature = first 40 bits of `HMAC-SHA-256(LICENSE_SECRET, payload)`. Default durations
(`PLAN_DAYS`): trial 14, monthly 30, quarterly 90, halfyearly 180, yearly 365, lifetime 0.

* `mintLicenseKey({plan, maxDevices, days})` → `{key, payload}`; `verifyLicenseKey(input)` →
  `{ok, key, payload}` or `{ok:false, reason: 'format'|'legacy'|'signature'|'payload', message}`.
* Verification needs no network, so the POS can activate on a machine that has never been online.
* Old online-style keys (`DTPOS-PRO-XXXX-…`) are recognised and get a specific message.
* **Limits live inside the key.** Changing devices/plan/expiry in the panel therefore needs a
  **re-issued key** for the shop's computer to see it (Clients → Edit → "Re-issue key with these limits").

### 8.2 Activation code ("receipt") — how a machine reaches the panel without a server

After activating, the POS shows a signed string the shop sends back (WhatsApp/SMS/phone):

`DTR1.<base64url(JSON)>.<8-char signature>` — signed with the same secret (6 bytes of HMAC → 8
characters). Compact JSON keys: `k` key, `d` device (hardware id), `b` business, `o` owner, `p` phone,
`pl` plan, `t` seconds, optional `la`/`ln` (6-decimals latitude/longitude, only if the shop allowed
location), `v` app version. A tampered code is rejected on paste
("This activation code has been altered…").

### 8.3 Lifecycle

```
1 Issue License  → key minted, client added to registry (cloud-synced)
2 send key to shop (copy, or "Send on WhatsApp" which opens wa.me with a prepared message)
3 shop activates OFFLINE: POS verifies signature, binds a vault to the machine, shows activation code
4 shop sends code → Device Map → Register a device
     → signature + embedded key are verified
     → same machine already linked? just refresh it
     → free slot? link it (pin on map if the code has a location)
     → slots full? conflict panel: Approve extra computer / Move licence (unlink oldest) / Reject
5 (optional, when online) POS heartbeats → Devices tab; POS checks licenseStatus/deviceStatus
6 renew/extend → Edit → Re-issue key → send new key
```

### 8.4 Status decisions and priority

Three independent server records feed the verdict; **the strictest wins**:

| Record | Set by | Scope |
| --- | --- | --- |
| `licenseStatus/{key}` | Clients → row menu: Active · Suspended · Revoked · Pending payment | every computer on the key |
| `deviceStatus/{deviceId}` | Devices → row menu: Activate · Suspend · Revoke · Delete device | one computer |
| `licenseDevices/{key}` | the POS (append own id) / staff (remove) | slot limit |

POS priority (`licenseVerdict.ts`): `revoked › suspended › deleted › pending › device-limit › disabled › expired`.
The admin-side view (`deviceState.serverDecision`) uses the same order for the four statuses the panel
can set.

**Deleted tombstone rule:** a `deleted` device record older than that machine's latest activation is
ignored — this is what lets a removed computer be activated again by entering the key. "Clear record"
on the Devices screen deletes the tombstone so the computer may report again without re-activation
(it still needs a free slot).

**Device slots:** the ledger can only grow from the POS (rules enforce "exactly one more, nothing
removed, ≤ 50"), so a shop cannot free a slot itself; deleting a device in the panel does
(`arrayRemove`). Licences activated before slots existed (v1.12) are *grandfathered* rather than locked
out by an upgrade.

### 8.5 What the shop sees when blocked (`licenseService.blockMessage`)

| Reason | Message |
| --- | --- |
| expired | Your license has expired. Please contact the administrator to renew it. |
| suspended | Your software license has been suspended by the administrator. |
| revoked | Your software license has been revoked. |
| pending | Your license/payment is pending. Please contact the administrator. |
| deleted | This computer has been removed from the license by the administrator. Enter the license key again to register it, or contact the administrator. |
| device-limit | This license is already active on the maximum number of computers (N). Ask the administrator to remove a computer from this license, then try again. |
| clock-tamper | The system clock has been turned back. Set the correct date and try again. |

---

## 9. The POS ↔ cloud contract

This is the part another product must re-implement (see [16](#16-blueprint-build-a-similar-panel-for-another-product)).
The POS uses **plain Firestore REST** with the public web key — no Firebase SDK in the desktop bundle.

| Purpose | Request | Timing |
| --- | --- | --- |
| Licence-wide status | `GET …/documents/licenseStatus/{docIdFor(key)}?key=API_KEY` (404 = no decision = active) | 1.5 s after the POS opens, then every 60 s while it is open (`LicenseGate`), and on `online` / window focus (throttled to one check per 30 s) |
| Device status | `GET …/documents/deviceStatus/{docIdFor(deviceId)}?key=API_KEY` | same call |
| Slot claim | `GET` then `PATCH licenseDevices/{docIdFor(key)}` with a precondition (`currentDocument.updateTime` or `exists=false`); retry up to 3× on 400/409 | at activation and when the slot is unknown |
| Heartbeat | `PATCH …/documents/devices/{deviceId}?key=API_KEY` with ~40 scalar fields | first cycle 4 s after start, then every **5 min**; also when the verdict changes or the network returns |
| Support | REST on `supportMessages` (read thread, create `from:'shop'`) | on demand, cached |

Rules of behaviour (all in `cloudLink.ts` / `licenseSync.ts`):

* Every call is **timeout-capped** (8–9 s) and failure changes nothing; cloud code may never block login,
  billing or printing.
* Both status documents must answer, otherwise "half an answer" neither blocks nor unblocks anyone.
* The last verdict is stored **inside the machine-bound encrypted vault** (AES-256-GCM, key derived from
  the Windows machine identity), so it persists offline and cannot be cleared by editing browser storage.
  A separate copy in localStorage is only for the heartbeat and the status pill.
* The heartbeat pauses while the verdict is `deleted` (a removed machine stays removed until re-activated).
* Location: the operator-approved device position wins; otherwise an approximate city-level position from
  the internet connection (three providers tried in turn), refreshed at most every 6 h (forced by
  diagnostics). The panel labels network positions as approximate and never guesses a point.
* Timing constants on the panel side (`deviceState.ts`): `HEARTBEAT_MS = 5 min`,
  `ONLINE_WINDOW_MS = 12 min` (two missed reports plus margin = offline).
* **Today's sales (v1.19).** The heartbeat also carries four values worked out by `src/lib/todaySales.ts`:
  `salesDay` (business-day label), `salesToday` (paid bills of the current business day, same rule as
  the POS dashboard), `salesBills` and `salesDayEnd` (when that business day ends). No bill, item or
  customer detail is sent, and there is no extra request. The device document stays under the
  `size() < 45` rule.

---

## 10. Every screen

### Sign-in (`CloudGate.tsx`)
Split layout: dark brand panel (hidden ≤ 900 px) + form. Email/password against Firebase Auth with
friendly errors (wrong credentials, too many attempts, no internet, provider not enabled). "Test cloud
connection" runs the self-test in [5](#5-run-build-deploy-first-time-firebase-setup).

### Shell
Dark rail (8 tabs with badges: **Clients** = count, **Support** = unread), signed-in email, **Theme**
menu (13 themes, same as the POS), Sign out. Below 860 px the rail becomes a horizontal top bar.

### Dashboard
Every number is computed from the registry — nothing invented.
* Stat cards: Active · Expiring within 14 days · Expired · Suspended · Devices activated · **Online now**
  (only when the `devices` collection is readable).
* Licence health bar + legend (Active = active minus expiring, Expiring, Expired, Suspended) and
  "By plan" chips.
* Renewals — next 90 days (5 windows: ≤7, 8–14, 15–30, 31–60, 61–90 days).
* **Today's sales** (`todaySales.ts`): one row per restaurant ("Restaurant A — Today's Sales:
  Rs. 125,000"), its computers added together, plus an all-restaurants total. A figure whose business
  day has ended (`salesDayEnd` passed) reads "Not reported today", never as today's. It reads the
  same `devices` snapshot as "Online now", so it adds no subscription.
* Renewals coming up (≤ 30 days, soonest first, max 8) and Recent activations (newest 6 devices).
* "How this works" 4-step guide with shortcuts to Issue License and Device Map.

### Issue License
Plan select (changing it resets Days to the plan default), Devices (1–63), Days (1–65535, disabled for
lifetime), business, owner, phone, internal notes; live "Expires:" preview. **Generate** calls
`mintLicenseKey`, adds the client to the registry and shows the key with **Copy key** and
**Send on WhatsApp** (builds the message; Pakistani numbers: leading `0` → `92`).

### Clients
Search (business, owner, phone, key, notes), status chips with counts (All / Active / Ending within 30
days / Expired / Suspended), Export CSV / Export backup / Import backup. Table columns: Business
(avatar), Licence key (+copy), Plan, **Computers** (used of max, click to expand the list of machines,
each with **Unlink**), Expires (days left when ≤ 30), Status pill, **Edit** and a row menu:

* Licence status — *every computer on this key*: Active / Suspended / Revoked / Pending payment
  (checked item = current server value). Each change asks a **styled confirmation** that explains the
  effect, then writes `licenseStatus` and mirrors `clients.suspended` (true for suspended or revoked).
* Delete from registry (confirmation; the shop's installed POS is not affected).

**Edit licence** dialog: shop details, plan, allowed computers (+1), expiry date with quick buttons
(+30 days, +3 months, +1 year, Lifetime). If plan/devices/expiry changed it warns that the POS reads
these from the key and offers **Re-issue key with these limits** (mints a new key, keeps the device list,
shows the new key to copy). "Save changes" only updates registry details.

### Devices (`Devices.tsx`)
Watches `devices`, `deviceStatus`, `licenseStatus` and `licenseDevices` live and re-renders once a
minute so "online" ages honestly. Stats: Registered · Online now · Offline · Blocked. Table: restaurant,
device id, connection + last seen, **Server decision** (what the admin set, with scope "whole licence" /
"this computer"), **POS reports** (what the machine says it applied), slots, app version, location.
Actions per computer (each confirmed): Activate · Suspend · Revoke · **Delete device** (writes a
`deleted` tombstone, frees the slot, deletes the heartbeat row; the computer is asked for the key again).
"Removed devices" list with **Clear record**. The detail dialog shows connection, server decision,
reported state, installation, hardware, activity (logins), location and licence. Wording reminds the
admin that changes are **not instant** and never reach an offline computer.

### Device Map
* **Register a device:** paste the `DTR1…` code → verify signature → verify the embedded key → link
  (or the conflict flow in 8.3). Shops that declined location are registered without a pin.
* **Activation-code map:** Leaflet map with pins from registry devices (colour = licence status).
* **Live installations:** map from heartbeats (colour: online green / offline grey / blocked red; shaded
  circle = approximate position) and a "Location unavailable" list for machines without a position.
* Default view is Pakistan (30.1575, 71.5249, zoom 6); popups are built with `escapeHtml`.

### Offline Billing — see [11](#11-offline-billing--erp).

### Support
Send a note to one client or a general note; inbox (newest first, search), unread highlighted, **Mark
read**, **Delete** (confirmed). Shop messages (`from:'shop'`) raise the sidebar badge.

### Verify Key
Paste a key → `verifyLicenseKey` → shows ✓ plan, devices, expiry and whether it is in this registry
("issued from another machine or the log was cleared" if not). No PC access needed.

### Public pages
* `Verify.tsx` (`?verify=<code>`): no sign-in; loads `invoiceVerify/{code}` (code must match
  `^[A-Z0-9]{8,32}$`) and shows invoice number, date, restaurant, owner, **masked** licence, plan,
  valid-until, licence status, total, payment status, issuer contact. States: loading, found, missing,
  error.
* `public/scan.html`: dependency-free page; the bill (`#r=`) or shop links (`#l=`) travel in the URL
  **fragment**, which a browser never sends to any server; nothing is stored or tracked.

---

## 11. Offline Billing / ERP

Digital Target's own billing of its clients, separate from the POS's shop billing.

**Invoice** (`OfflineInvoice`): `id, invoiceNo, date, customer{restaurant, owner, address, phone,
whatsapp, licenseKey, licenseRef}, pkg, description, amount, extras[{label, amount}], discount, paid,
paymentDate, paymentMethod, notes, verifyCode, createdAt, updatedAt, by`.

* **Number:** `PREFIX-YYYY-0001` — one more than the highest number used that year for that prefix.
* **Total:** `max(0, round((amount + Σ extras − discount) × 100) / 100)`.
* **Verify code:** 16 characters from a 32-letter alphabet (80 bits of randomness) — a random
  reference, never a database id.
* **Saving** (`billingCloud.saveInvoice`): write `offlineInvoices/{id}`, then (re)publish
  `invoiceVerify/{verifyCode}` with **only** these fields: invoiceNo, date, restaurant, owner,
  licenseMasked (`DTPOS-••••-••••-••••-K7KY`), licenseStatus, plan, expiry, paid, paymentDate, total,
  currency, issuer, issuerContact, updatedAt. The licence status is computed live (key verified, server
  status read, "expired" if past expiry). Deleting an invoice deletes both documents.
  Validation: restaurant name required; invoice numbers must be unique.
* **Invoice settings** (`offlineBilling/profile`, defaults in `DEFAULT_PROFILE`): business name, tagline,
  signatory, phone, WhatsApp, email, address, website, logo and signature (uploaded images are
  down-scaled and stored as data URLs), invoice prefix, currency, verify base URL (empty = this panel's
  own address), footer note.
* **Rendering** (`invoiceRender.ts`): `layoutInvoice()` is **pure** — it returns drawing operations
  (`rect | line | text | image`) in layout units (CSS px at 96 dpi; **A4 = 794 × 1123, 80 mm = 302 wide**);
  `paintInvoice()` draws them on a canvas at any scale, so Print, PNG and JPG are fresh high-resolution
  drawings of the template, not screenshots. The 80 mm receipt grows with its content. The QR (library
  `qrcode`) encodes `verifyUrl(profile, code, fallbackBase)` = base + `?verify=<code>`.
* Billing screen: totals tiles (billed / paid / unpaid), filter all/paid/unpaid, search across customer,
  licence and invoice fields, editor (can pick a client from the registry), preview with format switch,
  invoice settings dialog.
* Local mirrors: `dtpos-superadmin-invoices`, `dtpos-superadmin-billing-profile`.

---

## 12. Design system and UI building blocks

**One token set for both apps** — `src/styles/ui-tokens.css`. The panel's `theme.ts` exports constants
that are just `var(--ui-*)` strings (`ACCENT`, `INK`, `INK_2`, `TEXT`, `MUTED`, `LINE`, `TINT`, `RAIL*`,
`STATUS.{active,expired,suspended}`, and style objects `card`, `input`, `label`, `primaryBtn`, `ghostBtn`,
`pill()`), so a token change reaches the POS and the panel together. `ACCENT_HEX` exists only for Leaflet
markers, because CSS variables do not resolve in SVG attributes.

Token families: accent (`--ui-accent`, `-fg`, `-soft`, `-text`), surfaces (`--ui-bg`, `-surface`,
`-surface-2`, `-overlay`), text (`--ui-text`, `-secondary`, `-muted`), borders, semantic colours
(`success/warning/danger/info` × `base/soft/border/text`), radii (`card/control/dialog/pill`), shadows
(`xs/sm/card/pop/focus`), type scale (`--ui-text-page/-section/-card-title/-body/-caption`), fonts
(`--ui-font`, `-display`, `-mono`), spacing (`--ui-space-*`), layout (`--ui-sidebar-w`, `--ui-page-max`),
and the dark-rail palette `--ui-sb-*`.

**Themes:** 13 (`ember` default, `tomato`, `pizza` = "Red & Yellow", `fresh`, `sunny`, `white`, `ocean`,
`coffee`, `rose`, `violet`, `teal`, `charcoal`, `navy`). Engine: `applyUiStyle`, `setTheme`, `useThemeId`
(`src/lib/uiStyle.ts`), definitions in `uiThemes.ts`. The panel's rail is always dark. Full dark mode is
**not** implemented (only the dark-sidebar themes). See `docs/UI_DESIGN_SYSTEM.md`.

**`ui.tsx` components:** `Empty`, `Section`, `Modal`/`ModalHeader` (scrim + Escape; only the **top-most**
dialog answers Escape), `FeedbackProvider` with `useConfirm()` (`{title, body?, confirmLabel?,
cancelLabel?, danger?} → Promise<boolean>`) and `useToast()` (`success|error|info`; auto-dismiss) —
they replace `confirm()`/`alert()` and fall back to the browser dialogs without a provider; `RowMenu`
(window-positioned "⋯" menu; entries `{label,onSelect,danger?,checked?,disabled?,swatch?}`, `{heading}`,
`'separator'`), `Avatar` (initials, colour from a hash), `MiniBar`, `Chips<T>` (filter with counts),
`CopyButton`, `relativeDays`.

**Responsive:** ≤ 900 px the sign-in brand panel hides; ≤ 860 px the rail becomes a top bar and page
padding shrinks. Wide tables scroll inside their card (`overflow-x:auto`; `.sa-page > div` uses
`minmax(0,1fr)`). Checked at 1440, 1024 and 800 px wide; phone widths were not specifically tested.

**Accessibility touches:** `role="alert"` for errors, `role="status"` for confirmations, `aria-current`
on the active tab, `aria-expanded` on expandable rows, labelled inputs, visible focus ring, reduced-motion
support.

---

## 13. Security model and honest limits

What protects what:

* **Only signed-in staff can read or write the registry, devices, invoices and profile** (rules).
* The **web `apiKey` is public by design**; security is the rules + sign-in, not hiding that string.
* A licence key is **unforgeable without the HMAC secret**; a wrong/invented/typo key is rejected offline.
* The vault is bound to the machine, so copying it to another computer makes it unopenable.
* The invoice QR exposes a random code and a **masked** subset of fields; nobody can list or write.
* Nothing in the panel can break the POS: the POS ignores cloud failures.

Limits you should know (and tell your clients):

1. **The HMAC secret ships inside the POS app** (offline validation requires it). It stops casual
   invention and typos; it is not proof against a determined reverse-engineer. Device binding is what
   stops reuse on other machines.
2. **An offline computer cannot be controlled.** Suspend/revoke/delete apply the next time it is online
   (about a minute). A computer that never connects is governed only by the expiry date inside its key.
3. **Every signed-in user is a full admin** — rules check only `request.auth != null`; there are no roles.
4. **`supportMessages` is world-readable** (`allow read: if true`) so the POS can read its thread without
   an account; anyone who knows the project id and public key can read all threads (business names,
   phone numbers, text). Don't put secrets in messages. Hardening idea: per-shop documents with an
   unguessable id, or a Cloud Function.
5. **Heartbeats are unauthenticated:** anyone with the public key can create a `devices/{id}` document
   whose `deviceId` equals its id (size-limited to < 45 fields). The panel treats `devices` as *reported*,
   never as authoritative.
6. `licenseStatus`, `deviceStatus`, `licenseDevices` and `invoiceVerify` allow a public `get` of a known
   id (needed by the POS / the QR) but no `list`, so ids cannot be enumerated from outside.
7. Location from the internet connection is city-level; the panel says so.
8. Map tiles (OpenStreetMap) need internet.
9. I could not test against the live Firebase project from the build environment; behaviour against it
   is covered by unit tests with mocked Firestore and by reading the rules, not by live calls.

---

## 14. Tests

Run everything with `npx vitest run` (POS + Super Admin together; 70 files / 961 tests at v1.16.1).
Type checks: `npx tsc --noEmit -p tsconfig.app.json` and `(cd superadmin && npx tsc --noEmit -p tsconfig.json)`.

| File | Pins |
| --- | --- |
| `license-key.test.ts`, `license-acceptance.test.ts` | key mint/verify, plans, tamper, offline activation |
| `activation-receipt.test.ts` | DTR1 encode/decode, tamper rejection |
| `license-verdict.test.ts`, `license-devices.test.ts` | strictest-wins verdict, tombstones, slot policy |
| `superadmin-device-state.test.ts` | online window, last-seen wording, honest location, decision order |
| `superadmin-cloud-writes.test.ts` | the `undefined` field bug reproduced with the real SDK; `firestoreSafe`; every write safe; failed save retried |
| `superadmin-register-device.test.tsx` | registering a code with and without location |
| `superadmin-billing.test.ts`, `billing-write-path.test.ts` | totals, numbering, random code, masking, A4/80 mm layouts |
| `superadmin-ui.test.tsx` | dashboard numbers come only from the registry, client filters, confirmed status changes (declining changes nothing), Escape closes the top dialog only, toast, row menu, theme menu |

Tests mock `../../superadmin/src/cloud` (watchers become no-ops, writes recorded) and the two map
components — no network is touched.

---

## 15. Known gotchas and housekeeping

* **`qrcode` is imported by `Billing.tsx` but is not listed in `superadmin/package.json`.** It builds
  today because Node resolution finds it in the repository-root `node_modules`. A standalone
  `cd superadmin && npm install && npm run build` on a clean machine without the root install would fail
  to resolve it. Fix: add `qrcode` and `@types/qrcode` to `superadmin/package.json` and refresh the lock.
  Copy them into any new panel.
* `superadmin/README.md` predates the current rules: use `firestore.rules` (Appendix A), not its snippet.
* `superadmin/package.json` still says version `1.0.40`; it is not used for anything.
* `Billing.tsx` defines its own small `Modal` next to the shared one in `ui.tsx`.
* The `ThemeMenu` code comment says "twelve themes"; there are thirteen.
* TypeScript runs with `strict: false` (same as the POS); unions don't narrow, so helper result types are
  flat objects (`{ok, message?, …}`), a convention visible in `licenseKey.ts`.
* Existing React warnings outside this panel (nested button in Tables, missing key in Reports) are
  unrelated and were left alone.

---

## 16. Blueprint: build a similar panel for another product

### 16.1 Decide your scope first

| You need | Take these modules |
| --- | --- |
| Only licence keys | `licenseKey.ts`, Issue, Clients, Verify Key, registry + cloud sync |
| + remote on/off of a customer | add `licenseStatus` + row menu |
| + see machines / block one machine | add `devices`, `deviceStatus`, `licenseDevices`, Devices, maps, heartbeat in the product |
| + invoicing | add Billing (`billingModel`, `billingCloud`, `invoiceRender`, `Verify`) |
| + customer chat | add Support |

**Licensing model choice.** This design uses *offline-signed keys* because the DT POS must work with
no internet. If your new product is always online, you can skip the HMAC/receipt machinery: keep a
`licenses/{id}` document per customer (plan, expiry, status) and let the product read it. Keep the
registry, status, devices, billing and UI parts the same.

### 16.2 Build order (each step has a check)

1. **Names.** Product name, company name, key prefix (e.g. `ACME`), receipt prefix (e.g. `ACR1`),
   collection-name prefix if you will share a Firebase project (better: a **new project** per product).
2. **Firebase.** New project → Email/Password → Firestore → Hosting → staff users → publish rules
   (Appendix A, trimmed to the modules you use). *Check:* "Test cloud connection" is all green.
3. **Scaffold.** Copy `superadmin/` into the new repository as the app root. Replace `@pos` alias with a
   real folder (or copy the four shared files into `src/shared/`). Add the missing `qrcode`
   dependencies if you keep Billing. *Check:* `npm run dev` shows the sign-in page.
4. **Licence module.** In the copy of `licenseKey.ts` change `KEY_PREFIX`, **generate a brand-new
   `LICENSE_SECRET`** (never reuse another product's), adjust `PLAN_CODES/PLAN_DAYS/PLAN_LABEL`, keep
   bit layout/alphabet. In `activationReceipt.ts` change `RECEIPT_PREFIX` and the customer fields
   (`b/o/p`) if your customer has different data. Delete `isLegacyKeyFormat` unless you have old keys.
   *Check:* port `license-key.test.ts` and `activation-receipt.test.ts` and get them green.
5. **Registry + sync loop.** Keep `registry.ts` (rename `business/owner/phone` if needed), `cloud.ts`
   (clients part), `firestoreSafe.ts`, and the `synced`-ref loop in `App.tsx` (§6). *Check:* issue a
   key on machine A, see it on machine B within a second; turn the network off while editing — the
   red banner appears and the change is retried on the next edit.
6. **Screens.** Dashboard → Issue → Clients (+ Edit/Re-issue). Re-use `ui.tsx` and `theme.ts`
   unchanged. *Check:* the `superadmin-ui` tests, adapted, are green.
7. **Product side (the other half of the contract).** In the product: verify the key offline; store it
   in a machine-bound store; produce the activation code; then the REST calls of §9 (status fetch,
   optional slot claim and heartbeat). *Check:* suspend a licence in the panel → the product blocks
   within ~60 s; set Active → it unblocks.
8. **Devices / maps (optional).** Copy `deviceState.ts`, `Devices.tsx`, the two maps, `pins.ts`.
   Change the map's default centre.
9. **Billing (optional).** Copy the four billing files + `Verify.tsx`; change `DEFAULT_PROFILE`,
   invoice prefix, currency; decide where `?verify=` is hosted (`verifyBaseUrl`).
10. **Branding.** New `public/<mark>.png`, `index.html` title, sign-in copy, theme default
    (`src/lib/uiThemes.ts`) or a new theme.
11. **Deploy.** `firebase deploy`, then run the acceptance checklist (16.6).

### 16.3 Replace list — everything that is specific to DT POS

| Where | What to change |
| --- | --- |
| `superadmin/src/firebase.ts` | whole `firebaseConfig` (new project) |
| `.firebaserc`, `firebase.json` | project id / hosting target |
| `src/licensing/licenseKey.ts` | `KEY_PREFIX`, **`LICENSE_SECRET`**, `PLAN_*`, `EPOCH_DAY` if you want a different start |
| `src/licensing/activationReceipt.ts` | `RECEIPT_PREFIX`, payload fields |
| product-side `cloudLink.ts` | `PROJECT_ID`, `API_KEY`, collection names, heartbeat fields |
| `registry.ts` / `cloud.ts` / `billingCloud.ts` | collection names, localStorage keys (`dtpos-superadmin-*`) |
| `firestore.rules` | collections actually used |
| `billingModel.ts` | `DEFAULT_PROFILE` (name, phones, e-mail, footer), invoice prefix `DT`, currency `Rs.` |
| `invoiceRender.ts` | brand colours (`BRAND`, `INK`, …), layout texts |
| `App.tsx` | "Digital Target"/"DT POS" strings, WhatsApp message and `+92` number handling, Dashboard "How this works" |
| `CloudGate.tsx`, `index.html`, `public/` | copy, title, logo |
| `DeviceMap.tsx` | default map centre `[30.1575, 71.5249]`, tile attribution |
| `src/lib/receiptCodes.ts` (POS) | `DEFAULT_SCAN_PAGE` if you keep the receipt-QR page |
| `uiThemes.ts` / `ui-tokens.css` | default theme / colours |

### 16.4 Minimal building blocks (copy-paste starting points)

**Safe Firestore writes**

```ts
// firestoreSafe.ts — no `undefined` ever reaches a write
const plain = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v));
export function firestoreSafe<T>(value: T): T {
  if (Array.isArray(value)) return value.filter(v => v !== undefined).map(firestoreSafe) as unknown as T;
  if (plain(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = firestoreSafe(v);
    return out as T;
  }
  return value;
}
export const docIdFor = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
```

**Cloud-wins registry with retry (the loop in `App.tsx`)**

```ts
const synced = useRef(new Map<string, string>());
useEffect(() => admin ? watchClients(list => {           // onSnapshot(collection(db,'clients'))
  synced.current = new Map(list.map(c => [c.key, JSON.stringify(c)]));
  setClients(list); setCloudErr(null);
}, e => setCloudErr(e.message)) : undefined, [admin]);

useEffect(() => {
  if (!admin) return;
  const seen = new Set<string>();
  for (const c of clients) {
    seen.add(c.key);
    const json = JSON.stringify(c);
    if (synced.current.get(c.key) !== json) {
      synced.current.set(c.key, json);
      pushClient(c).catch(e => {                          // setDoc(..., {merge:true})
        if (synced.current.get(c.key) === json) synced.current.delete(c.key);  // retry on next change
        setCloudErr(`Could not save ${c.key} — ${e?.message}`);
      });
    }
  }
  for (const key of [...synced.current.keys()])
    if (!seen.has(key)) { synced.current.delete(key); removeClient(key).catch(e => setCloudErr(e.message)); }
}, [clients, admin]);
```

**Product-side status check (no SDK)**

```ts
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
async function fetchStatus(col: 'licenseStatus' | 'deviceStatus', id: string) {
  const r = await fetch(`${BASE}/${col}/${encodeURIComponent(docIdFor(id))}?key=${API_KEY}`);
  if (r.status === 404) return { reachable: true, doc: null };     // no decision = active
  if (!r.ok) return { reachable: false };                          // never block on a failure
  const f = (await r.json()).fields || {};
  return { reachable: true, doc: { status: (f.status?.stringValue || 'active').toLowerCase(),
                                   message: f.message?.stringValue, updatedAt: Number(f.updatedAt?.integerValue) || undefined } };
}
// Apply a block only when BOTH documents answered, then store the verdict somewhere tamper-resistant.
```

### 16.5 Prompt you can give an AI coding assistant

```
Build a Super Admin web panel for my product "<PRODUCT>" (company "<COMPANY>") using the reference
docs/SUPER_ADMIN.md from the DT POS repository as the specification.

Scope: <licence keys | + status control | + devices & maps | + billing | + support>.
Stack: React 18 + TypeScript + Vite, Firebase Auth (email/password) + Firestore + Hosting.

Requirements:
1. New Firebase project; I will paste the web config. Use the rules in Appendix A, limited to the
   collections I use. Staff only, except the narrow public `get`s described there.
2. Licence keys: same format/bit layout as section 8.1 but KEY_PREFIX="<PREFIX>", a NEW random
   LICENSE_SECRET, plans = <list with durations>. Include mint + verify + activation-code (prefix
   "<RCPT>1") with unit tests.
3. Registry with cloud-wins sync and retry-on-failure exactly as section 6 / 16.4. Every write goes
   through firestoreSafe.
4. Screens: Dashboard (real numbers only), Issue License, Clients (filters, edit, re-issue key,
   status change with styled confirmation), <Devices, Device Map, Billing, Support as needed>, Verify Key.
5. Reuse the design tokens / ui.tsx components approach of section 12. Brand colours: <...>.
6. Product-side contract from section 9 as a small TypeScript module (REST, no Firebase SDK,
   timeout-capped, never blocks the product).
7. Tests like section 14; run tsc and vitest and show me the output before you say it is done.
Do not invent metrics, do not hard-code secrets in docs, and list anything you could not verify.
```

### 16.6 Acceptance checklist before you hand it to a client

* [ ] Sign-in works; wrong password shows a friendly error; "Test cloud connection" is all green.
* [ ] Rules published; a signed-out browser **cannot** read `clients`, `devices`, `offlineInvoices`.
* [ ] Issue a key → verify it in the product **with the network off**; a key with one character changed
      is rejected.
* [ ] Expiry works: a key minted for 1 day stops working after it passes.
* [ ] Suspend → product blocks within ~1 min online; Active → unblocks; product keeps the state offline.
* [ ] Device limit: a second computer beyond `maxDevices` is refused / needs approval; deleting a device
      frees the slot and that computer can re-activate.
* [ ] A registry edit made offline is retried and shows in the other browser once the network is back.
* [ ] No `undefined` write errors (create a client without optional fields).
* [ ] Invoice QR opens the verification page in a phone browser and shows only the masked data.
* [ ] `firebase deploy` done; `scan.html`/`?verify=` URLs are the ones printed on receipts/invoices.
* [ ] The secret (`LICENSE_SECRET`) is new, stored outside chat/tickets, and you know it ships inside
      the product.

---

## Appendix A — Firestore rules (verbatim)

Source: `superadmin/firestore.rules`.

```
rules_version = '2';

// Digital Target — Super Admin panel + POS device link rules.
// Copy-paste: Firebase Console → Firestore Database → Rules → Publish.
service cloud.firestore {
  match /databases/{database}/documents {

    // Client registry — staff only.
    match /clients/{clientId} {
      allow read, write: if request.auth != null;
    }

    // Shop ↔ Digital Target notes. The POS has no account on the shop's
    // machine, so it may read the thread and post its own note, but it can
    // never edit or delete anything Digital Target wrote.
    match /supportMessages/{messageId} {
      allow read: if true;
      allow create: if request.auth != null
        || (request.resource.data.from == 'shop'
            && request.resource.data.text is string
            && request.resource.data.text.size() < 2000);
      allow update, delete: if request.auth != null;
    }

    match /health/{docId} {
      allow read, write: if request.auth != null;
    }

    // Authoritative licence status published by Super Admin.
    // The POS reads ONE document it already knows the key for (get); only
    // signed-in staff may list the collection, so the keys cannot be
    // enumerated from outside.
    match /licenseStatus/{licenseId} {
      allow get: if true;
      allow list: if request.auth != null;
      allow write: if request.auth != null;
    }

    // Per-device status (Suspend / Revoke / Delete for one machine).
    match /deviceStatus/{deviceId} {
      allow get: if true;
      allow list: if request.auth != null;
      allow write: if request.auth != null;
    }

    // Device slots per licence (v1.12). A POS may create the list with its
    // own ID, or append exactly ONE ID keeping every existing one — it can
    // never remove a computer or free a slot. Staff may do anything.
    match /licenseDevices/{licenseId} {
      allow get: if true;
      allow list: if request.auth != null;
      allow create: if request.auth != null
        || (request.resource.data.keys().hasOnly(['devices', 'updatedAt'])
            && request.resource.data.devices is list
            && request.resource.data.devices.size() == 1);
      allow update: if request.auth != null
        || (request.resource.data.keys().hasOnly(['devices', 'updatedAt'])
            && request.resource.data.devices is list
            && request.resource.data.devices.size() == resource.data.devices.size() + 1
            && request.resource.data.devices.size() <= 50
            && request.resource.data.devices.hasAll(resource.data.devices));
      allow delete: if request.auth != null;
    }

    // Device heartbeat written by each installation. A POS may create/update
    // only its own document and can never read the fleet or delete anything.
    match /devices/{deviceId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null
        || (request.resource.data.deviceId == deviceId
            && request.resource.data.size() < 45);
      allow delete: if request.auth != null;
    }

    // Offline Billing / ERP (v1.12) — staff only.
    match /offlineInvoices/{invoiceId} {
      allow read, write: if request.auth != null;
    }
    match /offlineBilling/{docId} {
      allow read, write: if request.auth != null;
    }

    // What an invoice QR opens: one record per random reference. Anyone
    // holding the code may read that single record; nobody outside can list
    // them or write.
    match /invoiceVerify/{code} {
      allow get: if true;
      allow list, write: if request.auth != null;
    }

    // Everything else is closed.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Appendix B — Field dictionary

**Heartbeat `devices/{deviceId}`** (`DeviceDoc`, written by the POS; `undefined`, `null` and empty strings are
omitted by the POS's field encoder, numbers including `0` are sent):

| Group | Fields |
| --- | --- |
| Identity | `deviceId`, `licenseKey`, `licenseDocId`, `installationId`, `hostname` |
| Shop | `business`, `owner`, `phone` |
| Licence | `plan`, `expiryDate`, `licenseStatus` (status the POS applied), `slot` (`pending/confirmed/grandfathered/denied`), `activatedAt`, `lastActivationAt` |
| Software | `appVersion` |
| Hardware | `manufacturer`, `model`, `osName`, `osVersion` |
| Activity | `installedAt`, `firstLoginAt`, `lastLoginAt`, `loginCount`, `lastSyncAt`, `lastVerifyAt` |
| Location | `country`, `region`, `city`, `latitude`, `longitude`, `locationAccuracyM`, `locationSource` (`device` \| `network`), `locationUpdatedAt` |

**Status document** (`licenseStatus`, `deviceStatus`): `status` (`active | suspended | revoked | pending`;
device also `deleted`), `message`, `updatedAt` (ms), `by` (staff e-mail), and `deviceId` on device records.

**Support message:** `clientKey?`, `business?`, `phone?`, `from` (`admin` \| `shop`), `text`, `createdAt`
(ms), `read`, `serverAt` (server timestamp, admin-sent only).

**Server verdict seen by the POS:** `status` (`active | suspended | revoked | pending | deleted |
device-limit | expired | disabled`), `message?`, `updatedAt?`, `checkedAt`, `scope`
(`license | device | slot | none`).
