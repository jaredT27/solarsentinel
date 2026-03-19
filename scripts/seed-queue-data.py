#!/usr/bin/env python3
"""
One-time script to seed Supabase queue_projects table from JSON snapshots.
Usage:
  pip install supabase
  export SUPABASE_SERVICE_KEY='eyJ...'
  python3 scripts/seed-queue-data.py
"""

import json
import math
import sys
from pathlib import Path

from supabase import create_client


def clean_value(v):
    """Replace NaN/Inf with None for JSON compliance."""
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, dict):
        return {k: clean_value(val) for k, val in v.items()}
    if isinstance(v, list):
        return [clean_value(val) for val in v]
    return v

DATA_DIR = Path(__file__).parent.parent / "data"
ISOS = ["ERCOT", "MISO", "CAISO", "NYISO", "ISONE"]

# Supabase credentials
import os
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://epgrufblflvkmomhkzav.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_SERVICE_KEY environment variable")
    print("  export SUPABASE_SERVICE_KEY='eyJ...'")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

total_inserted = 0

for iso in ISOS:
    snapshot_path = DATA_DIR / f"snapshot_{iso}.json"
    if not snapshot_path.exists():
        print(f"  Skipping {iso} (no snapshot file)")
        continue

    with open(snapshot_path) as f:
        data = json.load(f)

    if not data:
        print(f"  Skipping {iso} (empty)")
        continue

    # Build rows
    rows = []
    for qid, proj in data.items():
        # Clean all values — replace NaN/Inf with None
        proj_clean = clean_value(proj)

        cap = proj_clean.get("Capacity (MW)") or proj_clean.get("capacity_mw") or 0
        try:
            cap = float(cap)
        except (ValueError, TypeError):
            cap = 0

        def safe_str(v):
            if v is None:
                return None
            s = str(v)
            if s.lower() in ("nan", "none", "nat", ""):
                return None
            return s

        rows.append({
            "id": f"{iso}-{qid}",
            "iso": iso,
            "queue_id": qid,
            "project_name": safe_str(proj_clean.get("Project Name") or proj_clean.get("project_name")) or "Unknown",
            "capacity_mw": cap,
            "state": safe_str(proj_clean.get("State") or proj_clean.get("state")) or "",
            "county": safe_str(proj_clean.get("County") or proj_clean.get("county")) or "",
            "gen_type": safe_str(proj_clean.get("Generation Type") or proj_clean.get("gen_type")) or "",
            "status": safe_str(proj_clean.get("Status") or proj_clean.get("status")) or "",
            "queue_date": safe_str(proj_clean.get("Queue Date") or proj_clean.get("queue_date")),
            "proposed_cod": safe_str(proj_clean.get("Proposed Completion Date") or proj_clean.get("proposed_cod")),
            "raw_data": proj_clean,
        })

    # Upsert in batches of 500
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        result = sb.table("queue_projects").upsert(batch, on_conflict="id").execute()
        print(f"  {iso}: inserted batch {i//batch_size + 1} ({len(batch)} rows)")

    total_inserted += len(rows)
    print(f"  {iso}: {len(rows)} projects loaded")

print(f"\nDone! {total_inserted} total projects seeded into queue_projects.")
