# Solar Sentinel

**Daily interconnection queue intelligence for solar developers and EPCs.**

Know about every new solar and BESS project entering the queue across 9 US states — before your competitors do. Get satellite imagery, capacity data, and status changes delivered straight to Telegram every morning.

---

## What You Get

- **Daily alerts at 7 AM ET** — new projects, capacity changes, withdrawals, and study phase updates across MISO, ERCOT, CAISO, NYISO, PJM, and ISO-NE queues
- **Satellite imagery with every alert** — 640x360 cinematic satellite view with red pin marker showing the exact project location
- **9 high-demand markets** — Illinois, Indiana, Texas, California, New York, New Jersey, Ohio, Massachusetts (Florida coming soon)

---

## Example Alerts

Every alert is delivered as a Telegram message with an embedded satellite photo. Here's what they look like:

### New Project Alert

```
☀️  NEW Solar Project  #IL

🏗 Prairie Wind Solar Farm
Type: Solar
Capacity: 250 MW
County: McLean
State: Illinois
Status: Active
Queue Date: 2026-02-10
Queue ID: J-1247

🔗 View MISO Queue | 📍 Google Earth

[Attached: 640x360 satellite image with red pin on site]
```

### Capacity Change Alert

```
🔄  UPDATED Solar Project  #TX

🏗 Lone Star BESS II
Type: Battery Storage
Capacity: 400 MW
County: Pecos
State: Texas
Status: Active
Queue Date: 2025-08-22
Queue ID: 24INR0089

Δ Changes: Capacity: 200 MW → 400 MW

🔗 View ERCOT Queue | 📍 Google Earth

[Attached: satellite image of West Texas site]
```

### Withdrawn Project Alert

```
⚠️  WITHDRAWN Solar Project  #CA

🏗 Mojave Sunrise Solar
Type: Solar
Capacity: 175 MW
County: San Bernardino
State: California
Status: Withdrawn
Queue Date: 2024-11-03
Queue ID: 2458

Δ Changes: Status: Active → Withdrawn

🔗 View CAISO Queue | 📍 Google Earth
```

---

## Pricing

| Plan | Markets | Price |
|---|---|---|
| **Illinois Only** | IL (MISO) | **$49/mo** |
| **5-State Bundle** | IL, TX, CA, NY, NJ | **$99/mo** |
| **All 9 Hot Markets** | IL, IN, TX, CA, NY, NJ, OH, MA + FL when ready | **$149/mo** |

All plans include satellite imagery, withdrawn alerts, and daily health reports.

Annual pricing available on request (2 months free).

---

## How to Subscribe

Pick your plan and pay securely via Stripe:

| Plan | Link |
|---|---|
| **Illinois Only** — $49/mo | [Pay Here](https://buy.stripe.com/28E28q0xfaX024r7KAcMM02) |
| **5-State Bundle** — $99/mo | [Pay Here](https://buy.stripe.com/eVqfZg7ZH8OS7oL9SIcMM01) |
| **All 9 Markets** — $149/mo | [Pay Here](https://buy.stripe.com/fZu14mbbT6GKgZlgh6cMM00) |

**After checkout:**

1. You'll receive a Stripe receipt by email
2. Reply to that email (or DM me directly) with your **Telegram username or chat ID**
3. I'll add you to the private alert channel within 24 hours (usually much faster)

That's it — alerts start arriving the next morning at 7 AM ET.

Need a custom setup or team pricing? Email me directly.

> **Operator note:** When a customer pays, Stripe sends you an email
> notification. Run `python subscriber_manager.py add IL -1001234567890`
> to grant channel access, then `python subscriber_manager.py sync` to
> update config.yaml.

---

## Operator Guide

### Managing Subscribers

Use the included CLI tool to track subscribers and revenue:

```bash
# Add a new subscriber
python subscriber_manager.py add

# List all active subscribers with MRR
python subscriber_manager.py list

# Deactivate a subscriber (soft delete)
python subscriber_manager.py remove -1001234567890

# Bulk import from CSV
python subscriber_manager.py import subscribers.csv

# Generate config.yaml channel snippet from subscriber data
python subscriber_manager.py sync
```

After adding a subscriber, run `sync` to get the updated Telegram channel
config and paste it into `config.yaml`.

---

## Installation

### Prerequisites

- Python 3.12+
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Private Telegram channels created for each tier/state you sell
- Google Static Maps API key (optional but recommended for satellite images)

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/SolarSentinel.git
cd SolarSentinel

# Install dependencies
pip install -r requirements.txt

# Configure secrets
cp .env.example .env
# Edit .env — add TELEGRAM_TOKEN and GOOGLE_MAPS_API_KEY

# Configure states, channels, thresholds
# Edit config.yaml — set your Telegram channel IDs

# Validate with a dry run (no messages sent)
python solar_sentinel_enhanced.py --dry-run

# First real run — alerts all current projects
python solar_sentinel_enhanced.py --force

# Subsequent daily runs (automatic diff)
python solar_sentinel_enhanced.py
```

### CLI Flags

```
--dry-run    Log alert payloads without sending to Telegram
--debug      Verbose DEBUG logging to console and file
--force      Ignore previous snapshot — treat everything as new
--quiet      Suppress INFO logs to console (errors + admin report only)
--config     Path to a custom config.yaml
```

---

## GitHub Actions (Daily Cron)

The included workflow runs the scan every day at 12:00 UTC (7 AM ET).

### Setup

1. Push the repo to GitHub
2. Go to **Settings → Secrets and variables → Actions**
3. Add these secrets:

| Secret | Value |
|---|---|
| `TELEGRAM_TOKEN` | Your bot token from BotFather |
| `GOOGLE_MAPS_API_KEY` | Your Google Static Maps key (optional) |

4. `config.yaml` is committed to the repo — channel IDs and state list are read from there
5. The workflow automatically commits updated snapshots back to `data/` after each run

To trigger a manual run: **Actions tab → Solar Sentinel Enhanced Daily Scan → Run workflow**

You can also tick the `--force` checkbox in the manual trigger UI to re-alert all current projects.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    config.yaml                        │
│  States · Channels · Thresholds · Imagery settings    │
└────────────────────────┬─────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   main() entry      │
              │   Parse CLI flags   │
              │   Load config       │
              └──────────┬──────────┘
                         │
          ┌──────────────▼──────────────┐
          │   Group states by ISO        │
          │   IL+IN→MISO  NJ+OH→PJM    │
          └──────────────┬──────────────┘
                         │
     ┌───────────────────▼───────────────────┐
     │   ThreadPoolExecutor (parallel)        │
     │                                        │
     │  ┌─────────┐ ┌─────────┐ ┌─────────┐  │
     │  │  MISO   │ │  ERCOT  │ │  PJM    │  │
     │  │ fetch   │ │ fetch   │ │ fetch   │  │
     │  │ filter  │ │ filter  │ │ filter  │  │
     │  │ diff    │ │ diff    │ │ diff    │  │
     │  │ geocode │ │ geocode │ │ geocode │  │
     │  │ alert   │ │ alert   │ │ alert   │  │
     │  └─────────┘ └─────────┘ └─────────┘  │
     └───────────────────┬───────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  Telegram Multi-Channel     │
          │  "all" + per-state routes   │
          │  Admin health report        │
          └──────────────┬──────────────┘
                         │
              ┌──────────▼──────────┐
              │  Save snapshots     │
              │  data/snapshot_*.json│
              └─────────────────────┘
```

---

## Data Sources

All queue data comes directly from official ISO systems via the
[gridstatus](https://github.com/gridstatus/gridstatus) Python library:

| ISO | States Covered | Source |
|---|---|---|
| MISO | Illinois, Indiana | MISO GI Queue API |
| ERCOT | Texas | ERCOT Document System |
| CAISO | California | PublicQueueReport.xlsx |
| NYISO | New York | NYISO Interconnections |
| PJM | New Jersey, Ohio | PJM Queue Portal |
| ISO-NE | Massachusetts | IRTT External Reports |

---

## Roadmap

- [ ] Sentinel-2 before/after satellite diffing (construction progress detection)
- [ ] Florida utility queue scraper (FPL, Duke, TECO)
- [ ] Weekly digest email option alongside Telegram
- [ ] Web dashboard for subscriber self-service
- [ ] Webhook integrations (Slack, Discord, email)

---

## Launch Checklist

- [ ] Create Telegram bot via @BotFather, save token to `.env`
- [ ] Create private Telegram channels (one "all", one "admin", per-state as needed) and paste IDs into `config.yaml`
- [ ] Run `python solar_sentinel_enhanced.py --dry-run` then `--force` to validate alerts
- [ ] Verify all 3 Stripe Payment Links work (test a checkout yourself)
- [ ] Push to GitHub and confirm the Actions cron runs daily at 12:00 UTC

---

## Built By

**Jared** — Ex-Tesla Solar Roof. Building tools for the solar industry.

Questions? Reach out directly.
