# DT POS — License System (offline, v1.0.40+)

Licensing no longer needs Firebase, an internet connection or any server.
A key carries its own plan, expiry and device allowance and is signed, so the
POS validates it locally.

## Issuing keys (Digital Target internal)

```bash
npm run superadmin            # http://localhost:5180
npm run build:superadmin      # static build in superadmin/dist
```

Pick a plan, device count and duration, press **Generate License Key**, then
copy it or send it straight to the shop on WhatsApp. Every client you issue to
is kept in a local registry you can search, export to CSV and back up.

See `superadmin/README.md` for the full console — dashboard, clients and the
device map.

## Activating a POS

1. Install and start DT POS.
2. The activation screen asks for business name, owner, mobile and the key.
3. Enter `DTPOS-XXXX-XXXX-XXXX-XXXX` and press **Activate License**.

No internet is used at any point.

### The activation code (optional, for your records)

Straight after activating, the shop sees a short **activation code** with
**Copy** and **Send on WhatsApp** buttons. When they send it to you, paste it
into *Super Admin → Device Map → Register a device*: the shop is added to your
client registry and the machine appears on the map at the exact spot it was
activated.

The code is signed, so an edited or invented one is rejected. It is entirely
optional for the shop — their POS is already fully working, and the screen
says so.

## How it holds up

| Concern | How it is handled |
| --- | --- |
| Invented keys | Each key carries a truncated HMAC-SHA-256 signature; anything unsigned is rejected. |
| Copying an activated install to another PC | The activated license is written to an AES-256-GCM vault whose key is derived from the machine's hardware ID. On a different machine it will not decrypt, and the POS falls back to the activation screen. |
| Expiry | The expiry date is encoded in the key itself, so it cannot be extended by editing local files. |
| Clock tampering | A monotonic "last seen" stamp blocks the app if the system clock is moved backwards by more than 3 hours. |

The signing secret (`LICENSE_SECRET` in `src/licensing/licenseKey.ts`) is shared
by the generator and the POS. It ships inside the application — that is inherent
to offline activation, exactly as with any other activation-code desktop
product. Changing it invalidates every previously issued key, so only change it
alongside a planned release.

## Plans

| Plan | Default duration |
| --- | --- |
| Trial | 14 days |
| Monthly | 30 days |
| Quarterly | 90 days |
| 6 Months | 180 days |
| Yearly | 365 days |
| Lifetime | never expires |

Any plan's duration can be overridden per key in the generator.

## Upgrading from a pre-1.0.40 install

Machines that are already activated keep working — their local vault is read as
before. Old **online** keys (`DTPOS-PRO-…`) cannot be validated offline, so a
*fresh* activation needs a new key; the activation screen says so explicitly
rather than showing a generic error.
