"""Adds bookmarks (chapters and sections) and document information to the PDF.

    python3 docs/user-guide/tools/finish-pdf.py

Reads build/guide-body.pdf (from render-pdf.mjs) and source/toc.json (from
build-guide.mjs); writes DT-POS-Enterprise-User-Guide-v<version>.pdf beside
the source folder. Needs the pypdf package.
"""
import json
import pathlib
import re

from pypdf import PdfReader, PdfWriter

ROOT = pathlib.Path(__file__).resolve().parent.parent
meta_src = (ROOT / "source" / "content" / "meta.mjs").read_text(encoding="utf-8")
version = re.search(r"const version = '([^']+)'", meta_src).group(1)
toc = json.loads((ROOT / "source" / "toc.json").read_text(encoding="utf-8"))

reader = PdfReader(str(ROOT / "build" / "guide-body.pdf"))
writer = PdfWriter()
writer.append(reader)

writer.add_outline_item("Cover", 0)
writer.add_outline_item("Contents", 1)
parent = None
for entry in toc:
    page_index = entry["page"] - 1
    label = f"{entry['num']}  {entry['title']}" if entry.get("num") else entry["title"]
    if entry["level"] == 1:
        parent = writer.add_outline_item(f"{entry['num']}. {entry['title']}", page_index)
    else:
        writer.add_outline_item(label, page_index, parent=parent)
writer.add_outline_item("Contact Digital Target", len(reader.pages) - 1)

writer.add_metadata({
    "/Title": f"DT POS Enterprise v{version} — User Guide & Feature Overview",
    "/Author": "Digital Target",
    "/Subject": "User guide and feature presentation for DT POS Enterprise (Offline Edition)",
    "/Keywords": "DT POS, Digital Target, POS, restaurant, user guide",
    "/Creator": "Digital Target documentation tools",
})
writer.page_mode = "/UseOutlines"

out = ROOT / f"DT-POS-Enterprise-User-Guide-v{version}.pdf"
with open(out, "wb") as fh:
    writer.write(fh)
print(f"{out.name}: {len(reader.pages)} pages, {len(toc)} bookmarks")
