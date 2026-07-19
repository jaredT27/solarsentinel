from datetime import UTC, datetime

from scripts.enforce_scan_health import evaluate_scan_health


STARTED_AT = datetime(2026, 7, 19, 12, 0, tzinfo=UTC).timestamp()


def scan_status(*, unhealthy_iso: str | None = None, error: str | None = None) -> dict:
    markets = [
        {"iso": "MISO", "healthy": unhealthy_iso != "MISO", "error": error if unhealthy_iso == "MISO" else None},
        {"iso": "NYISO", "healthy": unhealthy_iso != "NYISO", "error": error if unhealthy_iso == "NYISO" else None},
        {"iso": "PJM", "healthy": unhealthy_iso != "PJM", "error": error if unhealthy_iso == "PJM" else None},
    ]
    healthy_count = sum(bool(market["healthy"]) for market in markets)
    return {
        "generated_at": "2026-07-19T12:00:10+00:00",
        "status": "healthy" if unhealthy_iso is None else "degraded",
        "healthy_markets": healthy_count,
        "total_markets": len(markets),
        "markets": markets,
    }


def test_healthy_scan_passes() -> None:
    passed, _ = evaluate_scan_health(
        scan_status(), scan_exit=0, started_at=STARTED_AT, allow_nyiso_degraded=True,
    )
    assert passed


def test_known_nyiso_only_degradation_passes_in_monitor_mode() -> None:
    passed, reason = evaluate_scan_health(
        scan_status(unhealthy_iso="NYISO", error="Empty queue returned"),
        scan_exit=1,
        started_at=STARTED_AT,
        allow_nyiso_degraded=True,
    )
    assert passed
    assert "all other markets are healthy" in reason


def test_other_market_failure_still_fails() -> None:
    passed, _ = evaluate_scan_health(
        scan_status(unhealthy_iso="PJM", error="Empty queue returned"),
        scan_exit=1,
        started_at=STARTED_AT,
        allow_nyiso_degraded=True,
    )
    assert not passed


def test_stale_health_file_cannot_excuse_crashed_scan() -> None:
    payload = scan_status(unhealthy_iso="NYISO", error="Empty queue returned")
    payload["generated_at"] = "2026-07-18T12:00:00+00:00"
    passed, _ = evaluate_scan_health(
        payload, scan_exit=1, started_at=STARTED_AT, allow_nyiso_degraded=True,
    )
    assert not passed


def test_unexpected_nyiso_error_still_fails() -> None:
    passed, _ = evaluate_scan_health(
        scan_status(unhealthy_iso="NYISO", error="Parser schema changed"),
        scan_exit=1,
        started_at=STARTED_AT,
        allow_nyiso_degraded=True,
    )
    assert not passed
