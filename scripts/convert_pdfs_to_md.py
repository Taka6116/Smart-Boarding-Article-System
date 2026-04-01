"""
Batch-convert PDFs under Raw_Materials_for_articles to Markdown files
under usable_material_for_articls (text extraction via PyMuPDF).

Run from repo root: python scripts/convert_pdfs_to_md.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Install: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Raw_Materials_for_articles"
DEST = ROOT / "usable_material_for_articls"


def safe_stem(name: str) -> str:
    base = Path(name).stem
    base = re.sub(r'[<>:"/\\|?*]', "_", base)
    base = base.strip() or "document"
    return base


def pdf_to_markdown(pdf_path: Path) -> str:
    doc = fitz.open(pdf_path)
    lines: list[str] = []
    title = safe_stem(pdf_path.name)
    lines.append(f"# {title}\n")
    lines.append(f"\n> 元ファイル: `{pdf_path.name}`\n\n---\n\n")

    for i, page in enumerate(doc, start=1):
        text = page.get_text("text")
        if text and text.strip():
            lines.append(f"## ページ {i}\n\n")
            lines.append(text.strip())
            lines.append("\n\n")

    doc.close()
    return "".join(lines).rstrip() + "\n"


def log(msg: str) -> None:
    """Console may be cp932 on Windows; avoid UnicodeEncodeError."""
    try:
        sys.stdout.write(msg + "\n")
    except UnicodeEncodeError:
        sys.stdout.write(msg.encode("ascii", "replace").decode("ascii") + "\n")


def main() -> None:
    if not SOURCE.is_dir():
        print(f"Source not found: {SOURCE}", file=sys.stderr)
        sys.exit(1)

    DEST.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(SOURCE.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs in {SOURCE}", file=sys.stderr)
        sys.exit(0)

    ok, empty, err = 0, 0, 0
    for pdf in pdfs:
        out = DEST / f"{safe_stem(pdf.name)}.md"
        try:
            md = pdf_to_markdown(pdf)
            out.write_text(md, encoding="utf-8")
            # Heuristic: no "## ページ" blocks means likely scan-only PDF
            if "## ページ" not in md:
                empty += 1
                log(f"[empty?] -> {out.name}")
            else:
                ok += 1
                log(f"OK -> {out.name}")
        except Exception as e:  # noqa: BLE001
            err += 1
            log(f"ERR {out.name}: {e}")

    log(f"\nDone: {ok} with text, {empty} empty or image-only, {err} errors")
    log(f"Output: {DEST}")


if __name__ == "__main__":
    main()
