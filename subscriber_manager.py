#!/usr/bin/env python3
"""
Solar Sentinel — Subscriber Manager CLI

Manage paid subscribers, track MRR, and generate Telegram channel
configuration for config.yaml.

After a customer pays via Stripe Payment Link, use 'add' to grant
them access to the appropriate Telegram alert channel.

Usage:
    python subscriber_manager.py add                          # Interactive add
    python subscriber_manager.py add IL -1001234567890        # Quick add (single state)
    python subscriber_manager.py list                         # Show all subscribers
    python subscriber_manager.py remove <chat_id>             # Deactivate subscriber
    python subscriber_manager.py import <file.csv>            # Bulk import from CSV
    python subscriber_manager.py sync                         # Generate config.yaml snippet
    python subscriber_manager.py stats                        # Revenue dashboard
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.prompt import Prompt, Confirm
    from rich import box
except ImportError:
    print("ERROR: 'rich' library required. Run: pip install rich")
    sys.exit(1)

try:
    import yaml
except ImportError:
    print("ERROR: 'pyyaml' library required. Run: pip install pyyaml")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUBSCRIBERS_FILE = Path(__file__).resolve().parent / "subscribers.json"
CONFIG_FILE = Path(__file__).resolve().parent / "config.yaml"

VALID_STATE_CODES = {"IL", "IN", "TX", "CA", "NY", "NJ", "OH", "MA", "FL"}

STATE_NAMES = {
    "IL": "Illinois",
    "IN": "Indiana",
    "TX": "Texas",
    "CA": "California",
    "NY": "New York",
    "NJ": "New Jersey",
    "OH": "Ohio",
    "MA": "Massachusetts",
    "FL": "Florida",
}

# Monthly tiers
TIER_INFO = {
    "single":   {"price": 49,  "label": "Single State",   "states": 1},
    "bundle_5": {"price": 99,  "label": "5-State Bundle",  "states": 5},
    "all_8":    {"price": 119, "label": "All 8 Markets",   "states": 8},
    "all_9":    {"price": 149, "label": "All 9 Markets",   "states": 9},
}

# Annual tiers (10 months = 2 months free)
TIER_INFO_ANNUAL = {
    "single_annual":   {"price": 490,  "label": "Single State (Annual)",   "states": 1,  "monthly_equiv": 49},
    "bundle_5_annual": {"price": 990,  "label": "5-State Bundle (Annual)",  "states": 5,  "monthly_equiv": 99},
    "all_8_annual":    {"price": 1190, "label": "All 8 Markets (Annual)",  "states": 8,  "monthly_equiv": 119},
    "all_9_annual":    {"price": 1490, "label": "All 9 Markets (Annual)",  "states": 9,  "monthly_equiv": 149},
}

# Add-ons pricing
ADDONS = {
    "api_access":       {"price": 99,  "label": "API Access",       "link": "https://buy.stripe.com/28EaEW4Nv9SWaAXgh6cMM0d"},
    "custom_filter":    {"price": 29,  "label": "Custom Capacity Filter", "link": "https://buy.stripe.com/8x214ma7P6GK24r8OEcMM0c"},
    "email_digest":     {"price": 19,  "label": "Weekly Email Digest", "link": "https://buy.stripe.com/8x2dR80xf3uyeRdd4UcMM0b"},
    "priority":         {"price": 49,  "label": "Priority Processing", "link": "https://buy.stripe.com/eVq3cu7ZH3uy5gD6GwcMM0a"},
}

# Free tier
FREE_TIER = {"price": 0, "label": "Free Trial", "states": 1}

# One-time services
ONE_TIME_SERVICES = {
    "quick_start":      {"price": 149,  "label": "Quick Start Setup",     "link": "https://buy.stripe.com/5kQ9AS3Jr6GK9wT5CscMM09"},
    "custom_integrate": {"price": 499,  "label": "Custom Integration",   "link": "https://buy.stripe.com/14A00i93Lfdg8sP8OEcMM07"},
    "training":         {"price": 199,  "label": "Training Session",     "link": "https://buy.stripe.com/eVqeVcfs91mqcJ5c0QcMM08"},
}

# Enterprise tiers
ENTERPRISE_TIERS = {
    "enterprise_small":  {"price": 499,  "label": "Enterprise Small",   "seats": 3},
    "enterprise_medium": {"price": 999,  "label": "Enterprise Medium",  "seats": 10},
    "enterprise_large":  {"price": 1499, "label": "Enterprise Large",   "seats": 25},
}

# White-Label / Reseller
WHITELABEL_TIER = {
    "whitelabel": {"price": 999, "label": "White-Label Partner", "min_commitment": "12 months"}
}

# Construction Progress Monitoring
CONSTRUCTION_MONITORING = {
    "construction_basic":    {"price": 99,  "label": "Construction Progress (Basic)", "frequency": "monthly"},
    "construction_advanced": {"price": 199, "label": "Construction Progress (Advanced)", "frequency": "weekly"},
}

# Market Intelligence Reports
MARKET_REPORTS = {
    "report_monthly":    {"price": 299, "label": "Monthly Market Report", "frequency": "monthly"},
    "report_quarterly":  {"price": 499, "label": "Quarterly Deep Dive",   "frequency": "quarterly"},
}

# Florida Early Access
FLORIDA_EARLY_ACCESS = {
    "florida_early": {"price": 79, "label": "Florida Early Access", "states": 1}
}

# Payment links for reference
PAYMENT_LINKS = {
    # Monthly
    "single": "https://buy.stripe.com/28E28q0xfaX024r7KAcMM02",
    "bundle_5": "https://buy.stripe.com/eVqfZg7ZH8OS7oL9SIcMM01",
    "all_9": "https://buy.stripe.com/fZu14mbbT6GKgZlgh6cMM00",
    # Annual
    "single_annual": "https://buy.stripe.com/6oU3cubbT1mqcJ5c0QcMM05",
    "bundle_5_annual": "https://buy.stripe.com/6oU4gy5Rz6GKaAXd4UcMM04",
    "all_9_annual": "https://buy.stripe.com/eVqdR85Rz1mq10nfd2cMM03",
    # Free trial
    "free_trial": "https://buy.stripe.com/28E7sKbbT3uygZlfd2cMM06",
    # Add-ons
    "api_access": "https://buy.stripe.com/28EaEW4Nv9SWaAXgh6cMM0d",
    "custom_filter": "https://buy.stripe.com/8x214ma7P6GK24r8OEcMM0c",
    "email_digest": "https://buy.stripe.com/8x2dR80xf3uyeRdd4UcMM0b",
    "priority": "https://buy.stripe.com/eVq3cu7ZH3uy5gD6GwcMM0a",
    # One-time services
    "quick_start": "https://buy.stripe.com/5kQ9AS3Jr6GK9wT5CscMM09",
    "custom_integrate": "https://buy.stripe.com/14A00i93Lfdg8sP8OEcMM07",
    "training": "https://buy.stripe.com/eVqeVcfs91mqcJ5c0QcMM08",
    # New products
    "construction_basic": "https://buy.stripe.com/aFa14m93L5CG38v6GwcMM0i",
    "construction_advanced": "https://buy.stripe.com/00waEW5Rz5CG7oL6GwcMM0h",
    "report_monthly": "https://buy.stripe.com/00wcN43Jrd58eRde8YcMM0g",
    "report_quarterly": "https://buy.stripe.com/eVq14mdk15CG5gD9SIcMM0f",
    "florida_early": "https://buy.stripe.com/6oU4gyeo58OSdN91mccMM0e",
    "whitelabel": "https://buy.stripe.com/aFa8wO0xfe9c24re8YcMM0j",
}

console = Console()


# ---------------------------------------------------------------------------
# Data persistence
# ---------------------------------------------------------------------------

def _load_subscribers() -> list[dict[str, Any]]:
    """Load subscribers from JSON file. Returns empty list if missing."""
    if not SUBSCRIBERS_FILE.exists():
        return []
    try:
        with open(SUBSCRIBERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("subscribers", [])
    except (json.JSONDecodeError, KeyError):
        console.print("[red]Warning: subscribers.json is malformed. Starting fresh.[/red]")
        return []


def _save_subscribers(subscribers: list[dict[str, Any]]) -> None:
    """Write subscribers list back to JSON."""
    with open(SUBSCRIBERS_FILE, "w", encoding="utf-8") as f:
        json.dump({"subscribers": subscribers}, f, indent=2, ensure_ascii=False)


def _load_config() -> dict:
    """Load config.yaml for channel validation."""
    if not CONFIG_FILE.exists():
        return {}
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def _quick_add(state_code: str, chat_id: str) -> None:
    """Non-interactive add: creates a single-state subscriber in one command."""
    state_code = state_code.upper()
    if state_code not in VALID_STATE_CODES:
        console.print(f"[red]Invalid state code: {state_code}[/red]")
        console.print(f"[dim]Valid codes: {', '.join(sorted(VALID_STATE_CODES))}[/dim]")
        return

    existing = _load_subscribers()
    for sub in existing:
        if sub.get("telegram_chat_id") == chat_id and sub.get("active", True):
            console.print(
                f"[yellow]Chat ID {chat_id} already exists for {sub.get('name', 'unknown')}. "
                f"Skipping.[/yellow]"
            )
            return

    record = {
        "name": "",
        "email": "",
        "telegram_chat_id": chat_id,
        "states": [state_code],
        "tier": "single",
        "added": date.today().isoformat(),
        "active": True,
    }
    existing.append(record)
    _save_subscribers(existing)

    state_name = STATE_NAMES.get(state_code, state_code)
    console.print()
    console.print(Panel(
        f"[green bold]Subscriber added[/green bold]\n\n"
        f"[bold]Chat ID:[/bold]  {chat_id}\n"
        f"[bold]State:[/bold]    {state_code} ({state_name})\n"
        f"[bold]Tier:[/bold]     Single State ($49/mo)\n"
        f"[bold]Added:[/bold]    {record['added']}",
        box=box.ROUNDED,
        border_style="green",
    ))
    console.print()
    console.print(
        "[yellow bold]Next step:[/yellow bold] Run [cyan]python subscriber_manager.py sync[/cyan] "
        "to generate the updated Telegram channel config, then paste it into config.yaml."
    )
    console.print()


def cmd_add(args: argparse.Namespace) -> None:
    """Add a new subscriber — quick mode or interactive."""
    # Quick-add: both positional args provided.
    if args.state is not None and args.chat_id is not None:
        _quick_add(args.state, args.chat_id)
        return
    # Error: only one arg provided.
    if args.state is not None or args.chat_id is not None:
        console.print("[red]Both state and chat_id are required for quick-add mode.[/red]")
        console.print("[dim]Usage: python subscriber_manager.py add IL -1001234567890[/dim]")
        return
    # Interactive mode (existing behaviour).
    console.print()
    console.print(Panel(
        "[bold green]Add New Subscriber[/bold green]",
        subtitle="Solar Sentinel",
        box=box.DOUBLE,
    ))
    console.print()

    name = Prompt.ask("[bold]Subscriber name[/bold]")
    email = Prompt.ask("[bold]Email address[/bold]")
    chat_id = Prompt.ask("[bold]Telegram chat ID[/bold] (e.g. -1001234567890)")

    # Validate chat_id isn't already active.
    existing = _load_subscribers()
    for sub in existing:
        if sub.get("telegram_chat_id") == chat_id and sub.get("active", True):
            console.print(f"[yellow]Chat ID {chat_id} already exists for {sub['name']}.[/yellow]")
            if not Confirm.ask("Add duplicate anyway?", default=False):
                return

    # Tier selection.
    console.print()
    console.print("[bold]Select tier:[/bold]")
    for key, info in TIER_INFO.items():
        console.print(f"  [cyan]{key:<10}[/cyan] — {info['label']} — ${info['price']}/mo")
    console.print()
    console.print("[bold]Or annual billing (save 2 months):[/bold]")
    for key, info in TIER_INFO_ANNUAL.items():
        console.print(f"  [cyan]{key:<10}[/cyan] — {info['label']} — ${info['price']}/yr (${info['monthly_equiv']}/mo)")
    console.print()
    console.print("[bold]Or free trial:[/bold]")
    console.print(f"  [cyan]free_trial[/cyan] — Free Trial (14 days, IL only)")
    
    all_tiers = {**TIER_INFO, **TIER_INFO_ANNUAL, "free_trial": FREE_TIER}
    tier = Prompt.ask(
        "[bold]Tier[/bold]",
        choices=list(all_tiers.keys()),
        default="single",
    )

    # Billing cycle
    is_annual = tier in TIER_INFO_ANNUAL
    billing_cycle = "annual" if is_annual else "monthly"
    if tier == "free_trial":
        billing_cycle = "free_trial"

    # Add-ons (not for free tier)
    selected_addons = []
    if tier != "free_trial":
        console.print()
        console.print("[bold]Add-ons (optional):[/bold]")
        for key, info in ADDONS.items():
            console.print(f"  [cyan]{key:<12}[/cyan] — {info['label']} — +${info['price']}/mo")
        console.print("[dim]Enter addon codes separated by commas (or press Enter to skip)[/dim]")
        addons_input = Prompt.ask("[bold]Add-ons[/bold]", default="")
        if addons_input.strip():
            selected_addons = [a.strip() for a in addons_input.split(",") if a.strip() in ADDONS]
            # Validate
            invalid = [a for a in selected_addons if a not in ADDONS]
            if invalid:
                console.print(f"[yellow]Invalid add-ons ignored: {', '.join(invalid)}[/yellow]")
                selected_addons = [a for a in selected_addons if a in ADDONS]

    # State selection.
    console.print()
    console.print(f"[bold]States to include[/bold] (comma-separated codes: {', '.join(sorted(VALID_STATE_CODES))})")
    states_raw = Prompt.ask("[bold]States[/bold]", default="IL")
    states = [s.strip().upper() for s in states_raw.split(",") if s.strip()]

    invalid = [s for s in states if s not in VALID_STATE_CODES]
    if invalid:
        console.print(f"[red]Invalid state codes: {', '.join(invalid)}[/red]")
        console.print(f"[dim]Valid codes: {', '.join(sorted(VALID_STATE_CODES))}[/dim]")
        return

    # Custom capacity filter threshold
    custom_min_mw = None
    if "custom_filter" in selected_addons:
        console.print()
        console.print(
            "[bold]Custom Capacity Filter:[/bold] Only deliver projects above this MW threshold."
        )
        mw_input = Prompt.ask("[bold]Minimum MW threshold[/bold]", default="50")
        try:
            custom_min_mw = float(mw_input)
        except ValueError:
            console.print("[yellow]Invalid number, defaulting to 50 MW.[/yellow]")
            custom_min_mw = 50.0

    console.print()
    console.print("[bold]Personalized alert filters[/bold] [dim](press Enter to use the defaults)[/dim]")
    generation_input = Prompt.ask(
        "[bold]Technologies[/bold]",
        default="solar,battery,bess,photovoltaic,storage,sun,bat",
    )
    change_input = Prompt.ask(
        "[bold]Change types[/bold]",
        default="NEW,CHANGED,WITHDRAWN",
    )
    counties_input = Prompt.ask(
        "[bold]Counties[/bold] [dim](optional, comma-separated)[/dim]",
        default="",
    )
    keywords_input = Prompt.ask(
        "[bold]Project/developer keywords[/bold] [dim](optional)[/dim]",
        default="",
    )

    personalized_filters = {
        "states": states,
        "generation_types": [item.strip() for item in generation_input.split(",") if item.strip()],
        "change_types": [item.strip().upper() for item in change_input.split(",") if item.strip()],
        "counties": [item.strip() for item in counties_input.split(",") if item.strip()],
        "keywords": [item.strip() for item in keywords_input.split(",") if item.strip()],
        "min_capacity_mw": custom_min_mw if custom_min_mw is not None else 5.0,
    }

    # Build record.
    record = {
        "name": name,
        "email": email,
        "telegram_chat_id": chat_id,
        "states": states,
        "tier": tier,
        "billing_cycle": billing_cycle,
        "addons": selected_addons,
        "added": date.today().isoformat(),
        "active": True,
        "filters": personalized_filters,
    }
    if custom_min_mw is not None:
        record["custom_min_mw"] = custom_min_mw

    existing.append(record)

    # Calculate total price
    tier_data = all_tiers.get(tier, {"price": 0, "label": "Unknown"})
    base_price = tier_data.get("monthly_equiv", tier_data.get("price", 0))
    addons_price = sum(ADDONS.get(a, {}).get("price", 0) for a in selected_addons)
    total_monthly = base_price + addons_price
    _save_subscribers(existing)

    # Confirmation.
    state_labels = ", ".join(f"{s} ({STATE_NAMES.get(s, s)})" for s in states)
    tier_info = all_tiers.get(tier, {"label": tier, "price": 0})

    addons_labels = ", ".join(ADDONS.get(a, {}).get("label", a) for a in selected_addons) if selected_addons else "None"

    console.print()
    console.print(Panel(
        f"[green bold]Subscriber added successfully[/green bold]\n\n"
        f"[bold]Name:[/bold]       {name}\n"
        f"[bold]Email:[/bold]      {email}\n"
        f"[bold]Chat ID:[/bold]   {chat_id}\n"
        f"[bold]Tier:[/bold]       {tier_info['label']}\n"
        f"[bold]Billing:[/bold]    {billing_cycle.replace('_', ' ').title()}\n"
        f"[bold]Add-ons:[/bold]    {addons_labels}\n"
        f"[bold]States:[/bold]     {state_labels}\n"
        f"[bold]Monthly Total:[/bold] ${total_monthly}/mo\n"
        f"[bold]Added:[/bold]      {record['added']}",
        box=box.ROUNDED,
        border_style="green",
    ))

    console.print()
    console.print(
        "[yellow bold]Next step:[/yellow bold] Run [cyan]python subscriber_manager.py sync[/cyan] "
        "to generate the updated Telegram channel config, then paste it into config.yaml."
    )
    console.print()


def cmd_remove(args: argparse.Namespace) -> None:
    """Soft-delete a subscriber by chat ID."""
    chat_id = args.chat_id
    subscribers = _load_subscribers()

    found = False
    for sub in subscribers:
        if sub.get("telegram_chat_id") == chat_id and sub.get("active", True):
            sub["active"] = False
            sub["deactivated"] = date.today().isoformat()
            found = True
            console.print(
                f"[yellow]Deactivated:[/yellow] {sub['name']} ({sub['email']}) — "
                f"chat_id {chat_id}"
            )

    if not found:
        console.print(f"[red]No active subscriber found with chat_id: {chat_id}[/red]")
        return

    _save_subscribers(subscribers)
    console.print()
    console.print(
        "[yellow bold]Next step:[/yellow bold] Run [cyan]python subscriber_manager.py sync[/cyan] "
        "and update config.yaml to remove their channel access."
    )


def cmd_list(_args: argparse.Namespace) -> None:
    """Display all subscribers in a rich table."""
    subscribers = _load_subscribers()

    if not subscribers:
        console.print("[dim]No subscribers yet. Run [cyan]python subscriber_manager.py add[/cyan] to get started.[/dim]")
        return

    table = Table(
        title="Solar Sentinel Subscribers",
        box=box.SIMPLE_HEAVY,
        show_lines=True,
    )
    table.add_column("#", style="dim", width=3)
    table.add_column("Name", style="bold")
    table.add_column("Email")
    table.add_column("Chat ID", style="cyan")
    table.add_column("States")
    table.add_column("Tier")
    table.add_column("Billing")
    table.add_column("Add-ons")
    table.add_column("$/mo", justify="right")
    table.add_column("Active", justify="center")
    table.add_column("Added")

    active_count = 0
    total_mrr = 0
    annual_count = 0
    total_arr = 0

    for i, sub in enumerate(subscribers, 1):
        is_active = sub.get("active", True)
        tier_key = sub.get("tier", "single")
        
        # Get tier info (monthly or annual)
        if tier_key in TIER_INFO_ANNUAL:
            tier_data = TIER_INFO_ANNUAL[tier_key]
            billing = "Annual"
            base_monthly = tier_data.get("monthly_equiv", 0)
        elif tier_key in TIER_INFO:
            tier_data = TIER_INFO[tier_key]
            billing = "Monthly"
            base_monthly = tier_data.get("price", 0)
        elif tier_key == "free_trial":
            tier_data = FREE_TIER
            billing = "Free"
            base_monthly = 0
        else:
            tier_data = {"label": tier_key, "price": 0}
            billing = "Unknown"
            base_monthly = 0
        
        tier_label = tier_data.get("label", tier_key)

        # Calculate add-ons
        addons = sub.get("addons", [])
        addons_price = sum(ADDONS.get(a, {}).get("price", 0) for a in addons)
        addons_label = ", ".join(ADDONS.get(a, {}).get("label", a)[:15] for a in addons) if addons else "—"
        
        total_monthly = base_monthly + addons_price

        if is_active:
            active_count += 1
            if billing == "Annual":
                annual_count += 1
                total_arr += tier_data.get("price", 0)  # Annual price
                total_mrr += base_monthly  # Convert to monthly for MRR
            else:
                total_mrr += total_monthly
                total_arr += total_monthly * 12
            active_str = "[green]Yes[/green]"
        else:
            active_str = "[red]No[/red]"

        states_str = ", ".join(sub.get("states", []))

        table.add_row(
            str(i),
            sub.get("name", "—"),
            sub.get("email", "—"),
            sub.get("telegram_chat_id", "—"),
            states_str,
            tier_label,
            billing,
            addons_label,
            f"${total_monthly}",
            active_str,
            sub.get("added", "—"),
        )

    console.print()
    console.print(table)
    console.print()
    console.print(
        f"[bold]Active subscribers:[/bold] {active_count}  |  "
        f"[bold green]MRR:[/bold green] [bold]${total_mrr:,}/mo[/bold]  |  "
        f"[bold]ARR:[/bold] ${total_arr:,}/yr  |  "
        f"[bold]Annual:[/bold] {annual_count}"
    )
    console.print()


def cmd_import(args: argparse.Namespace) -> None:
    """Bulk import subscribers from a CSV file.

    CSV columns: name, email, telegram_chat_id, states, tier
    States column should be semicolon-separated (e.g. "IL;TX;CA").
    """
    csv_path = Path(args.file)
    if not csv_path.exists():
        console.print(f"[red]File not found: {csv_path}[/red]")
        return

    existing = _load_subscribers()
    existing_ids = {s["telegram_chat_id"] for s in existing if s.get("active", True)}
    imported = 0
    skipped = 0

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            chat_id = row.get("telegram_chat_id", "").strip()
            if not chat_id:
                skipped += 1
                continue
            if chat_id in existing_ids:
                console.print(f"[dim]Skipping duplicate: {chat_id}[/dim]")
                skipped += 1
                continue

            states_raw = row.get("states", "IL")
            states = [s.strip().upper() for s in states_raw.replace(";", ",").split(",") if s.strip()]

            record = {
                "name": row.get("name", "").strip(),
                "email": row.get("email", "").strip(),
                "telegram_chat_id": chat_id,
                "states": states,
                "tier": row.get("tier", "single").strip(),
                "added": date.today().isoformat(),
                "active": True,
            }
            existing.append(record)
            existing_ids.add(chat_id)
            imported += 1

    _save_subscribers(existing)
    console.print(f"[green]Imported {imported} subscribers[/green] ({skipped} skipped)")
    if imported > 0:
        console.print(
            "[yellow bold]Next step:[/yellow bold] Run [cyan]python subscriber_manager.py sync[/cyan] "
            "to update config.yaml."
        )


def cmd_sync(_args: argparse.Namespace) -> None:
    """Generate a config.yaml-compatible Telegram channels snippet.

    Reads all active subscribers, groups their chat_ids by state,
    and prints the YAML you should paste into config.yaml under
    the telegram.channels section.

    For single-state subscribers, the chat_id IS the per-state channel.
    For bundles/all-access, they should be added to the 'all' channel.
    """
    subscribers = _load_subscribers()
    active = [s for s in subscribers if s.get("active", True)]

    if not active:
        console.print("[dim]No active subscribers.[/dim]")
        return

    # Load current config for reference.
    config = _load_config()
    current_channels = config.get("telegram", {}).get("channels", {})

    # Group subscribers by state.
    state_chat_ids: dict[str, list[str]] = {}
    all_chat_ids: list[str] = []

    for sub in active:
        chat_id = sub.get("telegram_chat_id", "")
        tier = sub.get("tier", "single")
        states = sub.get("states", [])

        # All-access and bundle subscribers go to the "all" channel.
        if tier in ("all_9", "bundle_5"):
            if chat_id not in all_chat_ids:
                all_chat_ids.append(chat_id)

        # Per-state routing for single-state subscribers.
        for state_code in states:
            if state_code not in state_chat_ids:
                state_chat_ids[state_code] = []
            if chat_id not in state_chat_ids[state_code]:
                state_chat_ids[state_code].append(chat_id)

    console.print()
    console.print(Panel(
        "[bold]config.yaml Channel Mapping[/bold]\n\n"
        "Paste the following into your config.yaml under [cyan]telegram.channels[/cyan].\n"
        "If a state has multiple subscribers, create a shared Telegram group/channel\n"
        "and use that group's chat_id.",
        box=box.ROUNDED,
        border_style="blue",
    ))
    console.print()

    # Print the YAML snippet.
    lines = ["telegram:", "  channels:"]

    all_channel = current_channels.get("all", "SET_YOUR_ALL_ALERTS_CHANNEL_HERE")
    lines.append(f'    all: "{all_channel}"')

    for state_code in sorted(state_chat_ids.keys()):
        ids = state_chat_ids[state_code]
        current = current_channels.get(state_code, "")
        if len(ids) == 1 and not current:
            lines.append(f'    {state_code}: "{ids[0]}"  # {STATE_NAMES.get(state_code, state_code)}')
        elif current:
            lines.append(f'    {state_code}: "{current}"  # {STATE_NAMES.get(state_code, state_code)} ({len(ids)} subscribers)')
        else:
            lines.append(f'    {state_code}: "CREATE_SHARED_CHANNEL"  # {STATE_NAMES.get(state_code, state_code)} ({len(ids)} subscribers)')

    snippet = "\n".join(lines)
    console.print(f"[green]{snippet}[/green]")
    console.print()

    # Summary.
    console.print(f"[bold]Active subscribers:[/bold] {len(active)}")
    console.print(f"[bold]States with subscribers:[/bold] {', '.join(sorted(state_chat_ids.keys()))}")
    if all_chat_ids:
        console.print(f"[bold]All-access / bundle subscribers:[/bold] {len(all_chat_ids)}")
    console.print()


def cmd_stats(_args: argparse.Namespace) -> None:
    """Revenue dashboard."""
    subscribers = _load_subscribers()
    active = [s for s in subscribers if s.get("active", True)]
    inactive = [s for s in subscribers if not s.get("active", True)]

    if not subscribers:
        console.print("[dim]No subscribers yet.[/dim]")
        return

    # Revenue by tier.
    tier_counts: dict[str, int] = {}
    tier_revenue: dict[str, int] = {}
    for sub in active:
        tier = sub.get("tier", "single")
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        tier_revenue[tier] = tier_revenue.get(tier, 0) + TIER_INFO.get(tier, {}).get("price", 0)

    total_mrr = sum(tier_revenue.values())

    # Revenue by state.
    state_sub_count: dict[str, int] = {}
    for sub in active:
        for state in sub.get("states", []):
            state_sub_count[state] = state_sub_count.get(state, 0) + 1

    console.print()
    console.print(Panel(
        "[bold green]Solar Sentinel Revenue Dashboard[/bold green]",
        box=box.DOUBLE,
    ))

    # Tier table.
    tier_table = Table(title="Revenue by Tier", box=box.SIMPLE)
    tier_table.add_column("Tier", style="bold")
    tier_table.add_column("Subscribers", justify="right")
    tier_table.add_column("MRR", justify="right", style="green")

    for key in ["single", "bundle_5", "all_9"]:
        count = tier_counts.get(key, 0)
        rev = tier_revenue.get(key, 0)
        label = TIER_INFO[key]["label"]
        tier_table.add_row(label, str(count), f"${rev:,}")

    tier_table.add_section()
    tier_table.add_row("[bold]Total[/bold]", f"[bold]{len(active)}[/bold]", f"[bold green]${total_mrr:,}[/bold green]")

    console.print(tier_table)
    console.print()

    # State popularity.
    if state_sub_count:
        state_table = Table(title="Subscribers by State", box=box.SIMPLE)
        state_table.add_column("State")
        state_table.add_column("Subscribers", justify="right")
        for code in sorted(state_sub_count, key=lambda k: state_sub_count[k], reverse=True):
            state_table.add_row(f"{code} ({STATE_NAMES.get(code, code)})", str(state_sub_count[code]))
        console.print(state_table)
        console.print()

    # Summary.
    console.print(f"[bold]MRR:[/bold]  [bold green]${total_mrr:,}/mo[/bold green]")
    console.print(f"[bold]ARR:[/bold]  [bold green]${total_mrr * 12:,}/yr[/bold green]")
    console.print(f"[bold]Active:[/bold] {len(active)}  |  [bold]Churned:[/bold] {len(inactive)}")
    console.print()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Solar Sentinel — Subscriber Manager",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python subscriber_manager.py add                       Interactive add\n"
            "  python subscriber_manager.py add IL -1001234567890     Quick add (single state)\n"
            "  python subscriber_manager.py list                      Show all subscribers with MRR\n"
            "  python subscriber_manager.py remove -100123            Deactivate subscriber by chat_id\n"
            "  python subscriber_manager.py import subs.csv           Bulk import from CSV\n"
            "  python subscriber_manager.py sync                      Generate config.yaml snippet\n"
            "  python subscriber_manager.py stats                     Revenue dashboard\n"
        ),
    )

    sub = parser.add_subparsers(dest="command", help="Available commands")

    # add
    p_add = sub.add_parser("add", help="Add a subscriber (quick or interactive)")
    p_add.add_argument("state", nargs="?", default=None,
                        help="State code for quick-add (e.g. IL, TX). Omit for interactive mode.")
    p_add.add_argument("chat_id", nargs="?", default=None,
                        help="Telegram chat_id for quick-add (e.g. -1001234567890)")

    # remove
    p_remove = sub.add_parser("remove", help="Deactivate a subscriber by Telegram chat_id")
    p_remove.add_argument("chat_id", help="Telegram chat_id to deactivate")

    # list
    sub.add_parser("list", help="List all subscribers with revenue")

    # import
    p_import = sub.add_parser("import", help="Bulk import from CSV file")
    p_import.add_argument("file", help="Path to CSV (columns: name,email,telegram_chat_id,states,tier)")

    # sync
    sub.add_parser("sync", help="Generate Telegram channel config for config.yaml")

    # stats
    sub.add_parser("stats", help="Revenue dashboard")

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        return 0

    commands = {
        "add": cmd_add,
        "remove": cmd_remove,
        "list": cmd_list,
        "import": cmd_import,
        "sync": cmd_sync,
        "stats": cmd_stats,
    }

    try:
        commands[args.command](args)
    except KeyboardInterrupt:
        console.print("\n[dim]Cancelled.[/dim]")
    except Exception as exc:
        console.print(f"[red bold]Error:[/red bold] {exc}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
