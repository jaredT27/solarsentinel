from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

import solar_sentinel_enhanced as sentinel
from sentinel_features import (
    Subscriber,
    SubscriberPreferences,
    append_history_events,
    build_history_event,
    subscriber_matches_alert,
)


def make_config(*, subscribers: list[Subscriber] | None = None) -> sentinel.SentinelConfig:
    return sentinel.SentinelConfig(
        telegram_token="test-token",
        google_maps_api_key="",
        admin_chat_id="admin",
        channels={"all": "all-channel", "TX": "texas-channel"},
        states=[sentinel.StateConfig("Texas", "ERCOT", "#TX")],
        filters=sentinel.FilterConfig(),
        alerts=sentinel.AlertConfig(),
        reliability=sentinel.ReliabilityConfig(),
        imagery=sentinel.ImageryConfig(),
        processing=sentinel.ProcessingConfig(telegram_send_delay_sec=0),
        logging_cfg=sentinel.LoggingConfig(),
        subscribers=subscribers or [],
    )


def test_fmt_date_handles_nat() -> None:
    assert sentinel._fmt_date(pd.NaT) == "N/A"
    assert sentinel._fmt_date(pd.Timestamp("2026-07-18")) == "2026-07-18"


def test_isone_codes_and_state_abbreviation_are_normalized() -> None:
    raw = pd.DataFrame(
        [
            {
                "Queue ID": "1",
                "Project Name": "Worcester Storage",
                "Generation Type": "SUN BAT",
                "Capacity (MW)": 120,
                "Status": "Active",
                "County": "Worcester",
                "State": "MA",
                "Queue Date": pd.Timestamp("2026-01-01"),
                "ISO": "ISONE",
            }
        ]
    )
    filtered = sentinel.filter_projects(raw, ["Massachusetts"], sentinel.FilterConfig())
    assert len(filtered) == 1
    assert filtered.iloc[0]["State"] == "Massachusetts"


def test_duplicate_queue_ids_do_not_drop_units() -> None:
    frame = pd.DataFrame(
        [
            {"Queue ID": "73", "Project Name": "Unit A", "State": "Massachusetts", "County": "A", "Capacity (MW)": 10},
            {"Queue ID": "73", "Project Name": "Unit B", "State": "Massachusetts", "County": "A", "Capacity (MW)": 20},
        ]
    )
    records = sentinel.build_project_records(frame)
    assert len(records) == 2
    assert all(key.startswith("73::") for key in records)


def test_personalized_subscriber_filters_match_every_rule() -> None:
    subscriber = Subscriber(
        name="Analyst",
        email="analyst@example.com",
        telegram_chat_id="subscriber-chat",
        active=True,
        preferences=SubscriberPreferences(
            states=["TX"],
            isos=["ERCOT"],
            generation_types=["battery"],
            counties=["matagorda"],
            change_types=["NEW"],
            min_capacity_mw=50,
            keywords=["razorbill"],
        ),
    )
    project = {
        "ISO": "ERCOT",
        "Project Name": "Razorbill Storage",
        "Generation Type": "Other - Battery Energy Storage",
        "Capacity (MW)": 120,
        "County": "Matagorda",
        "State": "Texas",
        "Status": "Active",
    }
    assert subscriber_matches_alert(subscriber, project, "NEW", "TX")
    assert not subscriber_matches_alert(subscriber, project, "CHANGED", "TX")
    assert not subscriber_matches_alert(subscriber, {**project, "Capacity (MW)": 25}, "NEW", "TX")


def test_channel_routing_includes_only_matching_subscribers(monkeypatch) -> None:
    matching = Subscriber(
        "Matching", "", "matching-chat", True,
        SubscriberPreferences(states=["TX"], min_capacity_mw=50),
    )
    excluded = Subscriber(
        "Excluded", "", "excluded-chat", True,
        SubscriberPreferences(states=["CA"]),
    )
    cfg = make_config(subscribers=[matching, excluded])
    delivered: list[str] = []

    def fake_send(project, change_type, state_tag, image_url, chat_id, cfg, *, dry_run=False):
        delivered.append(chat_id)
        return True

    monkeypatch.setattr(sentinel, "send_telegram_alert", fake_send)
    sent, failed = sentinel.send_to_channels(
        {"ISO": "ERCOT", "State": "Texas", "Capacity (MW)": 120, "Generation Type": "Battery"},
        "NEW",
        "#TX",
        None,
        cfg,
        dry_run=True,
    )
    assert sent == 3
    assert failed == 0
    assert set(delivered) == {"all-channel", "texas-channel", "matching-chat"}


def test_history_is_deduplicated_and_bounded(tmp_path: Path) -> None:
    path = tmp_path / "history.json"
    base = {
        "ISO": "ERCOT",
        "Queue ID": "26INR0001",
        "Project Name": "Test Storage",
        "Generation Type": "Battery",
        "Capacity (MW)": 100,
        "Status": "Active",
        "County": "Pecos",
        "State": "Texas",
    }
    first = build_history_event(base, "NEW", "TX", observed_at=datetime(2026, 7, 18, tzinfo=UTC))
    second = build_history_event({**base, "Queue ID": "26INR0002"}, "NEW", "TX", observed_at=datetime(2026, 7, 19, tzinfo=UTC))
    assert append_history_events(path, [first, first, second], limit=2) == 2
    payload = json.loads(path.read_text())
    assert payload["alert_count"] == 2
    assert [item["queue_id"] for item in payload["alerts"]] == ["26INR0002", "26INR0001"]


def test_snapshot_drop_is_guarded(monkeypatch) -> None:
    current = pd.DataFrame(
        [
            {"Queue ID": "1", "Project Name": "One", "Generation Type": "Solar", "Capacity (MW)": 50, "Status": "Active", "County": "A", "State": "Texas", "ISO": "ERCOT"},
            {"Queue ID": "2", "Project Name": "Two", "Generation Type": "Battery", "Capacity (MW)": 60, "Status": "Active", "County": "B", "State": "Texas", "ISO": "ERCOT"},
        ]
    )
    previous = {str(index): {"Queue ID": str(index), "Status": "Active"} for index in range(10)}
    monkeypatch.setattr(sentinel, "fetch_iso_queue", lambda _iso: current)
    monkeypatch.setattr(sentinel, "load_snapshot", lambda _iso: previous)
    saved: list[bool] = []
    monkeypatch.setattr(sentinel, "save_snapshot", lambda *_args: saved.append(True))

    result = sentinel.process_iso_group(
        "ERCOT",
        [sentinel.StateConfig("Texas", "ERCOT", "#TX")],
        make_config(),
        dry_run=True,
    )
    assert result.error and result.error.startswith("Snapshot guard")
    assert saved == []
