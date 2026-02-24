#!/usr/bin/env python3
"""
Solar Sentinel Enhanced — Production-Grade Interconnection Queue Monitor

Monitors US utility-scale solar and BESS projects across ISO interconnection
queues, detects new / changed / withdrawn entries daily, and sends premium
Telegram alerts with satellite imagery to multi-channel subscriber feeds.

Enhancements over the original MVP
───────────────────────────────────
• config.yaml-driven (states, channels, thresholds — no code changes needed)
• Multi-channel Telegram routing (all-alerts + per-state subscriber channels)
• Smarter diff engine (withdrawn detection, capacity thresholds, date changes)
• Premium satellite imagery (red pin marker, configurable zoom, 640×360)
• Commented-out Google Earth Engine / Sentinel-2 before/after diffing
• Parallel ISO fetching via concurrent.futures
• Retry with exponential backoff on every external call (tenacity)
• Structured dual logging: console + daily rotating log file
• Admin health report channel (always sent, even on zero alerts)
• Per-ISO error isolation — one failure never stops the others
• --force flag to re-alert all current projects on demand
• ISO queue deep-links in every alert

Usage
─────
    python solar_sentinel_enhanced.py                # Normal daily run
    python solar_sentinel_enhanced.py --debug        # Verbose logging
    python solar_sentinel_enhanced.py --dry-run      # Log payloads, skip Telegram
    python solar_sentinel_enhanced.py --force        # Treat all projects as new
    python solar_sentinel_enhanced.py --config my.yaml  # Custom config path
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import logging
import logging.handlers
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

import gridstatus
import pandas as pd
import requests
import yaml
from dotenv import load_dotenv
from geopy.exc import GeocoderServiceError, GeocoderTimedOut
from geopy.geocoders import Nominatim
from tenacity import (
    RetryError,
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

# ---------------------------------------------------------------------------
# Module logger (child loggers inherit this config)
# ---------------------------------------------------------------------------
logger = logging.getLogger("solar_sentinel")

# ---------------------------------------------------------------------------
# Where snapshot JSON files live (relative to this script).
# ---------------------------------------------------------------------------
DATA_DIR = Path(__file__).resolve().parent / "data"

# ---------------------------------------------------------------------------
# Public interconnection-queue URLs for each ISO (used as deep-links in alerts)
# ---------------------------------------------------------------------------
ISO_QUEUE_URLS: dict[str, str] = {
    "MISO":  "https://www.misoenergy.org/planning/generator-interconnection/GI_Queue/",
    "ERCOT": "https://www.ercot.com/gridinfo/resource",
    "CAISO": "https://rimspub.caiso.com/rimsui/logon.do",
    "NYISO": "https://www.nyiso.com/interconnections",
    "PJM":   "https://www.pjm.com/planning/service-requests/interconnection-queues",
    "ISONE": "https://irtt.iso-ne.com/reports/external",
}

# US state full-name → two-letter abbreviation map.
# Used by filter_projects so both "Illinois" and "IL" match.
US_STATE_ABBREV: dict[str, str] = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY",
}

# Columns we normalise every ISO's DataFrame to.
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


# ═══════════════════════════════════════════════════════════════
# CONFIGURATION — dataclasses loaded from config.yaml + .env
# ═══════════════════════════════════════════════════════════════

@dataclass
class StateConfig:
    name: str
    iso: str | None   # None = custom scraper needed (e.g. Florida)
    tag: str          # e.g. "#IL"

@dataclass
class FilterConfig:
    min_capacity_mw: float = 5.0
    generation_types: list[str] = field(default_factory=lambda: [
        "solar", "battery", "bess", "photovoltaic", "storage",
    ])
    track_all_statuses: bool = True

@dataclass
class AlertConfig:
    alert_on_new: bool = True
    alert_on_changed: bool = True
    alert_on_withdrawn: bool = True
    capacity_change_mw: float = 10.0
    capacity_change_pct: float = 15.0

@dataclass
class ImageryConfig:
    zoom: int = 14
    size: str = "640x360"
    marker_color: str = "red"
    enable_sentinel2: bool = False

@dataclass
class ProcessingConfig:
    max_workers: int = 3
    geocode_delay_sec: float = 1.1
    telegram_send_delay_sec: float = 0.5

@dataclass
class LoggingConfig:
    level: str = "INFO"
    log_dir: str = "logs"
    max_log_days: int = 30

@dataclass
class SentinelConfig:
    """Top-level configuration assembled from config.yaml + .env secrets."""
    telegram_token: str
    google_maps_api_key: str
    admin_chat_id: str
    channels: dict[str, str]          # {"all": "...", "IL": "...", ...}
    states: list[StateConfig]
    filters: FilterConfig
    alerts: AlertConfig
    imagery: ImageryConfig
    processing: ProcessingConfig
    logging_cfg: LoggingConfig


def load_config(config_path: Path) -> SentinelConfig:
    """Load *config.yaml* + ``.env`` and return a validated `SentinelConfig`.

    Raises ``SystemExit`` if required fields are missing.
    """
    load_dotenv()

    # --- Read YAML -----------------------------------------------------------
    if not config_path.exists():
        logger.error("Config file not found: %s", config_path)
        sys.exit(1)

    with open(config_path, "r", encoding="utf-8") as fh:
        raw: dict = yaml.safe_load(fh) or {}

    # --- Secrets from .env ----------------------------------------------------
    telegram_token = os.getenv("TELEGRAM_TOKEN", "").strip()
    if not telegram_token:
        logger.error("TELEGRAM_TOKEN is not set in .env — aborting")
        sys.exit(1)

    google_maps_api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()

    # --- Telegram section -----------------------------------------------------
    tg = raw.get("telegram", {})
    admin_chat_id = str(tg.get("admin_chat_id", "")).strip()
    channels: dict[str, str] = {}
    for key, val in tg.get("channels", {}).items():
        channels[str(key)] = str(val).strip()

    if "all" not in channels:
        logger.error("config.yaml must define telegram.channels.all")
        sys.exit(1)

    # --- States ---------------------------------------------------------------
    states: list[StateConfig] = []
    for entry in raw.get("states", []):
        states.append(StateConfig(
            name=entry["name"],
            iso=entry.get("iso"),       # None for Florida
            tag=entry.get("tag", f'#{entry["name"][:2].upper()}'),
        ))
    if not states:
        logger.error("config.yaml must define at least one state")
        sys.exit(1)

    # --- Sub-configs with safe defaults ---------------------------------------
    f_raw = raw.get("filters", {})
    filters = FilterConfig(
        min_capacity_mw=float(f_raw.get("min_capacity_mw", 5.0)),
        generation_types=f_raw.get("generation_types", ["solar", "battery", "bess", "photovoltaic", "storage"]),
        track_all_statuses=bool(f_raw.get("track_all_statuses", True)),
    )

    a_raw = raw.get("alerts", {})
    alerts = AlertConfig(
        alert_on_new=bool(a_raw.get("alert_on_new", True)),
        alert_on_changed=bool(a_raw.get("alert_on_changed", True)),
        alert_on_withdrawn=bool(a_raw.get("alert_on_withdrawn", True)),
        capacity_change_mw=float(a_raw.get("capacity_change_mw", 10.0)),
        capacity_change_pct=float(a_raw.get("capacity_change_pct", 15.0)),
    )

    i_raw = raw.get("imagery", {})
    imagery = ImageryConfig(
        zoom=int(i_raw.get("zoom", 14)),
        size=str(i_raw.get("size", "640x360")),
        marker_color=str(i_raw.get("marker_color", "red")),
        enable_sentinel2=bool(i_raw.get("enable_sentinel2", False)),
    )

    p_raw = raw.get("processing", {})
    processing = ProcessingConfig(
        max_workers=int(p_raw.get("max_workers", 3)),
        geocode_delay_sec=float(p_raw.get("geocode_delay_sec", 1.1)),
        telegram_send_delay_sec=float(p_raw.get("telegram_send_delay_sec", 0.5)),
    )

    l_raw = raw.get("logging", {})
    logging_cfg = LoggingConfig(
        level=str(l_raw.get("level", "INFO")).upper(),
        log_dir=str(l_raw.get("log_dir", "logs")),
        max_log_days=int(l_raw.get("max_log_days", 30)),
    )

    return SentinelConfig(
        telegram_token=telegram_token,
        google_maps_api_key=google_maps_api_key,
        admin_chat_id=admin_chat_id,
        channels=channels,
        states=states,
        filters=filters,
        alerts=alerts,
        imagery=imagery,
        processing=processing,
        logging_cfg=logging_cfg,
    )


# ═══════════════════════════════════════════════════════════════
# LOGGING SETUP — console + daily rotating file
# ═══════════════════════════════════════════════════════════════

def setup_logging(cfg: LoggingConfig, *, debug: bool = False, quiet: bool = False) -> None:
    """Configure dual-output logging: pretty console + structured file.

    When *quiet* is True the console only shows WARNING and above — useful
    for cron jobs where you only want to see errors.  The file handler
    still logs everything at the configured level.
    """
    root = logging.getLogger()
    root.setLevel(logging.DEBUG if debug else getattr(logging, cfg.level, logging.INFO))

    # Clear any pre-existing handlers (e.g. from basicConfig).
    root.handlers.clear()

    # ── Console handler (colourful, concise) ──────────────────────
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    ))
    if quiet:
        console.setLevel(logging.WARNING)
    root.addHandler(console)

    # ── File handler (detailed, daily rotation) ───────────────────
    log_dir = Path(cfg.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    file_handler = logging.handlers.TimedRotatingFileHandler(
        filename=log_dir / "solar_sentinel.log",
        when="midnight",
        backupCount=cfg.max_log_days,
        encoding="utf-8",
    )
    file_handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s %(funcName)s:%(lineno)d — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    root.addHandler(file_handler)


# ═══════════════════════════════════════════════════════════════
# CUSTOM JSON ENCODER — handles dates, Timestamps, NaN
# ═══════════════════════════════════════════════════════════════

class _SentinelEncoder(json.JSONEncoder):
    def default(self, obj: Any) -> Any:
        if isinstance(obj, (datetime, date, pd.Timestamp)):
            return obj.isoformat()
        if isinstance(obj, float) and pd.isna(obj):
            return None
        return super().default(obj)


# ═══════════════════════════════════════════════════════════════
# GEOCODING — Nominatim with in-memory cache
# ═══════════════════════════════════════════════════════════════

_geocode_cache: dict[str, tuple[float, float] | None] = {}
_geocoder: Nominatim | None = None


def _get_geocoder() -> Nominatim:
    global _geocoder
    if _geocoder is None:
        _geocoder = Nominatim(user_agent="solar_sentinel_enhanced/2.0", timeout=10)
    return _geocoder


def geocode_project(
    county: str | None,
    state: str | None,
    delay: float = 1.1,
) -> tuple[float, float] | None:
    """Geocode *county, state* → ``(lat, lng)`` with caching + rate-limit."""
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
        time.sleep(delay)
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


# ═══════════════════════════════════════════════════════════════
# SATELLITE IMAGERY
# ═══════════════════════════════════════════════════════════════

def get_satellite_image_url(
    lat: float,
    lng: float,
    cfg: SentinelConfig,
) -> str:
    """Return a satellite-view URL for embedding or linking.

    With a Google Maps API key → Static Maps satellite image (embeddable).
    Without → Google Earth deep-link (clickable but not embeddable).
    """
    if cfg.google_maps_api_key:
        return (
            f"https://maps.googleapis.com/maps/api/staticmap"
            f"?center={lat},{lng}"
            f"&zoom={cfg.imagery.zoom}"
            f"&size={cfg.imagery.size}"
            f"&maptype=satellite"
            f"&markers=color:{cfg.imagery.marker_color}%7C{lat},{lng}"
            f"&key={cfg.google_maps_api_key}"
        )
    return (
        f"https://earth.google.com/web/@{lat},{lng},500a,2000d,35y,0h,0t,0r"
    )


def get_google_earth_url(lat: float, lng: float) -> str:
    """Always return a Google Earth deep-link (used as secondary button)."""
    return f"https://earth.google.com/web/@{lat},{lng},500a,2000d,35y,0h,0t,0r"


# ═══════════════════════════════════════════════════════════════
# SENTINEL-2 / GOOGLE EARTH ENGINE — Before/After Satellite Diff
# ═══════════════════════════════════════════════════════════════
#
# HOW TO ENABLE:
#   1.  pip install earthengine-api
#   2.  Run  `earthengine authenticate`  in your terminal (one-time).
#   3.  Create a GCP project and enable the Earth Engine API.
#   4.  Set  imagery.enable_sentinel2: true  in config.yaml.
#   5.  Uncomment the function below and the call site in
#       _build_alert_caption().
#
# The function fetches the most recent cloud-free Sentinel-2 true-colour
# thumbnail for a 2 km × 2 km area around the project site, plus the
# same area 6 months earlier.  Both URLs are appended to the Telegram
# alert so subscribers can visually confirm construction activity.
#
# ── Uncomment everything below this line to activate ──────────
#
# import ee
#
# _ee_initialised: bool = False
#
# def _ensure_ee() -> None:
#     """Lazy Earth Engine initialisation (runs once per process)."""
#     global _ee_initialised
#     if not _ee_initialised:
#         ee.Initialize(project="YOUR_GCP_PROJECT_ID")  # ← edit this
#         _ee_initialised = True
#
# def fetch_sentinel2_comparison(
#     lat: float,
#     lng: float,
#     months_back: int = 6,
# ) -> dict[str, str] | None:
#     """Fetch before/after Sentinel-2 L2A true-colour thumbnails.
#
#     Parameters
#     ----------
#     lat, lng : float
#         Centre of the area of interest.
#     months_back : int
#         How many months to look back for the "before" image.
#
#     Returns
#     -------
#     dict with keys ``before_url``, ``after_url``, ``before_date``,
#     ``after_date`` — or ``None`` if not enough imagery available.
#     """
#     try:
#         _ensure_ee()
#
#         point = ee.Geometry.Point([lng, lat])
#         aoi = point.buffer(1000).bounds()  # ~2 km × 2 km
#
#         today = datetime.utcnow()
#         before_start = today.replace(
#             month=today.month - months_back if today.month > months_back
#             else today.month - months_back + 12,
#             year=today.year if today.month > months_back else today.year - 1,
#         )
#
#         vis_params = {
#             "bands": ["B4", "B3", "B2"],
#             "min": 0,
#             "max": 3000,
#             "dimensions": "640x360",
#             "region": aoi,
#             "format": "png",
#         }
#
#         s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
#
#         # "Before" — best cloud-free image from 6 months ago ± 30 days
#         before_col = (
#             s2.filterBounds(aoi)
#               .filterDate(
#                   before_start.strftime("%Y-%m-%d"),
#                   (before_start.replace(day=28) ).strftime("%Y-%m-%d"),
#               )
#               .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
#               .sort("CLOUDY_PIXEL_PERCENTAGE")
#         )
#
#         # "After" — most recent cloud-free image
#         after_col = (
#             s2.filterBounds(aoi)
#               .filterDate(
#                   (today.replace(day=1)).strftime("%Y-%m-%d"),
#                   today.strftime("%Y-%m-%d"),
#               )
#               .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
#               .sort("CLOUDY_PIXEL_PERCENTAGE")
#         )
#
#         if before_col.size().getInfo() == 0 or after_col.size().getInfo() == 0:
#             return None
#
#         before_img = before_col.first()
#         after_img = after_col.first()
#
#         before_date = ee.Date(before_img.get("system:time_start")).format("YYYY-MM-dd").getInfo()
#         after_date = ee.Date(after_img.get("system:time_start")).format("YYYY-MM-dd").getInfo()
#
#         return {
#             "before_url": before_img.getThumbURL(vis_params),
#             "after_url": after_img.getThumbURL(vis_params),
#             "before_date": before_date,
#             "after_date": after_date,
#         }
#
#     except Exception:
#         logger.exception("Sentinel-2 comparison failed for (%.4f, %.4f)", lat, lng)
#         return None


# ═══════════════════════════════════════════════════════════════
# QUEUE FETCHING — with tenacity retry
# ═══════════════════════════════════════════════════════════════

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(Exception),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _fetch_iso_queue_with_retry(iso_name: str) -> pd.DataFrame:
    """Internal: call gridstatus with automatic retry on transient errors."""
    iso_cls = getattr(gridstatus, iso_name, None) or getattr(
        gridstatus, iso_name.capitalize(), None,
    )
    if iso_cls is None:
        raise ValueError(f"gridstatus has no class '{iso_name}'")
    return iso_cls().get_interconnection_queue()


def fetch_iso_queue(iso_name: str) -> pd.DataFrame:
    """Fetch the full interconnection queue for *iso_name*.

    Returns an empty DataFrame (never raises) on permanent failure.
    """
    logger.info("Fetching %s interconnection queue …", iso_name)
    try:
        df = _fetch_iso_queue_with_retry(iso_name)
        df["ISO"] = iso_name
        logger.info("  -> %d total projects returned by %s", len(df), iso_name)
        return df
    except RetryError:
        logger.error("All retries exhausted for %s", iso_name)
        return pd.DataFrame()
    except Exception:
        logger.exception("Failed to fetch queue for %s", iso_name)
        return pd.DataFrame()


# ═══════════════════════════════════════════════════════════════
# FILTERING
# ═══════════════════════════════════════════════════════════════

def filter_projects(
    df: pd.DataFrame,
    target_states: list[str],
    cfg: FilterConfig,
) -> pd.DataFrame:
    """Narrow a raw queue DataFrame to solar/BESS projects we care about.

    Unlike the MVP, this retains **all statuses** when
    ``cfg.track_all_statuses`` is True so the diff engine can detect
    Active → Withdrawn transitions.
    """
    if df.empty:
        return df

    # -- Generation Type -------------------------------------------------------
    if "Generation Type" not in df.columns:
        logger.warning("Missing 'Generation Type' column — returning empty")
        return pd.DataFrame()

    gen_pattern = "|".join(cfg.generation_types)
    gen_mask = df["Generation Type"].astype(str).str.contains(
        gen_pattern, case=False, na=False,
    )

    # -- State -----------------------------------------------------------------
    if "State" not in df.columns:
        logger.warning("Missing 'State' column — returning empty")
        return pd.DataFrame()

    # Match both full names ("Illinois") and abbreviations ("IL")
    expanded_states = set(target_states)
    for name in target_states:
        if name in US_STATE_ABBREV:
            expanded_states.add(US_STATE_ABBREV[name])
    state_mask = df["State"].astype(str).str.strip().isin(expanded_states)

    # -- Capacity --------------------------------------------------------------
    if "Capacity (MW)" not in df.columns:
        logger.warning("Missing 'Capacity (MW)' column — returning empty")
        return pd.DataFrame()

    cap_mask = pd.to_numeric(df["Capacity (MW)"], errors="coerce") >= cfg.min_capacity_mw

    # -- Status (optional filter) ----------------------------------------------
    if cfg.track_all_statuses:
        status_mask = pd.Series(True, index=df.index)
    elif "Status" in df.columns:
        status_mask = df["Status"].astype(str).str.strip().str.lower() == "active"
    else:
        status_mask = pd.Series(True, index=df.index)

    # -- Combine & normalise ---------------------------------------------------
    filtered = df.loc[gen_mask & state_mask & cap_mask & status_mask].copy()
    cols_present = [c for c in STANDARD_COLUMNS if c in filtered.columns] + ["ISO"]
    filtered = filtered[cols_present].reset_index(drop=True)

    logger.info(
        "  -> %d projects after filtering for %s",
        len(filtered), ", ".join(target_states),
    )
    return filtered


# ═══════════════════════════════════════════════════════════════
# SNAPSHOT PERSISTENCE
# ═══════════════════════════════════════════════════════════════

def load_snapshot(iso_name: str) -> dict[str, dict]:
    path = DATA_DIR / f"snapshot_{iso_name}.json"
    if not path.exists():
        logger.info("No previous snapshot for %s (first run)", iso_name)
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data: dict = json.load(f)
        logger.info("Loaded snapshot for %s — %d projects", iso_name, len(data))
        return data
    except Exception:
        logger.exception("Failed to read snapshot %s", path)
        return {}


def save_snapshot(iso_name: str, projects: pd.DataFrame) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"snapshot_{iso_name}.json"
    records: dict[str, dict] = {}
    for _, row in projects.iterrows():
        qid = str(row.get("Queue ID", ""))
        if qid:
            records[qid] = row.to_dict()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, cls=_SentinelEncoder)
    logger.info("Saved snapshot for %s -- %d projects -> %s", iso_name, len(records), path)


# ═══════════════════════════════════════════════════════════════
# DIFF ENGINE — new / changed / withdrawn
# ═══════════════════════════════════════════════════════════════

@dataclass
class DiffResult:
    new_projects: list[dict]
    changed_projects: list[dict]
    withdrawn_projects: list[dict]


def diff_projects(
    current: dict[str, dict],
    previous: dict[str, dict],
    alert_cfg: AlertConfig,
) -> DiffResult:
    """Compare today's queue against yesterday's snapshot.

    Returns three separate lists so each category can be routed or
    suppressed independently via ``alert_cfg`` flags.
    """
    new_projects: list[dict] = []
    changed_projects: list[dict] = []
    withdrawn_projects: list[dict] = []

    cur_ids = set(current.keys())
    prev_ids = set(previous.keys())

    # ── New entries ───────────────────────────────────────────────
    for qid in sorted(cur_ids - prev_ids):
        proj = current[qid]
        status = str(proj.get("Status", "")).strip().lower()
        # Only alert on new entries that are actually Active.
        if status == "active":
            new_projects.append(proj)

    # ── Changed entries ──────────────────────────────────────────
    for qid in sorted(cur_ids & prev_ids):
        cur = current[qid]
        prev = previous[qid]
        changes: list[str] = []

        # Status change
        old_status = str(prev.get("Status", "")).strip()
        new_status = str(cur.get("Status", "")).strip()
        if old_status.lower() != new_status.lower():
            changes.append(f"Status: {old_status} → {new_status}")

        # Capacity change (with threshold)
        old_mw = _safe_float(prev.get("Capacity (MW)"))
        new_mw = _safe_float(cur.get("Capacity (MW)"))
        if old_mw > 0 and new_mw > 0:
            abs_delta = abs(new_mw - old_mw)
            pct_delta = (abs_delta / old_mw) * 100
            if abs_delta >= alert_cfg.capacity_change_mw or pct_delta >= alert_cfg.capacity_change_pct:
                changes.append(f"Capacity: {old_mw:.0f} MW → {new_mw:.0f} MW")
        elif old_mw != new_mw:
            changes.append(f"Capacity: {old_mw:.0f} MW → {new_mw:.0f} MW")

        # Proposed Completion Date change
        old_date = str(prev.get("Proposed Completion Date", "")).strip()[:10]
        new_date = str(cur.get("Proposed Completion Date", "")).strip()[:10]
        if old_date != new_date and old_date and new_date:
            changes.append(f"Completion: {old_date} → {new_date}")

        if changes:
            record = dict(cur)
            record["_changes"] = changes
            record["_old_status"] = old_status
            record["_new_status"] = new_status
            record["_old_mw"] = old_mw
            record["_new_mw"] = new_mw

            # Route to withdrawn list if status went to Withdrawn/Cancelled.
            if _is_withdrawn(new_status) and not _is_withdrawn(old_status):
                withdrawn_projects.append(record)
            else:
                changed_projects.append(record)

    # ── Disappeared from queue entirely (treat as withdrawn) ─────
    for qid in sorted(prev_ids - cur_ids):
        prev_proj = previous[qid]
        old_status = str(prev_proj.get("Status", "")).strip()
        if old_status.lower() == "active":
            record = dict(prev_proj)
            record["_changes"] = [f"Status: {old_status} → Removed from queue"]
            record["_old_status"] = old_status
            record["_new_status"] = "Removed"
            withdrawn_projects.append(record)

    logger.info(
        "Diff: %d new, %d changed, %d withdrawn",
        len(new_projects), len(changed_projects), len(withdrawn_projects),
    )
    return DiffResult(new_projects, changed_projects, withdrawn_projects)


def _is_withdrawn(status: str) -> bool:
    """Check if a status string means the project is dead."""
    s = status.strip().lower()
    return any(kw in s for kw in ("withdraw", "cancel", "removed", "deactivat"))


def _safe_float(val: Any) -> float:
    try:
        f = float(val)
        return 0.0 if pd.isna(f) else f
    except (TypeError, ValueError):
        return 0.0


# ═══════════════════════════════════════════════════════════════
# TELEGRAM MESSAGING — multi-channel, retry, HTML-safe
# ═══════════════════════════════════════════════════════════════

def _h(text: Any) -> str:
    """HTML-escape arbitrary text for safe embedding in Telegram HTML."""
    return html_lib.escape(str(text)) if text is not None else "N/A"


def _fmt_date(val: Any) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "N/A"
    if isinstance(val, (datetime, date, pd.Timestamp)):
        return val.strftime("%Y-%m-%d")
    s = str(val)
    return s[:10] if len(s) >= 10 else s


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=15),
    retry=retry_if_exception_type(requests.RequestException),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _telegram_post_with_retry(url: str, **kwargs: Any) -> requests.Response:
    """Low-level POST with tenacity retry on network errors."""
    resp = requests.post(url, timeout=30, **kwargs)
    # Raise on 429 so tenacity retries it.
    if resp.status_code == 429:
        retry_after = resp.json().get("parameters", {}).get("retry_after", 5)
        logger.warning("Telegram 429 — sleeping %ds", retry_after)
        time.sleep(retry_after)
        resp.raise_for_status()
    elif resp.status_code != 200:
        logger.error("Telegram %d: %s", resp.status_code, resp.text[:300])
    return resp


def _telegram_post(
    endpoint: str,
    payload: dict,
    token: str,
    *,
    dry_run: bool = False,
) -> bool:
    """POST to the Telegram Bot API.  Returns True on success."""
    if dry_run:
        logger.info("[DRY RUN] /%s -> %s", endpoint, _truncate(payload))
        return True

    url = f"https://api.telegram.org/bot{token}/{endpoint}"
    try:
        if endpoint == "sendPhoto":
            resp = _telegram_post_with_retry(url, data=payload)
        else:
            resp = _telegram_post_with_retry(url, json=payload)
        return resp.status_code == 200
    except Exception:
        logger.exception("Telegram %s failed after retries", endpoint)
        return False


def _truncate(payload: dict, max_len: int = 300) -> str:
    """Truncate a dict repr for readable dry-run logs."""
    s = json.dumps(payload, default=str)
    return s[:max_len] + "…" if len(s) > max_len else s


def _build_alert_caption(
    project: dict,
    change_type: str,
    state_tag: str,
    image_url: str | None,
    iso_name: str | None,
) -> str:
    """Compose the HTML caption for a single Telegram alert."""
    if change_type == "NEW":
        emoji, label = "\u2600\ufe0f", "NEW"           # ☀️
    elif change_type == "WITHDRAWN":
        emoji, label = "\u26a0\ufe0f", "WITHDRAWN"     # ⚠️
    else:
        emoji, label = "\U0001f504", "UPDATED"          # 🔄

    gen_type = _h(project.get("Generation Type", "Solar/BESS"))
    capacity = project.get("Capacity (MW)", "?")

    lines: list[str] = [
        f'{emoji} <b>{label} {gen_type} Project</b>  {state_tag}',
        "",
        f'\U0001f3d7 <b>{_h(project.get("Project Name", "Unknown"))}</b>',
        f'<b>Type:</b> {gen_type}',
        f'<b>Capacity:</b> {capacity} MW',
        f'<b>County:</b> {_h(project.get("County", "N/A"))}',
        f'<b>State:</b> {_h(project.get("State", "N/A"))}',
        f'<b>Status:</b> {_h(project.get("Status", "N/A"))}',
        f'<b>Queue Date:</b> {_fmt_date(project.get("Queue Date"))}',
        f'<b>Queue ID:</b> <code>{_h(project.get("Queue ID", "N/A"))}</code>',
    ]

    # ── Change details ────────────────────────────────────────────
    changes = project.get("_changes", [])
    if changes:
        lines.append("")
        lines.append(f'<b>\u0394 Changes:</b> {" | ".join(changes)}')

    # ── Links row ─────────────────────────────────────────────────
    links: list[str] = []

    # ISO queue deep-link
    if iso_name and iso_name in ISO_QUEUE_URLS:
        links.append(f'\U0001f517 <a href="{ISO_QUEUE_URLS[iso_name]}">View {iso_name} Queue</a>')

    # Location
    if image_url and "earth.google.com" in image_url:
        links.append(f'\U0001f4cd <a href="{image_url}">Google Earth</a>')
    elif image_url:
        # Google Static Maps URL used as photo — add Earth link separately
        # (extract lat/lng from the URL for an Earth link)
        try:
            center_param = image_url.split("center=")[1].split("&")[0]
            links.append(
                f'\U0001f4cd <a href="https://earth.google.com/web/@{center_param},500a,2000d,35y,0h,0t,0r">Google Earth</a>'
            )
        except (IndexError, KeyError):
            pass

    if links:
        lines.append("")
        lines.append(" | ".join(links))

    return "\n".join(lines)


def send_telegram_alert(
    project: dict,
    change_type: str,
    state_tag: str,
    image_url: str | None,
    chat_id: str,
    cfg: SentinelConfig,
    *,
    dry_run: bool = False,
) -> bool:
    """Send one alert to one Telegram chat.  Returns True on success."""
    iso_name = project.get("ISO")
    caption = _build_alert_caption(project, change_type, state_tag, image_url, iso_name)

    has_api_key = bool(cfg.google_maps_api_key)

    if image_url and has_api_key and "earth.google.com" not in image_url:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "photo": image_url,
            "caption": caption,
            "parse_mode": "HTML",
        }
        ok = _telegram_post("sendPhoto", payload, cfg.telegram_token, dry_run=dry_run)
    else:
        payload = {
            "chat_id": chat_id,
            "text": caption,
            "parse_mode": "HTML",
            "disable_web_page_preview": False,
        }
        ok = _telegram_post("sendMessage", payload, cfg.telegram_token, dry_run=dry_run)

    time.sleep(cfg.processing.telegram_send_delay_sec)
    return ok


def send_to_channels(
    project: dict,
    change_type: str,
    state_tag: str,
    image_url: str | None,
    cfg: SentinelConfig,
    *,
    dry_run: bool = False,
) -> None:
    """Route an alert to the all-alerts channel + any per-state channel."""
    # Always send to the "all" channel.
    targets: list[str] = [cfg.channels["all"]]

    # Also send to per-state channel if configured.
    state_code = state_tag.lstrip("#")
    if state_code in cfg.channels and cfg.channels[state_code] != cfg.channels["all"]:
        targets.append(cfg.channels[state_code])

    for chat_id in targets:
        send_telegram_alert(
            project, change_type, state_tag, image_url, chat_id, cfg,
            dry_run=dry_run,
        )


# ═══════════════════════════════════════════════════════════════
# SUBSCRIBER SUMMARY (sent to "all" channel)
# ═══════════════════════════════════════════════════════════════

@dataclass
class ISOResult:
    iso: str
    states: list[str]
    tags: str
    new: int = 0
    changed: int = 0
    withdrawn: int = 0
    error: str | None = None


def send_subscriber_summary(
    results: list[ISOResult],
    cfg: SentinelConfig,
    *,
    dry_run: bool = False,
) -> None:
    """Short, subscriber-friendly summary to the 'all' channel."""
    total_new = sum(r.new for r in results)
    total_chg = sum(r.changed for r in results)
    total_wd = sum(r.withdrawn for r in results)
    all_tags = " ".join(r.tags for r in results if r.tags)
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    text = (
        f"\u2705 <b>Solar Sentinel scan complete</b>\n"
        f"\U0001f4c5 {now}\n"
        f"\u2600\ufe0f {total_new} new  |  \U0001f504 {total_chg} changed  |  "
        f"\u26a0\ufe0f {total_wd} withdrawn\n"
        f"{all_tags}"
    )
    _telegram_post(
        "sendMessage",
        {"chat_id": cfg.channels["all"], "text": text, "parse_mode": "HTML"},
        cfg.telegram_token,
        dry_run=dry_run,
    )


# ═══════════════════════════════════════════════════════════════
# ADMIN HEALTH REPORT (sent to admin channel)
# ═══════════════════════════════════════════════════════════════

def send_admin_health_report(
    results: list[ISOResult],
    elapsed_sec: float,
    cfg: SentinelConfig,
    *,
    dry_run: bool = False,
) -> None:
    """Detailed daily report to the admin channel — always sent."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # ── Per-ISO lines ─────────────────────────────────────────────
    iso_lines: list[str] = []
    errors: list[str] = []
    for r in results:
        status = f"\u2705" if not r.error else f"\u274c"
        iso_lines.append(
            f"  {status} <b>{r.iso}</b>: "
            f"{r.new} new, {r.changed} chg, {r.withdrawn} wd  {r.tags}"
        )
        if r.error:
            errors.append(f"  \u274c {r.iso}: {_h(r.error[:120])}")

    total_new = sum(r.new for r in results)
    total_chg = sum(r.changed for r in results)
    total_wd = sum(r.withdrawn for r in results)
    geocoded = len([v for v in _geocode_cache.values() if v is not None])

    lines: list[str] = [
        f"\U0001f4ca <b>Solar Sentinel Daily Report</b>",
        f"\U0001f4c5 {now}",
        "",
        "\u2500\u2500 Results \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
        *iso_lines,
        "",
        "\u2500\u2500 Totals \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
        f"  \u2600\ufe0f {total_new} new  |  \U0001f504 {total_chg} changed  |  \u26a0\ufe0f {total_wd} withdrawn",
        "",
        "\u2500\u2500 Health \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
    ]

    if errors:
        lines.extend(errors)
    else:
        lines.append("  \u2705 No errors")

    lines.extend([
        "",
        "\u2500\u2500 Runtime \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
        f"  \u23f1 {elapsed_sec:.0f}s  |  \U0001f4cd {geocoded} geocoded",
    ])

    text = "\n".join(lines)

    admin_id = cfg.admin_chat_id or cfg.channels["all"]
    _telegram_post(
        "sendMessage",
        {"chat_id": admin_id, "text": text, "parse_mode": "HTML"},
        cfg.telegram_token,
        dry_run=dry_run,
    )


# ═══════════════════════════════════════════════════════════════
# ISO GROUP PROCESSOR — one ISO, multiple states
# ═══════════════════════════════════════════════════════════════

def process_iso_group(
    iso_name: str,
    states: list[StateConfig],
    cfg: SentinelConfig,
    *,
    dry_run: bool = False,
    force: bool = False,
) -> ISOResult:
    """Fetch → filter → diff → geocode → alert for one ISO."""
    state_names = [s.name for s in states]
    tags = " ".join(s.tag for s in states)
    result = ISOResult(iso=iso_name, states=state_names, tags=tags)

    # 1. Fetch
    raw_df = fetch_iso_queue(iso_name)
    if raw_df.empty:
        result.error = "Empty queue returned"
        return result

    # 2. Filter
    filtered_df = filter_projects(raw_df, state_names, cfg.filters)
    if filtered_df.empty:
        logger.info("No matching projects in %s for %s", iso_name, state_names)
        save_snapshot(iso_name, filtered_df)
        return result

    # 3. Build current dict keyed by Queue ID
    current: dict[str, dict] = {}
    for _, row in filtered_df.iterrows():
        qid = str(row.get("Queue ID", ""))
        if qid:
            current[qid] = row.to_dict()

    # 4. Load previous snapshot (empty if --force)
    previous = {} if force else load_snapshot(iso_name)

    # 5. Diff
    diff = diff_projects(current, previous, cfg.alerts)
    result.new = len(diff.new_projects)
    result.changed = len(diff.changed_projects)
    result.withdrawn = len(diff.withdrawn_projects)

    # 6. Build state_name → tag lookup
    tag_map = {s.name: s.tag for s in states}

    # 7. Alert — NEW
    if cfg.alerts.alert_on_new:
        for proj in diff.new_projects:
            state = str(proj.get("State", "")).strip()
            tag = tag_map.get(state, f"#{state[:2].upper()}")
            coords = geocode_project(proj.get("County"), proj.get("State"), cfg.processing.geocode_delay_sec)
            img = get_satellite_image_url(*coords, cfg) if coords else None
            send_to_channels(proj, "NEW", tag, img, cfg, dry_run=dry_run)

    # 8. Alert — CHANGED
    if cfg.alerts.alert_on_changed:
        for proj in diff.changed_projects:
            state = str(proj.get("State", "")).strip()
            tag = tag_map.get(state, f"#{state[:2].upper()}")
            coords = geocode_project(proj.get("County"), proj.get("State"), cfg.processing.geocode_delay_sec)
            img = get_satellite_image_url(*coords, cfg) if coords else None
            send_to_channels(proj, "CHANGED", tag, img, cfg, dry_run=dry_run)

    # 9. Alert — WITHDRAWN
    if cfg.alerts.alert_on_withdrawn:
        for proj in diff.withdrawn_projects:
            state = str(proj.get("State", "")).strip()
            tag = tag_map.get(state, f"#{state[:2].upper()}")
            coords = geocode_project(proj.get("County"), proj.get("State"), cfg.processing.geocode_delay_sec)
            img = get_satellite_image_url(*coords, cfg) if coords else None
            send_to_channels(proj, "WITHDRAWN", tag, img, cfg, dry_run=dry_run)

    # 10. Save snapshot
    save_snapshot(iso_name, filtered_df)

    return result


# ═══════════════════════════════════════════════════════════════
# PARALLEL ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════

def process_all_isos(
    iso_groups: dict[str, list[StateConfig]],
    cfg: SentinelConfig,
    *,
    dry_run: bool = False,
    force: bool = False,
) -> list[ISOResult]:
    """Process all ISO groups in parallel threads with error isolation."""
    results: list[ISOResult] = []

    with ThreadPoolExecutor(max_workers=cfg.processing.max_workers) as pool:
        futures = {
            pool.submit(
                process_iso_group, iso, states, cfg,
                dry_run=dry_run, force=force,
            ): iso
            for iso, states in iso_groups.items()
        }

        for future in as_completed(futures):
            iso_name = futures[future]
            try:
                results.append(future.result())
            except Exception as exc:
                logger.exception("Unhandled failure in %s", iso_name)
                results.append(ISOResult(
                    iso=iso_name,
                    states=[],
                    tags="",
                    error=str(exc),
                ))

    return results


# ═══════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════

def main() -> int:
    """Run the full Solar Sentinel Enhanced pipeline."""

    # ── CLI arguments ─────────────────────────────────────────────
    parser = argparse.ArgumentParser(
        description="Solar Sentinel Enhanced — Production Queue Monitor",
    )
    parser.add_argument("--debug", action="store_true", help="Enable DEBUG logging")
    parser.add_argument("--dry-run", action="store_true", help="Log alerts, don't send to Telegram")
    parser.add_argument("--force", action="store_true", help="Ignore previous snapshot (re-alert everything)")
    parser.add_argument("--quiet", action="store_true", help="Console shows only errors (file log unaffected)")
    parser.add_argument(
        "--config", type=Path, default=Path(__file__).resolve().parent / "config.yaml",
        help="Path to config.yaml (default: ./config.yaml)",
    )
    args = parser.parse_args()

    # ── Bootstrap logging (minimal until config loads) ────────────
    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO, stream=sys.stdout)

    # ── Load configuration ────────────────────────────────────────
    cfg = load_config(args.config)

    # ── Set up structured logging (replaces bootstrap) ────────────
    setup_logging(cfg.logging_cfg, debug=args.debug, quiet=args.quiet)

    logger.info("=" * 60)
    logger.info("Solar Sentinel Enhanced starting  %s", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))
    if args.dry_run:
        logger.info("*** DRY-RUN MODE — no Telegram messages will be sent ***")
    if args.force:
        logger.info("*** FORCE MODE — all current projects treated as new ***")
    logger.info("=" * 60)

    start_time = time.monotonic()

    # ── Group states by ISO ───────────────────────────────────────
    iso_groups: dict[str, list[StateConfig]] = defaultdict(list)
    skipped: list[str] = []

    for state in cfg.states:
        if state.iso is None:
            skipped.append(state.name)
            continue
        iso_groups[state.iso].append(state)

    if skipped:
        logger.warning("Skipping states without ISO support: %s", ", ".join(skipped))

    if not iso_groups:
        logger.error("No valid ISO groups to process — aborting")
        return 1

    logger.info(
        "Processing %d ISOs: %s",
        len(iso_groups),
        ", ".join(f"{iso} ({', '.join(s.name for s in sts)})" for iso, sts in sorted(iso_groups.items())),
    )

    # ── Process all ISOs in parallel ──────────────────────────────
    results = process_all_isos(
        iso_groups, cfg, dry_run=args.dry_run, force=args.force,
    )

    elapsed = time.monotonic() - start_time

    # ── Log totals ────────────────────────────────────────────────
    total_new = sum(r.new for r in results)
    total_chg = sum(r.changed for r in results)
    total_wd = sum(r.withdrawn for r in results)
    total_err = sum(1 for r in results if r.error)

    logger.info("=" * 60)
    logger.info(
        "DONE in %.0fs — %d new, %d changed, %d withdrawn, %d errors",
        elapsed, total_new, total_chg, total_wd, total_err,
    )
    logger.info("=" * 60)

    # ── Telegram summaries ────────────────────────────────────────
    send_subscriber_summary(results, cfg, dry_run=args.dry_run)
    send_admin_health_report(results, elapsed, cfg, dry_run=args.dry_run)

    # Exit 1 only if every single ISO failed.
    return 1 if total_err == len(results) else 0


if __name__ == "__main__":
    sys.exit(main())
