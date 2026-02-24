# Solar Sentinel

**Daily interconnection queue intelligence for solar developers and EPCs.**

Know about every new solar and BESS project entering the queue across 8 US states — before your competitors do. Get satellite imagery, capacity data, and status changes delivered straight to Telegram every morning.

---

## What You Get

- **Daily alerts at 7 AM ET** — new projects, capacity changes, withdrawals, and study phase updates across MISO, ERCOT, CAISO, NYISO, PJM, and ISO-NE queues
- **Satellite imagery with every alert** — 640x360 cinematic satellite view with red pin marker showing the exact project location
- **8 active markets** — Illinois, Indiana, Texas, California, New York, New Jersey, Ohio, Massachusetts (Florida coming soon)

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

### Monthly Plans

| Plan | Markets | Price |
|---|---|---|
| **Illinois Only** | IL (MISO) | **$49/mo** |
| **5-State Bundle** | IL, TX, CA, NY, NJ | **$99/mo** |
| **All Markets** | IL, IN, TX, CA, NY, NJ, OH, MA + FL (coming soon) | **$149/mo** |

### Annual Plans (Save 2 Months)

| Plan | Markets | Price |
|---|---|---|
| **Illinois Only** | IL (MISO) | **$490/yr** ($49/mo) |
| **5-State Bundle** | IL, TX, CA, NY, NJ | **$990/yr** ($99/mo) |
| **All Markets** | IL, IN, TX, CA, NY, NJ, OH, MA + FL (coming soon) | **$1,490/yr** ($149/mo) |

All plans include satellite imagery, withdrawn alerts, and daily health reports.

---

## Add-ons

Boost your subscription with these extras:

| Add-on | Description | Price | Link |
|--------|-------------|-------|------|
| **Weekly Email Digest** | HTML summary of all queue changes delivered to your inbox every Monday | **+$19/mo** | [Add Digest](https://buy.stripe.com/8x2dR80xf3uyeRdd4UcMM0b) |
| **Custom Capacity Filter** | Only see projects above your chosen MW threshold in digests | **+$29/mo** | [Add Filter](https://buy.stripe.com/8x214ma7P6GK24r8OEcMM0c) |
| **API Access** | Pull queue data into your own systems via REST API | **+$99/mo** | *Coming Soon* |

---

## Market Intelligence Reports

*Coming Q2 2026* — Comprehensive monthly and quarterly reports on the solar interconnection queue.

| Report | Description | Price |
|--------|-------------|-------|
| **Monthly Snapshot** | Queue capacity, new projects, withdrawals by state | **$299/report** |
| **Quarterly Deep Dive** | Trends, forecasts, developer rankings, capacity analysis | **$499/report** |

> **Interested?** Email jared@localmotionai.com to get on the waitlist.

---

## Florida Early Access

Florida is coming soon! Get early access to Florida utility interconnection queue data:

| Feature | Description |
|---------|-------------|
| **Early Access** | Be the first to receive FL queue alerts |
| **All Florida Utilities** | FPL, Duke, TECO, and more |
| **Locked-In Pricing** | Lock in today's rates when we launch |

**Early Access Pricing**: **$79/month** (price increases to $149/mo for new customers at launch)

[Get Florida Early Access](https://buy.stripe.com/6oU4gyeo58OSdN91mccMM0e)

> **Sign up**: Email jared@localmotionai.com to reserve your spot.

---

## How to Subscribe

Pick your plan and pay securely via Stripe:

### Monthly Plans

| Plan | Link |
|---|---|
| **Illinois Only** — $49/mo | [Pay Here](https://buy.stripe.com/28E28q0xfaX024r7KAcMM02) |
| **5-State Bundle** — $99/mo | [Pay Here](https://buy.stripe.com/eVqfZg7ZH8OS7oL9SIcMM01) |
| **All Markets** — $149/mo | [Pay Here](https://buy.stripe.com/fZu14mbbT6GKgZlgh6cMM00) |

### Annual Plans (Save 2 Months)

| Plan | Link |
|---|---|
| **Illinois Only** — $490/yr | [Pay Here](https://buy.stripe.com/6oU3cubbT1mqcJ5c0QcMM05) |
| **5-State Bundle** — $990/yr | [Pay Here](https://buy.stripe.com/6oU4gy5Rz6GKaAXd4UcMM04) |
| **All Markets** — $1,490/yr | [Pay Here](https://buy.stripe.com/eVqdR85Rz1mq10nfd2cMM03) |

**After checkout:**

1. You'll receive a Stripe receipt by email
2. Reply to that email (or DM me directly) with your **Telegram username or chat ID**
3. I'll add you to the private alert channel within 24 hours (usually much faster)

That's it — alerts start arriving the next morning at 7 AM ET.

Need a custom setup or team pricing? Email jared@localmotionai.com.

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

- [x] Daily Telegram alerts with satellite imagery
- [x] Weekly email digest add-on
- [x] Custom capacity filter add-on
- [ ] REST API access for subscribers
- [ ] Florida utility queue scraper (FPL, Duke, TECO)
- [ ] Monthly/quarterly market intelligence reports
- [ ] Web dashboard for subscriber self-service
- [ ] Webhook integrations (Slack, Discord)

---

## Built By

**Jared** — Ex-Tesla Solar Roof. Building tools for the solar industry.

Questions? Email jared@localmotionai.com

---
---

# For Operators

Everything below is for running your own instance of Solar Sentinel.

---

## Operator Guide

### Managing Subscribers

Use the included CLI tool to track subscribers and revenue:

```bash
# Add a new subscriber
python subscriber_manager.py add

# Quick add (single state)
python subscriber_manager.py add IL -1001234567890

# List all active subscribers with MRR
python subscriber_manager.py list

# Deactivate a subscriber (soft delete)
python subscriber_manager.py remove -1001234567890

# Bulk import from CSV
python subscriber_manager.py import subscribers.csv

# Generate config.yaml channel snippet from subscriber data
python subscriber_manager.py sync

# Revenue dashboard
python subscriber_manager.py stats
```

After adding a subscriber, run `sync` to get the updated Telegram channel
config and paste it into `config.yaml`.

> **Operator note:** When a customer pays, Stripe sends you an email
> notification. Run `python subscriber_manager.py add IL -1001234567890`
> to grant channel access, then `python subscriber_manager.py sync` to
> update config.yaml.

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
git clone https://github.com/jaredT27/solarsentinel.git
cd solarsentinel

# Install dependencies
pip install -r requirements.txt

# Configure secrets
cp .env.example .env
# Edit .env — add TELEGRAM_TOKEN, GOOGLE_MAPS_API_KEY, GMAIL credentials

# Configure states, channels, thresholds
# Edit config.yaml — set your Telegram channel IDs

# Validate with a dry run (no messages sent)
python solar_sentinel_enhanced.py --dry-run

# First real run — alerts all current projects
python solar_sentinel_enhanced.py --force

# Subsequent daily runs (automatic diff)
python solar_sentinel_enhanced.py

# Test the weekly email digest
python email_digest.py --dry-run
```

### CLI Flags

**Daily scanner (`solar_sentinel_enhanced.py`):**
```
--dry-run    Log alert payloads without sending to Telegram
--debug      Verbose DEBUG logging to console and file
--force      Ignore previous snapshot — treat everything as new
--quiet      Suppress INFO logs to console (errors + admin report only)
--config     Path to a custom config.yaml
```

**Weekly email digest (`email_digest.py`):**
```
--dry-run    Print HTML to console; don't send emails
--debug      Verbose DEBUG logging
--force      Send even if no baselines exist or digest is disabled
```

---

## GitHub Actions

Two automated workflows are included:

### Daily Scanner (7 AM ET)

Runs every day at 12:00 UTC. Fetches queue data, diffs against previous
snapshots, sends Telegram alerts, and commits updated snapshots.

### Weekly Email Digest (Monday 8 AM ET)

Runs every Monday at 13:00 UTC. Diffs current snapshots against weekly
baselines, sends HTML digest emails to subscribers, and commits updated
baselines.

### Setup

1. Push the repo to GitHub
2. Go to **Settings > Secrets and variables > Actions**
3. Add these secrets:

| Secret | Value |
|---|---|
| `TELEGRAM_TOKEN` | Your bot token from BotFather |
| `GOOGLE_MAPS_API_KEY` | Your Google Static Maps key (optional) |
| `PJM_API_KEY` | PJM Data Miner key (for NJ + OH) |
| `GMAIL_USER` | Gmail address for digest emails |
| `GMAIL_APP_PASSWORD` | Gmail App Password (not regular password) |

4. `config.yaml` is committed to the repo — channel IDs and state list are read from there
5. Workflows automatically commit updated data back to the repo after each run

To trigger a manual run: **Actions tab > select workflow > Run workflow**

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

## Launch Checklist

- [x] Create Telegram bot via @BotFather, save token to `.env`
- [x] Create private Telegram channels and paste IDs into `config.yaml`
- [x] Run `--dry-run` then `--force` to validate alerts
- [x] Push to GitHub and confirm the Actions cron runs daily
- [ ] Verify all Stripe Payment Links work
- [ ] Add `GMAIL_USER` and `GMAIL_APP_PASSWORD` to GitHub Secrets
- [ ] Test weekly email digest with `python email_digest.py --dry-run`
- [ ] Send first outreach emails
