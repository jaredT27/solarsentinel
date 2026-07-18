"""Subscriber filtering and public alert-history helpers for Solar Sentinel."""

from __future__ import annotations

import hashlib
import json
import math
import os
import tempfile
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Iterable


DEFAULT_HISTORY_LIMIT = 5000


def _text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if isinstance(value, float) and math.isnan(value):
            return ""
    except TypeError:
        pass
    return str(value).strip()


def _items(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        value = [part for part in value.split(",")]
    return [str(item).strip() for item in value if str(item).strip()]


def _number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(result) else result


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except (TypeError, ValueError):
            pass
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


@dataclass(frozen=True)
class SubscriberPreferences:
    """Per-subscriber routing rules loaded from ``subscribers.json``."""

    states: list[str] = field(default_factory=list)
    isos: list[str] = field(default_factory=list)
    generation_types: list[str] = field(default_factory=list)
    counties: list[str] = field(default_factory=list)
    statuses: list[str] = field(default_factory=list)
    change_types: list[str] = field(default_factory=lambda: ["NEW", "CHANGED", "WITHDRAWN"])
    keywords: list[str] = field(default_factory=list)
    min_capacity_mw: float | None = None
    max_capacity_mw: float | None = None

    @classmethod
    def from_record(cls, record: dict[str, Any]) -> "SubscriberPreferences":
        filters = record.get("filters") or {}
        return cls(
            states=[item.upper() for item in _items(filters.get("states", record.get("states")))],
            isos=[item.upper() for item in _items(filters.get("isos"))],
            generation_types=[item.lower() for item in _items(filters.get("generation_types"))],
            counties=[item.lower() for item in _items(filters.get("counties"))],
            statuses=[item.lower() for item in _items(filters.get("statuses"))],
            change_types=[item.upper() for item in _items(filters.get("change_types"))]
            or ["NEW", "CHANGED", "WITHDRAWN"],
            keywords=[item.lower() for item in _items(filters.get("keywords"))],
            min_capacity_mw=_number(filters.get("min_capacity_mw", record.get("custom_min_mw"))),
            max_capacity_mw=_number(filters.get("max_capacity_mw")),
        )


@dataclass(frozen=True)
class Subscriber:
    name: str
    email: str
    telegram_chat_id: str
    active: bool
    preferences: SubscriberPreferences

    @classmethod
    def from_record(cls, record: dict[str, Any]) -> "Subscriber":
        return cls(
            name=_text(record.get("name")),
            email=_text(record.get("email")),
            telegram_chat_id=_text(record.get("telegram_chat_id")),
            active=bool(record.get("active", True)),
            preferences=SubscriberPreferences.from_record(record),
        )


def load_subscribers(path: Path) -> list[Subscriber]:
    """Load active Telegram subscribers; malformed or missing files are safe."""
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    records = payload.get("subscribers", payload if isinstance(payload, list) else [])
    if not isinstance(records, list):
        return []
    subscribers = [Subscriber.from_record(record) for record in records if isinstance(record, dict)]
    return [subscriber for subscriber in subscribers if subscriber.active and subscriber.telegram_chat_id]


def subscriber_matches_alert(
    subscriber: Subscriber,
    project: dict[str, Any],
    change_type: str,
    state_code: str,
) -> bool:
    """Return whether an alert satisfies every configured subscriber rule."""
    prefs = subscriber.preferences
    normalized_change = change_type.upper()
    normalized_state = state_code.upper()
    iso = _text(project.get("ISO")).upper()
    generation_type = _text(project.get("Generation Type")).lower()
    county = _text(project.get("County")).lower()
    status = _text(project.get("Status")).lower()
    capacity = _number(project.get("Capacity (MW)"))

    if prefs.states and normalized_state not in prefs.states:
        return False
    if prefs.isos and iso not in prefs.isos:
        return False
    if prefs.change_types and normalized_change not in prefs.change_types:
        return False
    if prefs.generation_types and not any(term in generation_type for term in prefs.generation_types):
        return False
    if prefs.counties and county not in prefs.counties:
        return False
    if prefs.statuses and status not in prefs.statuses:
        return False
    if prefs.min_capacity_mw is not None and (capacity is None or capacity < prefs.min_capacity_mw):
        return False
    if prefs.max_capacity_mw is not None and (capacity is None or capacity > prefs.max_capacity_mw):
        return False

    if prefs.keywords:
        haystack = " ".join(
            _text(project.get(field)).lower()
            for field in ("Project Name", "Interconnecting Entity", "County", "State", "Generation Type", "Status")
        )
        if not any(keyword in haystack for keyword in prefs.keywords):
            return False
    return True


def build_history_event(
    project: dict[str, Any],
    change_type: str,
    state_code: str,
    *,
    observed_at: datetime | None = None,
    image_url: str | None = None,
    source_url: str | None = None,
) -> dict[str, Any]:
    """Convert a validated queue change into the stable public history schema."""
    observed_at = observed_at or datetime.now(UTC)
    observed_day = observed_at.date().isoformat()
    identity = "|".join(
        [
            observed_day,
            _text(project.get("ISO")),
            _text(project.get("Queue ID")),
            change_type.upper(),
            "|".join(_items(project.get("_changes"))),
        ]
    )
    event_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]
    return {
        "id": event_id,
        "observed_at": observed_at.isoformat(),
        "change_type": change_type.upper(),
        "iso": _text(project.get("ISO")).upper(),
        "state": _text(project.get("State")),
        "state_code": state_code.upper(),
        "queue_id": _text(project.get("Queue ID")),
        "project_name": _text(project.get("Project Name")) or "Unnamed project",
        "interconnecting_entity": _text(project.get("Interconnecting Entity")),
        "generation_type": _text(project.get("Generation Type")),
        "capacity_mw": _number(project.get("Capacity (MW)")),
        "status": _text(project.get("Status")),
        "county": _text(project.get("County")),
        "queue_date": _json_value(project.get("Queue Date")),
        "proposed_completion_date": _json_value(project.get("Proposed Completion Date")),
        "changes": _items(project.get("_changes")),
        "source_url": source_url,
        "map_url": image_url,
    }


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def append_history_events(
    path: Path,
    events: Iterable[dict[str, Any]],
    *,
    limit: int = DEFAULT_HISTORY_LIMIT,
    generated_at: datetime | None = None,
) -> int:
    """Merge, deduplicate, newest-sort and atomically persist history events."""
    existing: list[dict[str, Any]] = []
    if path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            existing = payload.get("alerts", []) if isinstance(payload, dict) else []
        except (OSError, json.JSONDecodeError):
            existing = []

    by_id = {
        str(event.get("id")): event
        for event in [*existing, *list(events)]
        if isinstance(event, dict) and event.get("id")
    }
    merged = sorted(by_id.values(), key=lambda event: _text(event.get("observed_at")), reverse=True)[:limit]
    generated_at = generated_at or datetime.now(UTC)
    _atomic_write_json(
        path,
        {
            "schema_version": 1,
            "generated_at": generated_at.isoformat(),
            "alert_count": len(merged),
            "alerts": merged,
        },
    )
    return len(merged)


def write_scan_status(path: Path, results: Iterable[Any], elapsed_sec: float) -> dict[str, Any]:
    """Persist the machine-readable coverage health consumed by the website."""
    result_list = list(results)
    markets = []
    for result in sorted(result_list, key=lambda item: item.iso):
        markets.append(
            {
                "iso": result.iso,
                "states": list(result.states),
                "healthy": not bool(result.error),
                "error": result.error,
                "new": result.new,
                "changed": result.changed,
                "withdrawn": result.withdrawn,
                "records": getattr(result, "records", 0),
            }
        )
    errors = sum(1 for market in markets if not market["healthy"])
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "status": "healthy" if errors == 0 else "degraded",
        "healthy_markets": len(markets) - errors,
        "total_markets": len(markets),
        "elapsed_seconds": round(elapsed_sec, 2),
        "markets": markets,
    }
    _atomic_write_json(path, payload)
    return payload
