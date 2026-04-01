"""
Convert all .xlsx under Raw_Materials_for_articles to UTF-8 CSV
(one file per sheet) under usable_material_for_articls.

Run: python scripts/xlsx_to_csv_batch.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Raw_Materials_for_articles"
DEST = ROOT / "usable_material_for_articls"


def safe_file_part(s: str) -> str:
    s = re.sub(r'[<>:"/\\|?*\n\r]', "_", s.strip())
    s = re.sub(r"_+", "_", s)
    return s or "Sheet"


def safe_workbook_stem(name: str) -> str:
    base = Path(name).stem
    base = re.sub(r'[<>:"/\\|?*]', "_", base)
    return base.strip() or "workbook"


def main() -> None:
    if not SOURCE.is_dir():
        print(f"Source not found: {SOURCE}", file=sys.stderr)
        sys.exit(1)

    DEST.mkdir(parents=True, exist_ok=True)
    files = sorted(SOURCE.glob("*.xlsx"))
    if not files:
        print("No .xlsx files found.")
        return

    total = 0
    for xlsx in files:
        stem = safe_workbook_stem(xlsx.name)
        try:
            xl = pd.ExcelFile(xlsx, engine="openpyxl")
        except Exception as e:  # noqa: BLE001
            print(f"SKIP {xlsx.name}: {e}", file=sys.stderr)
            continue

        for sheet_name in xl.sheet_names:
            try:
                # 1行目を列見出しとして扱う（一般的な表形式向け）
                df = pd.read_excel(xl, sheet_name=sheet_name, header=0)
            except Exception as e:  # noqa: BLE001
                print(f"SKIP {xlsx.name} [{sheet_name}]: {e}", file=sys.stderr)
                continue
            if df.empty and len(df.columns) == 0:
                continue
            part = safe_file_part(str(sheet_name))
            out_name = f"{stem}.csv" if len(xl.sheet_names) == 1 else f"{stem}__{part}.csv"
            out_path = DEST / out_name
            df.to_csv(out_path, index=False, encoding="utf-8-sig")
            total += 1
            print(f"OK {xlsx.name} [{sheet_name}] -> {out_path.name}")

    print(f"\nWrote {total} CSV file(s) to {DEST}")


if __name__ == "__main__":
    main()
