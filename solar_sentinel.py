#!/usr/bin/env python3
"""
Solar Sentinel MVP — Interconnection Queue Monitor & Telegram Alerter

Monitors US utility-scale solar and BESS projects in ISO interconnection queues,
detects new or changed entries daily, and sends real-time Telegram alerts with
satellite imagery links.

Usage:
    python solar_sentinel.py              # Normal run (INFO logging)
    python solar_sentinel.py --debug      # Verbose DEBUG logging
    python solar_sentinel.py --dry-run    # Skip Telegram sends, just log

Requires a .env file with TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, and optionally
GOOGLE_MAPS_API_KEY and SOLAR_SENTINEL_STATES.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

import gridstatus
import pandas as pd
import requests
from dotenv import load_dotenv
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("solar_sentinel")

# ---------------------------------------------------------------------------
# Configuration — state-to-ISO mapping
# ---------------------------------------------------------------------------
# Each state maps to the ISO that manages its interconnection queue and a
# short hashtag used in Telegram alerts.  States whose ISO is None require a
# custom scraper (e.g. Florida utilities) and are skipped for now.

STATE_ISO_MAP: dict[str, dict[str, str | None]] = {
    "Illinois":      {"iso": "MISO",  "tag": "#IL"},
    "Indiana":       {"iso": "MISO",  "tag": "#IN"},
    "Texas":         {"iso": "ERCOT", "tag": "#TX"},
    "California":    {"iso": "CAISO", "tag": "#CA"},
    "New York":      {"iso": "NYISO", "tag": "#NY"},
    "New Jersey":    {"iso": "PJM",   "tag": "#NJ"},
    "Ohio":          {"iso": "PJM",   "tag": "#OH"},
    "Massachusetts": {"iso": "ISONE", "tag": "#MA"},
    "Florida":       {"iso": None,    "tag": "#FL"},
}

# Keywords matched (case-insensitive) against the "Generation Type" column
# returned by gridstatus to identify solar and battery-storage projects.
GENERATION_TYPE_KEYWORDS: list[str] = [
    "solar", "battery", "bess", "photovoltaic", "storage",
]

# Only alert on projects at or above this nameplate capacity.
MIN_CAPACITY_MW: float = 5.0

# Columns we keep from the raw gridstatus DataFrame.  ISOs return different
# superset schemas; we normalise to these.
STANDARD_COLUMNS: list[str] = [
    "Queue ID",
    "Project Name",
    "Generation Type",
    "Capacity (MW)",
    "Status",
    "County",
    "State",
    "Queue Date",
    "Proposed Completion Date",
]

# Where snapshot JSON files live (relative to this script).
DATA_DIR = Path(__file__).resolve().parent / "data"

# Telegram rate-limit guard (seconds between messages).
TELEGRAM_SEND_DELAY: float = 0.5

# Nominatim rate-limit guard (seconds between geocode calls).
GEOCODE_DELAY: float = 1.1

# Max Telegram retries per message.
TELEGRAM_MAX_RETRIES: int = 3


# ---------------------------------------------------------------------------
# Custom JSON encoder — handles dates, Timestamps, NaN
# ---------------------------------------------------------------------------
class _SentinelEncoder(json.JSONEncoder):
    """Serialise pandas Timestamps, dates, and NaN to JSON-safe values."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, (datetime, date, pd.Timestamp)):
            return obj.isoformat()
        if isinstance(obj, float) and pd.isna(obj):
            return None
        return super().default(obj)


# ---------------------------------------------------------------------------
# Geocoding cache (persists for the lifetime of one script run)
# ---------------------------------------------------------------------------
_geocode_cache: dict[str, tuple[float, float] | None] = {}
_geocoder: Nominatim | None = None


def _get_geocoder() -> Nominatim:
    """Lazy-init a single Nominatim instance."""
    global _geocoder
    if _geocoder is None:
        _geocoder = Nominatim(user_agent="solar_sentinel_v1", timeout=10)
    return _geocoder


# ===================================================================
# CORE FUNCTIONS
# ===================================================================

def fetch_iso_queue(iso_name: str) -> pd.DataFrame:
    """Fetch the full interconnection queue for a given ISO via gridstatus.

    Parameters
    ----------
    iso_name : str
        One of "MISO", "ERCOT", "CAISO", "NYISO", "PJM", "ISONE".

    Returns
    -------
    pd.DataFrame
        Raw queue data with an added ``ISO`` column, or an empty DataFrame
        on failure.
    """
    logger.info("Fetching %s interconnection queue ...", iso_name)
    try:
        iso_cls = getattr(gridstatus, iso_name, None)
        if iso_cls is None:
            logger.error("gridstatus has no class '%s'", iso_name)
            return pd.DataFrame()

        iso_instance = iso_cls()
        df = iso_instance.get_interconnection_queue()
        df["ISO"] = iso_name
        logger.info("  -> %d total projects returned by %s", len(df), iso_name)
        return df

    except Exception:
        logger.exception("Failed to fetch queue for %s", iso_name)
        return pd.DataFrame()


def filter_projects(
    df: pd.DataFrame,
    target_states: list[str],
) -> pd.DataFrame:
    """Filter a raw queue DataFrame down to relevant solar/BESS projects.

    Criteria
    --------
    * ``Generation Type`` matches any keyword in ``GENERATION_TYPE_KEYWORDS``
      (case-insensitive substring match).
    * ``State`` is in *target_states*.
    * ``Capacity (MW)`` >= ``MIN_CAPACITY_MW``.
    * ``Status`` == ``"Active"`` (ignore Withdrawn / Completed).

    Returns a DataFrame with only ``STANDARD_COLUMNS`` (plus ``ISO``).
    """
    if df.empty:
        return df

    # -- Generation Type filter ------------------------------------------------
    if "Generation Type" not in df.columns:
        logger.warning("DataFrame missing 'Generation Type' column — skipping filter")
        return pd.DataFrame()

    pattern = "|".join(GENERATION_TYPE_KEYWORDS)
    gen_mask = df["Generation Type"].astype(str).str.contains(
        pattern, case=False, na=False,
    )

    # -- State filter ----------------------------------------------------------
    if "State" not in df.columns:
        logger.warning("DataFrame missing 'State' column — skipping filter")
        return pd.DataFrame()

    state_mask = df["State"].astype(str).str.strip().isin(target_states)

    # -- Capacity filter -------------------------------------------------------
    if "Capacity (MW)" not in df.columns:
        logger.warning("DataFrame missing 'Capacity (MW)' column — skipping filter")
        return pd.DataFrame()

    cap_mask = pd.to_numeric(df["Capacity (MW)"], errors="coerce") >= MIN_CAPACITY_MW

    # -- Status filter ---------------------------------------------------------
    if "Status" in df.columns:
        status_mask = df["Status"].astype(str).str.strip().str.lower() == "active"
    else:
        status_mask = pd.Series(True, index=df.index)

    # -- Combine and select columns --------------------------------------------
    filtered = df[gen_mask & state_mask & cap_mask & status_mask].copy()

    # Keep only standard columns that exist in this ISO's schema.
    cols_present = [c for c in STANDARD_COLUMNS if c in filtered.columns]
    cols_present.append("ISO")
    filtered = filtered[cols_present].reset_index(drop=True)

    logger.info(
        "  -> %d projects after filtering for %s",
        len(filtered),
        ", ".join(target_states),
    )
    return filtered


# ---------------------------------------------------------------------------
# Snapshot persistence
# ---------------------------------------------------------------------------

def load_snapshot(iso_name: str) -> dict[str, dict]:
    """Load the previous run's snapshot for an ISO from disk.

    Returns a dict keyed by Queue ID → project dict.
    Returns an empty dict on first run or read error.
    """
    path = DATA_DIR / f"snapshot_{iso_name}.json"
    if not path.exists():
        logger.info("No previous snapshot for %s (first run)", iso_name)
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info("Loaded snapshot for %s with %d projects", iso_name, len(data))
        return data
    except Exception:
        logger.exception("Failed to read snapshot %s", path)
        return {}


def save_snapshot(iso_name: str, projects: pd.DataFrame) -> None:
    """Persist the current filtered projects as a JSON snapshot."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"snapshot_{iso_name}.json"

    # Convert to dict keyed by Queue ID.
    records: dict[str, dict] = {}
    for _, row in projects.iterrows():
        qid = str(row.get("Queue ID", ""))
        if qid:
            records[qid] = row.to_dict()

    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, cls=_SentinelEncoder)

    logger.info("Saved snapshot for %s with %d projects -> %s", iso_name, len(records), path)


# ---------------------------------------------------------------------------
# Diff engine
# ---------------------------------------------------------------------------

def diff_projects(
    current: dict[str, dict],
    previous: dict[str, dict],
) -> tuple[list[dict], list[dict]]:
    """Compare current queue against the previous snapshot.

    Returns
    -------
    new_projects : list[dict]
        Projects whose Queue ID appears in *current* but not *previous*.
    changed_projects : list[dict]
        Projects present in both snapshots whose Status or Capacity changed.
        Each dict includes ``_old_status``, ``_new_status``, ``_old_mw``,
        ``_new_mw`` metadata keys.
    """
    new_projects: list[dict] = []
    changed_projects: list[dict] = []

    current_ids = set(current.keys())
    previous_ids = set(previous.keys())

    # --- New entries ----------------------------------------------------------
    for qid in sorted(current_ids - previous_ids):
        new_projects.append(current[qid])

    # --- Changed entries ------------------------------------------------------
    for qid in sorted(current_ids & previous_ids):
        cur = current[qid]
        prev = previous[qid]

        old_status = str(prev.get("Status", "")).strip()
        new_status = str(cur.get("Status", "")).strip()

        old_mw = _safe_float(prev.get("Capacity (MW)"))
        new_mw = _safe_float(cur.get("Capacity (MW)"))

        if old_status != new_status or old_mw != new_mw:
            record = dict(cur)
            record["_old_status"] = old_status
            record["_new_status"] = new_status
            record["_old_mw"] = old_mw
            record["_new_mw"] = new_mw
            changed_projects.append(record)

    logger.info(
        "Diff result: %d new, %d changed",
        len(new_projects),
        len(changed_projects),
    )
    return new_projects, changed_projects


def _safe_float(val: Any) -> float:
    """Convert a value to float, returning 0.0 on failure."""
    try:
        f = float(val)
        return 0.0 if pd.isna(f) else f
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

def geocode_project(county: str | None, state: str | None) -> tuple[float, float] | None:
    """Geocode a county + state to (lat, lng) using Nominatim.

    Results are cached in-memory for the lifetime of the run so we never
    geocode the same county twice.  Respects a 1.1-second delay between
    requests to stay within Nominatim's free-tier rate limit.
    """
    if not county or not state:
        return None

    county_clean = str(county).strip()
    state_clean = str(state).strip()
    cache_key = f"{county_clean}|{state_clean}"

    if cache_key in _geocode_cache:
        return _geocode_cache[cache_key]

    query = f"{county_clean} County, {state_clean}, USA"
    logger.debug("Geocoding: %s", query)

    try:
        time.sleep(GEOCODE_DELAY)
        location = _get_geocoder().geocode(query)
        if location:
            result = (location.latitude, location.longitude)
            _geocode_cache[cache_key] = result
            return result
        logger.warning("Geocode returned no result for '%s'", query)
    except (GeocoderTimedOut, GeocoderServiceError) as exc:
        logger.warning("Geocode error for '%s': %s", query, exc)
    except Exception:
        logger.exception("Unexpected geocode error for '%s'", query)

    _geocode_cache[cache_key] = None
    return None


# ---------------------------------------------------------------------------
# Satellite imagery URL
# ---------------------------------------------------------------------------

def get_satellite_image_url(lat: float, lng: float) -> str:
    """Return a satellite image URL for a location.

    If ``GOOGLE_MAPS_API_KEY`` is set, returns a Google Static Maps satellite
    URL suitable for embedding in a Telegram ``sendPhoto`` call.  Otherwise,
    returns a Google Earth web link (usable as a clickable link but not
    embeddable as an image).
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if api_key:
        return (
            f"https://maps.googleapis.com/maps/api/staticmap"
            f"?center={lat},{lng}"
            f"&zoom=15&size=600x400&maptype=satellite"
            f"&key={api_key}"
        )
    # Fallback — Google Earth deep link (opens in browser).
    return (
        f"https://earth.google.com/web/@{lat},{lng},500a,2000d,35y,0h,0t,0r"
    )


# ---------------------------------------------------------------------------
# Telegram messaging
# ---------------------------------------------------------------------------

def _telegram_post(endpoint: str, payload: dict, *, dry_run: bool = False) -> bool:
    """POST to Telegram Bot API with retry logic.

    Parameters
    ----------
    endpoint : str
        ``"sendMessage"`` or ``"sendPhoto"``.
    payload : dict
        JSON body (will be sent as ``data`` for sendPhoto, ``json`` for sendMessage).
    dry_run : bool
        If True, log the payload instead of sending.

    Returns True on success, False on failure after retries.
    """
    token = os.getenv("TELEGRAM_TOKEN", "").strip()
    if not token:
        logger.error("TELEGRAM_TOKEN is not set — cannot send alerts")
        return False

    if dry_run:
        logger.info("[DRY RUN] Would POST /%s: %s", endpoint, json.dumps(payload, indent=2, cls=_SentinelEncoder))
        return True

    url = f"https://api.telegram.org/bot{token}/{endpoint}"

    for attempt in range(1, TELEGRAM_MAX_RETRIES + 1):
        try:
            if endpoint == "sendPhoto":
                resp = requests.post(url, data=payload, timeout=30)
            else:
                resp = requests.post(url, json=payload, timeout=30)

            if resp.status_code == 200:
                return True

            # Telegram rate-limit: 429
            if resp.status_code == 429:
                retry_after = resp.json().get("parameters", {}).get("retry_after", 5)
                logger.warning(
                    "Telegram rate-limited (429). Sleeping %ds (attempt %d/%d)",
                    retry_after, attempt, TELEGRAM_MAX_RETRIES,
                )
                time.sleep(retry_after)
                continue

            logger.error(
                "Telegram %s returned %d: %s (attempt %d/%d)",
                endpoint, resp.status_code, resp.text[:300],
                attempt, TELEGRAM_MAX_RETRIES,
            )
        except requests.RequestException as exc:
            logger.error(
                "Telegram %s request error: %s (attempt %d/%d)",
                endpoint, exc, attempt, TELEGRAM_MAX_RETRIES,
            )

        if attempt < TELEGRAM_MAX_RETRIES:
            time.sleep(5 * attempt)

    return False


def send_telegram_alert(
    project: dict,
    change_type: str,
    state_tag: str,
    image_url: str | None,
    *,
    dry_run: bool = False,
) -> bool:
    """Send a single project alert to the Telegram channel.

    Parameters
    ----------
    project : dict
        Project record (must have Queue ID, Project Name, etc.).
    change_type : str
        ``"NEW"`` or ``"CHANGED"``.
    state_tag : str
        Hashtag for the state, e.g. ``"#IL"``.
    image_url : str | None
        Satellite image URL (Google Static Maps) or None.
    dry_run : bool
        Log instead of sending.
    """
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if not chat_id:
        logger.error("TELEGRAM_CHAT_ID is not set")
        return False

    # --- Build caption --------------------------------------------------------
    emoji = "\U0001f506" if change_type == "NEW" else "\U0001f504"  # 🔆 or 🔄
    gen_type = project.get("Generation Type", "Solar/BESS")
    capacity = project.get("Capacity (MW)", "?")
    lines = [
        f'{emoji} <b>{change_type} {gen_type} Project</b>  {state_tag}',
        "",
        f'<b>Project:</b> {project.get("Project Name", "Unknown")}',
        f'<b>Type:</b> {gen_type}',
        f'<b>Capacity:</b> {capacity} MW',
        f'<b>County:</b> {project.get("County", "N/A")}',
        f'<b>State:</b> {project.get("State", "N/A")}',
        f'<b>Status:</b> {project.get("Status", "N/A")}',
        f'<b>Queue Date:</b> {_fmt_date(project.get("Queue Date"))}',
        f'<b>Queue ID:</b> <code>{project.get("Queue ID", "N/A")}</code>',
    ]

    # Show old → new for changed projects.
    if change_type == "CHANGED":
        old_s = project.get("_old_status", "")
        new_s = project.get("_new_status", "")
        old_mw = project.get("_old_mw", "")
        new_mw = project.get("_new_mw", "")
        changes: list[str] = []
        if old_s != new_s:
            changes.append(f"Status: {old_s} \u2192 {new_s}")
        if old_mw != new_mw:
            changes.append(f"Capacity: {old_mw} MW \u2192 {new_mw} MW")
        if changes:
            lines.append("")
            lines.append(f'<b>\u0394 Changes:</b> {" | ".join(changes)}')

    # Location link.
    if image_url and "earth.google.com" in image_url:
        lines.append("")
        lines.append(f'\U0001f4cd <a href="{image_url}">View Location</a>')

    caption = "\n".join(lines)

    # --- Send -----------------------------------------------------------------
    has_api_key = bool(os.getenv("GOOGLE_MAPS_API_KEY", "").strip())

    if image_url and has_api_key:
        # Send as photo with satellite image.
        payload = {
            "chat_id": chat_id,
            "photo": image_url,
            "caption": caption,
            "parse_mode": "HTML",
        }
        success = _telegram_post("sendPhoto", payload, dry_run=dry_run)
    else:
        # No embeddable image — send as text message.
        payload = {
            "chat_id": chat_id,
            "text": caption,
            "parse_mode": "HTML",
            "disable_web_page_preview": False,
        }
        success = _telegram_post("sendMessage", payload, dry_run=dry_run)

    time.sleep(TELEGRAM_SEND_DELAY)
    return success


def send_telegram_summary(
    stats_list: list[dict],
    *,
    dry_run: bool = False,
) -> None:
    """Send a single summary message after the full scan completes."""
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if not chat_id:
        return

    total_new = sum(s.get("new", 0) for s in stats_list)
    total_changed = sum(s.get("changed", 0) for s in stats_list)
    tags = " ".join(s.get("tags", "") for s in stats_list if s.get("tags"))

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    text = (
        f"\u2705 <b>Solar Sentinel scan complete</b>\n"
        f"\U0001f4c5 {now}\n"
        f"\U0001f195 {total_new} new  |  \U0001f504 {total_changed} changed\n"
        f"{tags}"
    )

    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }
    _telegram_post("sendMessage", payload, dry_run=dry_run)


def _fmt_date(val: Any) -> str:
    """Format a date-ish value for display."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "N/A"
    if isinstance(val, (datetime, date, pd.Timestamp)):
        return val.strftime("%Y-%m-%d")
    return str(val)[:10] if len(str(val)) >= 10 else str(val)


# ===================================================================
# ORCHESTRATOR — processes one ISO (which may cover multiple states)
# ===================================================================

def process_iso_group(
    iso_name: str,
    states: list[str],
    *,
    dry_run: bool = False,
) -> dict:
    """Fetch, filter, diff, geocode, and alert for one ISO's queue.

    Parameters
    ----------
    iso_name : str
        e.g. ``"MISO"``.
    states : list[str]
        Target states within that ISO, e.g. ``["Illinois", "Indiana"]``.
    dry_run : bool
        If True, skip actual Telegram sends.

    Returns
    -------
    dict with keys ``iso``, ``new``, ``changed``, ``tags``.
    """
    tags = " ".join(STATE_ISO_MAP[s]["tag"] for s in states if s in STATE_ISO_MAP)
    result = {"iso": iso_name, "new": 0, "changed": 0, "tags": tags}

    # 1. Fetch
    raw_df = fetch_iso_queue(iso_name)
    if raw_df.empty:
        logger.warning("No data from %s — skipping", iso_name)
        return result

    # 2. Filter
    filtered_df = filter_projects(raw_df, states)
    if filtered_df.empty:
        logger.info("No matching solar/BESS projects in %s for %s", iso_name, states)
        # Still save an empty snapshot so we detect additions next run.
        save_snapshot(iso_name, filtered_df)
        return result

    # 3. Convert current projects to dict keyed by Queue ID.
    current: dict[str, dict] = {}
    for _, row in filtered_df.iterrows():
        qid = str(row.get("Queue ID", ""))
        if qid:
            current[qid] = row.to_dict()

    # 4. Load previous snapshot & diff.
    previous = load_snapshot(iso_name)
    new_projects, changed_projects = diff_projects(current, previous)

    result["new"] = len(new_projects)
    result["changed"] = len(changed_projects)

    # 5. Alert on new projects.
    for proj in new_projects:
        state = str(proj.get("State", "")).strip()
        tag = STATE_ISO_MAP.get(state, {}).get("tag", f"#{state[:2].upper()}")

        coords = geocode_project(proj.get("County"), proj.get("State"))
        img_url: str | None = None
        if coords:
            img_url = get_satellite_image_url(*coords)

        send_telegram_alert(proj, "NEW", tag, img_url, dry_run=dry_run)

    # 6. Alert on changed projects.
    for proj in changed_projects:
        state = str(proj.get("State", "")).strip()
        tag = STATE_ISO_MAP.get(state, {}).get("tag", f"#{state[:2].upper()}")

        coords = geocode_project(proj.get("County"), proj.get("State"))
        img_url = None
        if coords:
            img_url = get_satellite_image_url(*coords)

        send_telegram_alert(proj, "CHANGED", tag, img_url, dry_run=dry_run)

    # 7. Save updated snapshot.
    save_snapshot(iso_name, filtered_df)

    return result


# ===================================================================
# MAIN ENTRY POINT
# ===================================================================

def main() -> int:
    """Run the full Solar Sentinel pipeline and return an exit code."""

    # --- CLI args -------------------------------------------------------------
    parser = argparse.ArgumentParser(description="Solar Sentinel — Queue Monitor")
    parser.add_argument("--debug", action="store_true", help="Enable DEBUG logging")
    parser.add_argument("--dry-run", action="store_true", help="Log alerts instead of sending to Telegram")
    args = parser.parse_args()

    # --- Logging setup --------------------------------------------------------
    level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )

    logger.info("=" * 60)
    logger.info("Solar Sentinel starting  %s", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))
    logger.info("=" * 60)

    # --- Load .env ------------------------------------------------------------
    load_dotenv()

    if not os.getenv("TELEGRAM_TOKEN"):
        logger.error("TELEGRAM_TOKEN is not set in .env — aborting")
        return 1
    if not os.getenv("TELEGRAM_CHAT_ID"):
        logger.error("TELEGRAM_CHAT_ID is not set in .env — aborting")
        return 1

    # --- Determine active states ----------------------------------------------
    states_env = os.getenv("SOLAR_SENTINEL_STATES", "Illinois")
    active_states = [s.strip() for s in states_env.split(",") if s.strip()]

    unknown = [s for s in active_states if s not in STATE_ISO_MAP]
    if unknown:
        logger.warning("Unknown states (will be skipped): %s", unknown)
        active_states = [s for s in active_states if s in STATE_ISO_MAP]

    if not active_states:
        logger.error("No valid states configured — aborting")
        return 1

    logger.info("Active states: %s", ", ".join(active_states))

    # --- Group states by ISO --------------------------------------------------
    # e.g. {"MISO": ["Illinois", "Indiana"], "PJM": ["New Jersey", "Ohio"]}
    iso_groups: dict[str, list[str]] = defaultdict(list)
    skipped_states: list[str] = []

    for state in active_states:
        iso_name = STATE_ISO_MAP[state]["iso"]
        if iso_name is None:
            skipped_states.append(state)
            continue
        iso_groups[iso_name].append(state)

    if skipped_states:
        logger.warning(
            "States without ISO support (custom scraper needed): %s",
            ", ".join(skipped_states),
        )

    # --- Process each ISO group -----------------------------------------------
    all_stats: list[dict] = []

    for iso_name, states in sorted(iso_groups.items()):
        logger.info("-" * 40)
        logger.info("Processing %s for %s", iso_name, ", ".join(states))
        try:
            stats = process_iso_group(iso_name, states, dry_run=args.dry_run)
            all_stats.append(stats)
        except Exception:
            logger.exception("Unhandled error processing %s", iso_name)
            all_stats.append({"iso": iso_name, "new": 0, "changed": 0, "tags": ""})

    # --- Summary --------------------------------------------------------------
    total_new = sum(s["new"] for s in all_stats)
    total_changed = sum(s["changed"] for s in all_stats)
    logger.info("=" * 60)
    logger.info("TOTAL: %d new, %d changed projects", total_new, total_changed)
    logger.info("=" * 60)

    send_telegram_summary(all_stats, dry_run=args.dry_run)

    return 0


# ---------------------------------------------------------------------------
# BONUS — Sentinel-2 satellite diffing (future enhancement)
# ---------------------------------------------------------------------------
#
# To add before/after satellite imagery for construction monitoring:
#
# 1. Use the Copernicus Data Space Ecosystem (free tier):
#    https://dataspace.copernicus.eu/
#
# 2. The Sentinel Hub Process API lets you request true-color images:
#    POST https://sh.dataspace.copernicus.eu/api/v1/process
#    with an evalscript for bands B04, B03, B02 (true-color RGB).
#
# 3. Workflow:
#    a) Geocode the project site to lat/lng (already done above).
#    b) Define a bounding box ~1 km around the site.
#    c) Request an image from 6–12 months ago ("before").
#    d) Request the latest cloud-free image ("after").
#    e) Stitch them side-by-side with Pillow and send via Telegram.
#
# 4. Libraries:  sentinelhub  (pip install sentinelhub) or raw requests.
#
# 5. Rate limits: free tier allows 1,500 requests/month, 3 req/sec.
#    Cache images in data/sentinel/ to avoid re-fetching.
#
# This would let subscribers visually confirm whether construction has
# started on a newly-queued solar or BESS project.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    sys.exit(main())
