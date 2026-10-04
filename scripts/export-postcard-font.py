#!/usr/bin/env python3
"""Export the bundled Quicksand font as a static, licensed print TTF.

Use an isolated environment with these pinned build dependencies:
    python3 -m pip install fonttools==4.66.1 brotli==1.2.0
    python3 scripts/export-postcard-font.py
    python3 scripts/export-postcard-font.py --check

The source WOFF2 and all existing fit metrics remain unchanged. The output has
a distinct internal family name because Quicksand is an OFL Reserved Font Name.
The renderer may select it through its own CSS font-family alias.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path

try:
    import fontTools
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
except ImportError as error:
    raise SystemExit(
        "Install the pinned build dependencies in an isolated environment: "
        "python3 -m pip install fonttools==4.66.1 brotli==1.2.0"
    ) from error


ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "public/brand/fonts"
SOURCE = FONT_DIR / "quicksand-latin.woff2"
OUTPUT = FONT_DIR / "quicksand-print-medium-v1.ttf"
METRICS = ROOT / "src/lib/collection/postcard-font-metrics.json"
FONTTOOLS_VERSION = "4.66.1"
PRINT_WEIGHT = 500


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def verify_advances(font: TTFont, metrics: dict) -> int:
    """Check every encoded glyph against the existing conservative fit widths."""
    if font["head"].unitsPerEm != metrics["unitsPerEm"]:
        raise ValueError("The print font and fit metrics use different units.")
    cmap = font.getBestCmap()
    if not cmap:
        raise ValueError("The print font has no Unicode character map.")
    for codepoint, glyph in sorted(cmap.items()):
        bound = metrics["widths"].get(str(codepoint))
        if bound is None:
            raise ValueError(f"U+{codepoint:04X} has no existing fit width.")
        advance = font["hmtx"].metrics[glyph][0]
        if advance > bound:
            raise ValueError(
                f"U+{codepoint:04X} ({glyph}) has advance {advance}, "
                f"exceeding its existing fit width {bound}."
            )
    return len(cmap)


def rename_print_font(font: TTFont) -> None:
    names = font["name"]
    replacements = {
        1: "Time Tapestry Print",
        2: "Medium",
        3: "1.0;TimeTapestry;TimeTapestryPrint-Medium",
        4: "Time Tapestry Print Medium",
        6: "TimeTapestryPrint-Medium",
        16: "Time Tapestry Print",
        17: "Medium",
    }
    # Preserve original copyright, author and license URL records. Include the
    # complete supplied license inside the embedded font as well as beside it.
    replacements[13] = (FONT_DIR / "OFL-Quicksand.txt").read_text(encoding="utf-8")
    for name_id, value in replacements.items():
        platforms = {
            (record.platformID, record.platEncID, record.langID)
            for record in names.names
            if record.nameID == name_id
        }
        platforms.add((3, 1, 0x409))
        names.removeNames(nameID=name_id)
        for platform_id, encoding_id, language_id in sorted(platforms):
            names.setName(value, name_id, platform_id, encoding_id, language_id)
    names.removeNames(nameID=25)  # Variable PostScript prefix is no longer used.


def export_font(metrics: dict) -> tuple[bytes, int]:
    if fontTools.__version__ != FONTTOOLS_VERSION:
        raise ValueError(
            f"Use fonttools=={FONTTOOLS_VERSION} for reproducible print bytes; "
            f"found {fontTools.__version__}."
        )
    source_bytes = SOURCE.read_bytes()
    if sha256(source_bytes) != metrics["fontSha256"]:
        raise ValueError("The source WOFF2 no longer matches its fit metrics hash.")
    source = TTFont(io.BytesIO(source_bytes), recalcTimestamp=False)
    if "fvar" not in source or {
        axis.axisTag for axis in source["fvar"].axes
    } != {"wght"}:
        raise ValueError("Expected the original single-axis Quicksand font.")
    original_cmap = source.getBestCmap()
    original_copyright = {
        (record.platformID, record.platEncID, record.langID): record.toUnicode()
        for record in source["name"].names
        if record.nameID == 0
    }
    font = instantiateVariableFont(source, {"wght": PRINT_WEIGHT}, inplace=True)
    font.flavor = None
    font.recalcTimestamp = False
    rename_print_font(font)
    verify_advances(font, metrics)
    buffer = io.BytesIO()
    font.save(buffer, reorderTables=True)
    result = buffer.getvalue()
    # Validate the serialized asset, not just the in-memory variable instance.
    exported = TTFont(io.BytesIO(result), recalcTimestamp=False)
    if exported.flavor is not None or "glyf" not in exported:
        raise ValueError("The output is not an uncompressed TrueType outline font.")
    if any(
        table in exported
        for table in ("fvar", "gvar", "HVAR", "VVAR", "MVAR", "avar", "cvar")
    ):
        raise ValueError("The print font still contains variable font tables.")
    if exported["OS/2"].usWeightClass != PRINT_WEIGHT:
        raise ValueError("The print font is not marked as weight 500.")
    if exported.getBestCmap() != original_cmap:
        raise ValueError("The static export changed the character map.")
    exported_copyright = {
        (record.platformID, record.platEncID, record.langID): record.toUnicode()
        for record in exported["name"].names
        if record.nameID == 0
    }
    if exported_copyright != original_copyright:
        raise ValueError("The static export changed the original copyright.")
    return result, verify_advances(exported, metrics)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="Verify committed output without writing."
    )
    args = parser.parse_args()
    original_metrics = json.loads(METRICS.read_text(encoding="utf-8"))
    result, checked = export_font(original_metrics)
    print_hash = sha256(result)
    if OUTPUT.exists() and OUTPUT.read_bytes() != result:
        raise ValueError(
            "The existing versioned print font differs. Create a new asset version "
            "instead of overwriting a previously generated print font."
        )
    if args.check:
        if not OUTPUT.is_file():
            raise ValueError("The versioned print font is missing. Run the export first.")
        if original_metrics.get("printFontSha256") != print_hash:
            raise ValueError("The print font hash is missing or differs from the asset.")
    else:
        updated_metrics = {**original_metrics, "printFontSha256": print_hash}
        OUTPUT.write_bytes(result)
        METRICS.write_text(
            json.dumps(updated_metrics, indent=2) + "\n", encoding="utf-8"
        )
    print(
        f"{'Verified' if args.check else 'Exported'} {OUTPUT.relative_to(ROOT)}: "
        f"{len(result)} bytes, weight {PRINT_WEIGHT}, "
        f"{checked} encoded glyph advances within existing fit widths."
    )
    print(f"printFontSha256: {print_hash}")


if __name__ == "__main__":
    main()
