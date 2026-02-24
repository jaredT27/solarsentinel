#!/usr/bin/env python3
"""
Solar Sentinel — Weekly Email Digest

Aggregates the past week's interconnection queue changes and sends
an HTML summary email to subscribers with the email_digest add-on.

Run weekly via GitHub Actions (Monday 13:00 UTC) or manually:

    python email_digest.py              # Send digest to all email subscribers
    python email_digest.py --dry-run    # Print HTML to console, no emails sent
    python email_digest.py --debug      # Verbose logging
    python email_digest.py --force      # Send even if baselines don't exist
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import smtplib
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# ── Resolve project paths ───────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
BASELINE_DIR = DATA_DIR / "weekly_baselines"
SUBSCRIBERS_FILE = ROOT_DIR / "subscribers.json"
CONFIG_FILE = ROOT_DIR / "config.yaml"

log = logging.getLogger("email_digest")


# ═══════════════════════════════════════════════════════════════
# Dataclasses
# ═══════════════════════════════════════════════════════════════

@dataclass
class WeeklyISOSummary:
    """Aggregated weekly changes for a single ISO."""
    iso_name: str
    new_count: int = 0
    changed_count: int = 0
    withdrawn_count: int = 0
    new_projects: list[dict] = field(default_factory=list)
    changed_projects: list[dict] = field(default_factory=list)
    withdrawn_projects: list[dict] = field(default_factory=list)
    total_new_mw: float = 0.0


@dataclass
class DigestConfig:
    """Email digest configuration from config.yaml."""
    enabled: bool = True
    send_day: str = "monday"
    max_top_projects: int = 10
    subject_prefix: str = "Solar Sentinel"


# ═══════════════════════════════════════════════════════════════
# Config & subscriber loading
# ═══════════════════════════════════════════════════════════════

def load_digest_config() -> DigestConfig:
    """Load email_digest section from config.yaml."""
    if not CONFIG_FILE.exists():
        return DigestConfig()
    try:
        import yaml
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        section = raw.get("email_digest", {})
        return DigestConfig(
            enabled=section.get("enabled", True),
            send_day=section.get("send_day", "monday"),
            max_top_projects=section.get("max_top_projects", 10),
            subject_prefix=section.get("subject_prefix", "Solar Sentinel"),
        )
    except Exception as exc:
        log.warning("Failed to load digest config: %s -- using defaults", exc)
        return DigestConfig()


def load_email_subscribers() -> list[dict[str, Any]]:
    """Load subscribers who have the email_digest add-on and a valid email."""
    if not SUBSCRIBERS_FILE.exists():
        log.warning("subscribers.json not found at %s", SUBSCRIBERS_FILE)
        return []
    try:
        with open(SUBSCRIBERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        all_subs = data.get("subscribers", [])
    except (json.JSONDecodeError, KeyError) as exc:
        log.error("Malformed subscribers.json: %s", exc)
        return []

    eligible = []
    for sub in all_subs:
        if not sub.get("active", True):
            continue
        addons = sub.get("addons", [])
        email = sub.get("email", "").strip()
        if "email_digest" in addons and email:
            eligible.append(sub)
    return eligible


def get_monitored_isos() -> list[str]:
    """Return list of ISO names from config.yaml states."""
    if not CONFIG_FILE.exists():
        return ["MISO", "ERCOT", "CAISO", "NYISO", "PJM", "ISONE"]
    try:
        import yaml
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        states = raw.get("states", [])
        isos = set()
        for s in states:
            iso = s.get("iso")
            if iso:
                isos.add(iso)
        return sorted(isos)
    except Exception:
        return ["MISO", "ERCOT", "CAISO", "NYISO", "PJM", "ISONE"]


# ═══════════════════════════════════════════════════════════════
# Snapshot & baseline I/O
# ═══════════════════════════════════════════════════════════════

def load_snapshot(iso_name: str) -> dict[str, dict]:
    """Load the current daily snapshot for an ISO."""
    path = DATA_DIR / f"snapshot_{iso_name}.json"
    if not path.exists():
        log.debug("No snapshot found for %s", iso_name)
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_baseline(iso_name: str) -> dict[str, dict]:
    """Load the weekly baseline for an ISO."""
    path = BASELINE_DIR / f"baseline_{iso_name}.json"
    if not path.exists():
        log.debug("No baseline found for %s -- first digest run", iso_name)
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_baseline(iso_name: str, data: dict[str, dict]) -> None:
    """Save current snapshot as the new weekly baseline."""
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    path = BASELINE_DIR / f"baseline_{iso_name}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    log.info("Saved baseline: %s (%d projects)", path.name, len(data))


# ═══════════════════════════════════════════════════════════════
# Diff engine
# ═══════════════════════════════════════════════════════════════

def _safe_float(val: Any) -> float:
    """Safely convert to float, returning 0.0 for None/NaN/invalid."""
    if val is None:
        return 0.0
    try:
        f = float(val)
        return 0.0 if f != f else f  # NaN check
    except (ValueError, TypeError):
        return 0.0


def compute_weekly_diff(iso_name: str) -> WeeklyISOSummary:
    """Diff current snapshot against weekly baseline for one ISO."""
    current = load_snapshot(iso_name)
    baseline = load_baseline(iso_name)
    summary = WeeklyISOSummary(iso_name=iso_name)

    if not current:
        log.warning("No current snapshot for %s -- skipping", iso_name)
        return summary

    # New projects: in current but not in baseline.
    for qid, proj in current.items():
        if qid not in baseline:
            summary.new_projects.append(proj)
            summary.total_new_mw += _safe_float(proj.get("Capacity (MW)", 0))
    summary.new_count = len(summary.new_projects)

    # Changed projects: capacity or status changed.
    for qid, proj in current.items():
        if qid in baseline:
            old = baseline[qid]
            old_cap = _safe_float(old.get("Capacity (MW)", 0))
            new_cap = _safe_float(proj.get("Capacity (MW)", 0))
            old_status = str(old.get("Status", "")).strip().lower()
            new_status = str(proj.get("Status", "")).strip().lower()

            if old_cap != new_cap or old_status != new_status:
                change = {
                    **proj,
                    "_old_capacity": old_cap,
                    "_old_status": old.get("Status", ""),
                }
                summary.changed_projects.append(change)
    summary.changed_count = len(summary.changed_projects)

    # Withdrawn: disappeared from snapshot or status flipped to withdrawn.
    for qid, proj in baseline.items():
        if qid not in current:
            summary.withdrawn_projects.append(proj)
        elif str(current[qid].get("Status", "")).strip().lower() == "withdrawn":
            if str(proj.get("Status", "")).strip().lower() != "withdrawn":
                summary.withdrawn_projects.append(current[qid])
    summary.withdrawn_count = len(summary.withdrawn_projects)

    log.info(
        "%s weekly diff: %d new (+%.0f MW), %d changed, %d withdrawn",
        iso_name, summary.new_count, summary.total_new_mw,
        summary.changed_count, summary.withdrawn_count,
    )
    return summary


# ═══════════════════════════════════════════════════════════════
# HTML email builder
# ═══════════════════════════════════════════════════════════════

def build_email_html(
    summaries: list[WeeklyISOSummary],
    week_start: date,
    week_end: date,
    subscriber_name: str,
    config: DigestConfig,
    custom_min_mw: float | None = None,
) -> str:
    """Build the weekly digest HTML email with inline CSS."""

    # ── Aggregate totals ─────────────────────────────────────
    total_new = sum(s.new_count for s in summaries)
    total_changed = sum(s.changed_count for s in summaries)
    total_withdrawn = sum(s.withdrawn_count for s in summaries)
    total_mw = sum(s.total_new_mw for s in summaries)

    # ── Top new projects (sorted by MW desc) ─────────────────
    all_new: list[dict] = []
    for s in summaries:
        for p in s.new_projects:
            cap = _safe_float(p.get("Capacity (MW)", 0))
            if custom_min_mw and cap < custom_min_mw:
                continue
            all_new.append({**p, "_iso": s.iso_name})
    all_new.sort(key=lambda p: _safe_float(p.get("Capacity (MW)", 0)), reverse=True)
    top_projects = all_new[: config.max_top_projects]

    # ── Notable withdrawals (50+ MW) ─────────────────────────
    notable_withdrawn: list[dict] = []
    for s in summaries:
        for p in s.withdrawn_projects:
            if _safe_float(p.get("Capacity (MW)", 0)) >= 50:
                notable_withdrawn.append({**p, "_iso": s.iso_name})
    notable_withdrawn.sort(
        key=lambda p: _safe_float(p.get("Capacity (MW)", 0)), reverse=True
    )

    week_range = (
        f"{week_start.strftime('%b %d')} - {week_end.strftime('%b %d, %Y')}"
    )
    greeting = f"Hi {subscriber_name}," if subscriber_name else "Hi there,"

    # ── Assemble HTML ────────────────────────────────────────
    html_parts: list[str] = []

    html_parts.append(f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"
       style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:20px 10px;">

<!-- Main container -->
<table role="presentation" width="600" cellspacing="0" cellpadding="0"
       style="background-color:#ffffff;border-radius:8px;overflow:hidden;">

<!-- Header -->
<tr><td style="background-color:#1a1a2e;padding:30px 40px;text-align:center;">
  <h1 style="color:#f0c040;margin:0;font-size:24px;letter-spacing:1px;">
    &#9728;&#65039; Solar Sentinel
  </h1>
  <p style="color:#cccccc;margin:8px 0 0;font-size:14px;">
    Weekly Interconnection Queue Digest
  </p>
  <p style="color:#999999;margin:4px 0 0;font-size:12px;">{week_range}</p>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:30px 40px 10px;">
  <p style="color:#333;font-size:15px;line-height:1.5;margin:0;">
    {greeting}
  </p>
  <p style="color:#333;font-size:15px;line-height:1.5;margin:10px 0 0;">
    Here's your weekly summary of solar and BESS interconnection queue
    activity across all monitored ISOs.
  </p>
</td></tr>

<!-- Summary stat boxes -->
<tr><td style="padding:10px 40px 20px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
  <tr>
    <td width="30%" align="center"
        style="padding:15px 5px;background-color:#e8f5e9;border-radius:6px;">
      <div style="font-size:28px;font-weight:bold;color:#2e7d32;">
        {total_new:,}
      </div>
      <div style="font-size:11px;color:#666;text-transform:uppercase;
                  letter-spacing:1px;">New Projects</div>
    </td>
    <td width="5%"></td>
    <td width="30%" align="center"
        style="padding:15px 5px;background-color:#e3f2fd;border-radius:6px;">
      <div style="font-size:28px;font-weight:bold;color:#1565c0;">
        {total_changed:,}
      </div>
      <div style="font-size:11px;color:#666;text-transform:uppercase;
                  letter-spacing:1px;">Updated</div>
    </td>
    <td width="5%"></td>
    <td width="30%" align="center"
        style="padding:15px 5px;background-color:#fff3e0;border-radius:6px;">
      <div style="font-size:28px;font-weight:bold;color:#e65100;">
        {total_withdrawn:,}
      </div>
      <div style="font-size:11px;color:#666;text-transform:uppercase;
                  letter-spacing:1px;">Withdrawn</div>
    </td>
  </tr>
  </table>
  <p style="text-align:center;color:#888;font-size:12px;margin:10px 0 0;">
    Total new capacity: <strong>{total_mw:,.0f} MW</strong>
  </p>
</td></tr>""")

    # ── Per-ISO breakdown table ──────────────────────────────
    html_parts.append("""
<!-- Per-ISO Breakdown -->
<tr><td style="padding:10px 40px;">
  <h2 style="color:#1a1a2e;font-size:16px;border-bottom:2px solid #f0c040;
             padding-bottom:6px;margin:0 0 12px;">
    Breakdown by ISO
  </h2>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="8"
         style="font-size:13px;border-collapse:collapse;">
  <tr style="background-color:#f8f8f8;">
    <th align="left"  style="padding:8px;border-bottom:1px solid #ddd;color:#555;">ISO</th>
    <th align="right" style="padding:8px;border-bottom:1px solid #ddd;color:#555;">New</th>
    <th align="right" style="padding:8px;border-bottom:1px solid #ddd;color:#555;">Updated</th>
    <th align="right" style="padding:8px;border-bottom:1px solid #ddd;color:#555;">Withdrawn</th>
    <th align="right" style="padding:8px;border-bottom:1px solid #ddd;color:#555;">New MW</th>
  </tr>""")

    for s in summaries:
        if s.new_count == 0 and s.changed_count == 0 and s.withdrawn_count == 0:
            continue
        html_parts.append(f"""
  <tr>
    <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">
      {s.iso_name}</td>
    <td align="right" style="padding:8px;border-bottom:1px solid #eee;
        color:#2e7d32;">{s.new_count}</td>
    <td align="right" style="padding:8px;border-bottom:1px solid #eee;
        color:#1565c0;">{s.changed_count}</td>
    <td align="right" style="padding:8px;border-bottom:1px solid #eee;
        color:#e65100;">{s.withdrawn_count}</td>
    <td align="right" style="padding:8px;border-bottom:1px solid #eee;">
      {s.total_new_mw:,.0f}</td>
  </tr>""")

    html_parts.append("""
  </table>
</td></tr>""")

    # ── Top new projects ─────────────────────────────────────
    if top_projects:
        html_parts.append(f"""
<!-- Top New Projects -->
<tr><td style="padding:20px 40px 10px;">
  <h2 style="color:#1a1a2e;font-size:16px;border-bottom:2px solid #f0c040;
             padding-bottom:6px;margin:0 0 12px;">
    Top {len(top_projects)} Largest New Projects
  </h2>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="6"
         style="font-size:12px;border-collapse:collapse;">
  <tr style="background-color:#f8f8f8;">
    <th align="left"  style="padding:6px;border-bottom:1px solid #ddd;
        color:#555;">Project</th>
    <th align="left"  style="padding:6px;border-bottom:1px solid #ddd;
        color:#555;">State</th>
    <th align="right" style="padding:6px;border-bottom:1px solid #ddd;
        color:#555;">MW</th>
    <th align="left"  style="padding:6px;border-bottom:1px solid #ddd;
        color:#555;">Type</th>
    <th align="left"  style="padding:6px;border-bottom:1px solid #ddd;
        color:#555;">ISO</th>
  </tr>""")

        for p in top_projects:
            name = _esc(str(p.get("Project Name", p.get("Queue ID", "Unknown")))[:40])
            state = _esc(str(p.get("State", "--")))
            cap = _safe_float(p.get("Capacity (MW)", 0))
            gen_type = _esc(
                str(p.get("Generation Type", p.get("Type", "--")))[:18]
            )
            iso = p.get("_iso", "--")
            html_parts.append(f"""
  <tr>
    <td style="padding:6px;border-bottom:1px solid #eee;">{name}</td>
    <td style="padding:6px;border-bottom:1px solid #eee;">{state}</td>
    <td align="right" style="padding:6px;border-bottom:1px solid #eee;
        font-weight:bold;">{cap:,.0f}</td>
    <td style="padding:6px;border-bottom:1px solid #eee;">{gen_type}</td>
    <td style="padding:6px;border-bottom:1px solid #eee;">{iso}</td>
  </tr>""")

        html_parts.append("""
  </table>
</td></tr>""")

    # ── Notable withdrawals ──────────────────────────────────
    if notable_withdrawn:
        html_parts.append("""
<!-- Notable Withdrawals -->
<tr><td style="padding:20px 40px 10px;">
  <h2 style="color:#1a1a2e;font-size:16px;border-bottom:2px solid #e65100;
             padding-bottom:6px;margin:0 0 12px;">
    Notable Withdrawals (50+ MW)
  </h2>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="6"
         style="font-size:12px;border-collapse:collapse;">
  <tr style="background-color:#fff3e0;">
    <th align="left"  style="padding:6px;border-bottom:1px solid #ddd;
        color:#555;">Project</th>
    <th align="left"  style="padding:6px;border-bottom:1px solid #ddd;
        color:#555;">State</th>
    <th align="right" style="padding:6px;border-bottom:1px solid #ddd;
        color:#555;">MW</th>
    <th align="left"  style="padding:6px;border-bottom:1px solid #ddd;
        color:#555;">ISO</th>
  </tr>""")

        for p in notable_withdrawn[:5]:
            name = _esc(str(p.get("Project Name", p.get("Queue ID", "Unknown")))[:40])
            state = _esc(str(p.get("State", "--")))
            cap = _safe_float(p.get("Capacity (MW)", 0))
            iso = p.get("_iso", "--")
            html_parts.append(f"""
  <tr>
    <td style="padding:6px;border-bottom:1px solid #eee;">{name}</td>
    <td style="padding:6px;border-bottom:1px solid #eee;">{state}</td>
    <td align="right" style="padding:6px;border-bottom:1px solid #eee;
        font-weight:bold;">{cap:,.0f}</td>
    <td style="padding:6px;border-bottom:1px solid #eee;">{iso}</td>
  </tr>""")

        html_parts.append("""
  </table>
</td></tr>""")

    # ── Custom filter notice ─────────────────────────────────
    filter_note = ""
    if custom_min_mw:
        filter_note = (
            f'<p style="color:#888;font-size:11px;margin:10px 0 0;">'
            f"Filtered to projects &gt;= {custom_min_mw:.0f} MW "
            f"(Custom Capacity Filter)</p>"
        )

    # ── Footer ───────────────────────────────────────────────
    html_parts.append(f"""
<!-- Footer -->
<tr><td style="padding:30px 40px;background-color:#f8f8f8;
               border-top:1px solid #eee;">
  {filter_note}
  <p style="color:#888;font-size:11px;margin:0;line-height:1.6;">
    You're receiving this because you subscribed to Solar Sentinel's
    Weekly Email Digest add-on.<br>
    Questions? Reply to this email or contact jared@localmotionai.com
  </p>
  <p style="color:#aaa;font-size:10px;margin:10px 0 0;">
    Solar Sentinel | Interconnection Queue Intelligence<br>
    To unsubscribe, reply with "unsubscribe" in the subject line.
  </p>
</td></tr>

</table><!-- /Main container -->
</td></tr>
</table>
</body>
</html>""")

    return "\n".join(html_parts)


def _esc(text: str) -> str:
    """Minimal HTML escaping for user-generated content in emails."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# ═══════════════════════════════════════════════════════════════
# Email sender
# ═══════════════════════════════════════════════════════════════

def send_email(
    to_address: str,
    subject: str,
    html_body: str,
    gmail_user: str,
    gmail_app_password: str,
) -> bool:
    """Send an HTML email via Gmail SMTP.  Returns True on success."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Solar Sentinel <{gmail_user}>"
    msg["To"] = to_address

    # Plain-text fallback
    plain = (
        "Solar Sentinel Weekly Digest\n\n"
        "Your email client doesn't support HTML. "
        "Please view this email in a modern client.\n"
    )
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
            server.starttls()
            server.login(gmail_user, gmail_app_password)
            server.sendmail(gmail_user, to_address, msg.as_string())
        log.info("Sent digest to %s", to_address)
        return True
    except smtplib.SMTPAuthenticationError:
        log.error(
            "Gmail auth failed. Check GMAIL_USER and GMAIL_APP_PASSWORD in "
            ".env.  Use a Gmail App Password, not your regular password."
        )
        return False
    except smtplib.SMTPException as exc:
        log.error("SMTP error sending to %s: %s", to_address, exc)
        return False
    except Exception as exc:
        log.error("Unexpected error sending to %s: %s", to_address, exc)
        return False


# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Solar Sentinel -- Weekly Email Digest",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print HTML to console; don't send emails",
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Enable DEBUG-level logging",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Send even if no baselines exist or digest disabled",
    )
    args = parser.parse_args()

    # ── Logging ──────────────────────────────────────────────
    level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    log.info("=== Solar Sentinel Weekly Email Digest ===")

    # ── Load .env secrets ────────────────────────────────────
    load_dotenv(ROOT_DIR / ".env")

    # ── Load config ──────────────────────────────────────────
    config = load_digest_config()
    if not config.enabled and not args.force:
        log.info("Email digest disabled in config.yaml. Use --force to override.")
        return 0

    # ── Gmail credentials ────────────────────────────────────
    gmail_user = os.getenv("GMAIL_USER", "").strip()
    gmail_pass = os.getenv("GMAIL_APP_PASSWORD", "").strip()
    if not args.dry_run and (not gmail_user or not gmail_pass):
        log.error(
            "GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env or "
            "environment.  See .env.example for details."
        )
        return 1

    # ── Load subscribers ─────────────────────────────────────
    subscribers = load_email_subscribers()
    log.info("Found %d email digest subscriber(s)", len(subscribers))
    if not subscribers and not args.dry_run:
        log.info("No subscribers with email_digest add-on. Nothing to send.")
        return 0

    # ── Compute weekly diffs per ISO ─────────────────────────
    isos = get_monitored_isos()
    log.info("Processing ISOs: %s", ", ".join(isos))

    summaries: list[WeeklyISOSummary] = []
    for iso_name in isos:
        summaries.append(compute_weekly_diff(iso_name))

    total_events = sum(
        s.new_count + s.changed_count + s.withdrawn_count for s in summaries
    )
    if total_events == 0 and not args.force:
        log.info("No changes detected this week. Skipping digest.")
        return 0

    # ── Week range ───────────────────────────────────────────
    week_end = date.today()
    week_start = week_end - timedelta(days=7)
    subject = (
        f"{config.subject_prefix} Weekly Digest | "
        f"{week_start.strftime('%b %d')} - {week_end.strftime('%b %d, %Y')}"
    )

    # ── Build & send ─────────────────────────────────────────
    if args.dry_run:
        name = subscribers[0].get("name", "") if subscribers else "Test User"
        custom_min = None
        if subscribers:
            raw = subscribers[0].get("custom_min_mw")
            custom_min = _safe_float(raw) if raw is not None else None
        html = build_email_html(
            summaries, week_start, week_end, name, config, custom_min,
        )
        print("\n" + "=" * 60)
        print(f"Subject: {subject}")
        to = (
            subscribers[0].get("email", "test@example.com")
            if subscribers
            else "test@example.com"
        )
        print(f"To: {to}")
        print("=" * 60)
        print(html)
        print("=" * 60)
        log.info("Dry run complete. HTML printed above. No emails sent.")
    else:
        sent, failed = 0, 0
        for sub in subscribers:
            name = sub.get("name", "")
            email = sub.get("email", "")
            raw_min = sub.get("custom_min_mw")
            custom_min = _safe_float(raw_min) if raw_min is not None else None
            if custom_min is not None and custom_min <= 0:
                custom_min = None

            html = build_email_html(
                summaries, week_start, week_end, name, config, custom_min,
            )
            if send_email(email, subject, html, gmail_user, gmail_pass):
                sent += 1
            else:
                failed += 1
        log.info("Digest complete: %d sent, %d failed", sent, failed)

    # ── Save current snapshots as new weekly baselines ───────
    for iso_name in isos:
        current = load_snapshot(iso_name)
        if current:
            save_baseline(iso_name, current)

    log.info("Weekly baselines updated. Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
