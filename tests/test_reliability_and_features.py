from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import pytest

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


class FakePjmResponse:
    def __init__(self, content: bytes = b"PK-test-workbook") -> None:
        self.content = content

    def raise_for_status(self) -> None:
        return None


def test_pjm_queue_uses_planning_export_without_data_miner_key(monkeypatch) -> None:
    monkeypatch.delenv("PJM_API_KEY", raising=False)
    observed: dict[str, object] = {}

    def fake_post(url, *, headers, timeout):
        observed.update(url=url, headers=headers, timeout=timeout)
        return FakePjmResponse()

    raw = pd.DataFrame(
        [
            {
                "Project ID": "AB1-001",
                "Name": "Garden Storage",
                "State": "NJ",
                "County": "Salem",
                "Status": "Active",
                "MFO": 125,
                "MW In Service": pd.NA,
                "MW Energy": 130,
                "MW Capacity": 120,
                "Fuel": "Battery",
                "Submitted Date": pd.Timestamp("2026-01-01"),
                "Projected In Service Date": pd.Timestamp("2029-06-01"),
            }
        ]
    )
    monkeypatch.setattr(sentinel.requests, "post", fake_post)
    monkeypatch.setattr(sentinel.pd, "read_excel", lambda _workbook: raw)

    queue = sentinel.fetch_pjm_planning_queue()

    assert observed["url"] == sentinel.PJM_PLANNING_EXPORT_URL
    assert observed["headers"]["api-subscription-key"] == sentinel.PJM_PLANNING_CLIENT_KEY
    assert "Ocp-Apim-Subscription-Key" not in observed["headers"]
    assert queue.iloc[0]["Queue ID"] == "AB1-001"
    assert queue.iloc[0]["Capacity (MW)"] == 125
    assert queue.iloc[0]["ISO"] == "PJM"


def test_pjm_queue_schema_change_fails_loudly(monkeypatch) -> None:
    monkeypatch.setattr(
        sentinel.requests,
        "post",
        lambda *_args, **_kwargs: FakePjmResponse(),
    )
    monkeypatch.setattr(
        sentinel.pd,
        "read_excel",
        lambda _workbook: pd.DataFrame([{"Project ID": "changed-schema"}]),
    )

    with pytest.raises(ValueError, match="schema changed"):
        sentinel.fetch_pjm_planning_queue()


def test_pjm_queue_rejects_non_excel_response(monkeypatch) -> None:
    monkeypatch.setattr(
        sentinel.requests,
        "post",
        lambda *_args, **_kwargs: FakePjmResponse(b"<html>Access denied</html>"),
    )

    with pytest.raises(ValueError, match="did not return an XLSX"):
        sentinel.fetch_pjm_planning_queue()


def test_nyiso_queue_reuses_session_until_workbook_is_ready(monkeypatch) -> None:
    class PendingResponse:
        status_code = 202
        headers = {"Retry-After": "1"}
        content = b""

        def __init__(self) -> None:
            self.closed = False

        def close(self) -> None:
            self.closed = True

    class ReadyResponse:
        status_code = 200
        headers: dict[str, str] = {}
        content = b"PK-ready-workbook"

        def __init__(self) -> None:
            self.closed = False

        def raise_for_status(self) -> None:
            return None

        def close(self) -> None:
            self.closed = True

    class FakeSession:
        def __init__(self) -> None:
            self.responses = [PendingResponse(), ReadyResponse()]
            self.calls = 0

        def get(self, *_args, **_kwargs):
            response = self.responses[self.calls]
            self.calls += 1
            return response

    session = FakeSession()

    class FakeNyisoAdapter:
        def get_raw_interconnection_queue(self):
            raise AssertionError("the live downloader should be replaced")

        def get_interconnection_queue(self):
            workbook = self.get_raw_interconnection_queue()
            assert workbook.read().startswith(b"PK")
            return pd.DataFrame([{"Queue ID": "Q1"}])

    monkeypatch.setattr(sentinel.requests, "Session", lambda: session)
    monkeypatch.setattr(sentinel.gridstatus, "NYISO", FakeNyisoAdapter)
    monkeypatch.setattr(sentinel.time, "sleep", lambda _delay: None)

    queue = sentinel.fetch_nyiso_queue()

    assert session.calls == 2
    assert session.responses[0].closed
    assert session.responses[1].closed
    assert queue.iloc[0]["Queue ID"] == "Q1"
    assert queue.iloc[0]["ISO"] == "NYISO"


def test_isone_queue_retries_with_explicit_timeout(monkeypatch) -> None:
    class ReadyResponse:
        content = b'<html><table id="publicqueue"></table></html>'

        def raise_for_status(self) -> None:
            return None

        def close(self) -> None:
            return None

    class FakeSession:
        def __init__(self) -> None:
            self.calls: list[dict] = []

        def get(self, *_args, **kwargs):
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                raise sentinel.requests.ConnectTimeout("upstream timed out")
            return ReadyResponse()

    session = FakeSession()

    class FakeIsoneAdapter:
        def get_raw_interconnection_queue(self, verbose=False):
            raise AssertionError("the unbounded live downloader should be replaced")

        def get_interconnection_queue(self):
            html = self.get_raw_interconnection_queue()
            assert b'publicqueue' in html.read()
            return pd.DataFrame([{"Queue ID": "NE-1"}])

    monkeypatch.setattr(sentinel.requests, "Session", lambda: session)
    monkeypatch.setattr(sentinel.gridstatus, "ISONE", FakeIsoneAdapter)
    monkeypatch.setattr(sentinel.time, "sleep", lambda _delay: None)

    queue = sentinel.fetch_isone_queue()

    assert len(session.calls) == 2
    assert all(call["timeout"] == (10, 20) for call in session.calls)
    assert queue.iloc[0]["Queue ID"] == "NE-1"
    assert queue.iloc[0]["ISO"] == "ISONE"


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


def test_missing_completion_dates_do_not_create_false_changes() -> None:
    current = {
        "Q1": {
            "Queue ID": "Q1",
            "Status": "Active",
            "Capacity (MW)": 50,
            "Proposed Completion Date": pd.NaT,
        }
    }
    previous = {
        "Q1": {
            "Queue ID": "Q1",
            "Status": "Active",
            "Capacity (MW)": 50,
            "Proposed Completion Date": None,
        }
    }

    diff = sentinel.diff_projects(current, previous, sentinel.AlertConfig())

    assert diff.changed_projects == []


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


def test_first_successful_market_scan_creates_baseline_without_alerts(monkeypatch) -> None:
    current = pd.DataFrame(
        [
            {
                "Queue ID": "AB1-001",
                "Project Name": "Garden Storage",
                "Generation Type": "Battery",
                "Capacity (MW)": 125,
                "Status": "Active",
                "County": "Salem",
                "State": "New Jersey",
                "ISO": "PJM",
            }
        ]
    )
    cfg = make_config()
    cfg.states = [sentinel.StateConfig("New Jersey", "PJM", "#NJ")]
    monkeypatch.setattr(sentinel, "fetch_iso_queue", lambda _iso: current)
    monkeypatch.setattr(sentinel, "load_snapshot", lambda _iso: {})
    saved: list[int] = []
    monkeypatch.setattr(
        sentinel,
        "save_snapshot",
        lambda _iso, projects: saved.append(len(projects)),
    )
    monkeypatch.setattr(
        sentinel,
        "send_to_channels",
        lambda *_args, **_kwargs: pytest.fail("baseline scan must not send alerts"),
    )

    result = sentinel.process_iso_group(
        "PJM",
        cfg.states,
        cfg,
        dry_run=True,
    )

    assert result.error is None
    assert result.records == 1
    assert (result.new, result.changed, result.withdrawn) == (0, 0, 0)
    assert saved == [1]
