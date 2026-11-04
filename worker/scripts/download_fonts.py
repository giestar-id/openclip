"""Unduh font caption (TTF) ke web/public/fonts.

Font yang sama dipakai browser (@font-face) dan FFmpeg/libass (fontsdir) supaya
tampilan preview identik dengan hasil export (PRD §14: preview vs export konsisten).

Jalankan: .venv\\Scripts\\python.exe scripts\\download_fonts.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
FONTS_DIR = ROOT / "web" / "public" / "fonts"

# (id fontsource, weight, nama keluarga yang dipakai di UI/ASS)
FONTS = [
    ("montserrat", 800, "Montserrat"),
    ("poppins", 700, "Poppins"),
    ("anton", 400, "Anton"),
    ("bebas-neue", 400, "Bebas Neue"),
    ("bangers", 400, "Bangers"),
    ("archivo-black", 400, "Archivo Black"),
    ("luckiest-guy", 400, "Luckiest Guy"),
    ("inter", 700, "Inter"),
]

URL = "https://cdn.jsdelivr.net/fontsource/fonts/{id}@latest/latin-{w}-normal.ttf"


def _normalize_names(font: TTFont, family: str) -> None:
    """Satu file = satu keluarga 'family' style Regular (ASS memakai Bold=0)."""
    ps = family.replace(" ", "") + "-Regular"
    values = {1: family, 2: "Regular", 4: f"{family} Regular", 6: ps, 16: family, 17: "Regular"}
    table = font["name"]
    for rec in list(table.names):
        if rec.nameID in (16, 17, 21, 22):
            table.removeNames(nameID=rec.nameID)
    for nid, val in values.items():
        if nid in (16, 17):
            continue
        table.setName(val, nid, 3, 1, 0x409)
        table.setName(val, nid, 1, 0, 0)
    os2 = font["OS/2"]
    os2.fsSelection = (os2.fsSelection & ~0b1100001) | 0b1000000  # REGULAR bit, hapus ITALIC/BOLD
    font["head"].macStyle = 0


def main() -> int:
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for fid, weight, family in FONTS:
        dst = FONTS_DIR / f"{fid}-{weight}.ttf"
        if not dst.exists():
            url = URL.format(id=fid, w=weight)
            print("download", url)
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            dst.write_bytes(r.content)
        f = TTFont(dst)
        if f["name"].getDebugName(1) != family or f["name"].getDebugName(2) != "Regular":
            _normalize_names(f, family)
            f.save(dst)
            f = TTFont(dst)
        name = f["name"].getDebugName(1) or family
        upem = f["head"].unitsPerEm
        os2 = f["OS/2"]
        hhea = f["hhea"]
        manifest.append(
            {
                "family": family,
                "internalFamily": name,
                "file": dst.name,
                "weight": weight,
                "unitsPerEm": upem,
                "winAscent": os2.usWinAscent,
                "winDescent": os2.usWinDescent,
                "hheaAscent": hhea.ascent,
                "hheaDescent": hhea.descent,
            }
        )
        print(f"ok  {family:14s} internal='{name}' upem={upem} win={os2.usWinAscent}+{os2.usWinDescent}")
    (FONTS_DIR / "fonts.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
