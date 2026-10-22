# DT POS Enterprise — User Guide & Feature Overview

Client-ready documentation of the software, under Digital Target branding.

| What | Where |
| --- | --- |
| **The guide (PDF)** | `DT-POS-Enterprise-User-Guide-v<version>.pdf` |
| Screenshots (PNG, one per screen) + `manifest.json` | `screenshots/` |
| Page text — editable | `source/content/part-1.mjs … part-5.mjs`, `meta.mjs` (cover, contacts), `modules.mjs` (module list) |
| Page design (brand colours, layouts) | `source/guide.css` |
| Generated page file (opens in any browser) | `source/guide.html` |
| Brand images (Digital Target mark) | `brand/` |
| Fonts used (Inter, JetBrains Mono — open licences) | `source/fonts/` |
| Tools that build everything | `tools/` |

Every picture is taken from the running software with a fictional "Sample Restaurant"
(`tools/demo-data.mjs`) — nothing is mocked up.

## Change the wording

1. Edit the text in `source/content/*.mjs` (plain text and simple HTML; each page is one block).
2. Rebuild (below). Page numbers, the contents pages, the module list and the PDF bookmarks update by themselves.

## Rebuild the PDF

From the repository root, once (`npm ci` installs everything; Chromium and `pypdf` are also needed):

```bash
node docs/user-guide/tools/build-guide.mjs      # content → source/guide.html (+ contents)
node docs/user-guide/tools/check-refs.mjs       # every "(4.7)" style reference points at a real section
node docs/user-guide/tools/render-pdf.mjs       # HTML → PDF; stops if any page's content would be cut off
python3 docs/user-guide/tools/finish-pdf.py     # bookmarks + document information
```

## Retake the screenshots (after the software changes)

```bash
npx vite --config docs/user-guide/tools/vite.docs.config.mjs --port 5201 &                    # the app, no licence screen
DOCS_REAL_GATE=1 npx vite --config docs/user-guide/tools/vite.docs.config.mjs --port 5202 &   # the real activation screen
node docs/user-guide/tools/capture.mjs                  # all pictures
node docs/user-guide/tools/capture.mjs pos- tables-     # only ids starting with these
```

`capture.mjs` removes food emoji and the location box from the pictures on purpose, and the sample
menu uses letters instead of food icons — the guide shows no food pictures and no location pop-ups.
Environment variables `PLAYWRIGHT_CORE`, `CHROME_PATH`, `DOCS_APP_URL`, `DOCS_GATE_URL` and `DOCS_DSF`
(picture sharpness, default 1.5) override the defaults.

## What the guide does not cover

Digital Target's own administration console (licences, devices, support inbox) is a separate product and
is not described. Features that need the online edition are listed, with their real status, in chapter 20.
