# Solar Sentinel — Subscriber Onboarding Guide

Welcome to Solar Sentinel. You now have daily intelligence on every
solar and BESS project entering the interconnection queue in your
subscribed markets.

This guide covers what you'll receive, how to read the alerts, and how
to get the most out of your subscription.

---

## What You're Getting

Every morning at approximately 7:00 AM Eastern, Solar Sentinel scans
the official interconnection queues for your subscribed states and sends
you Telegram alerts for:

- **New projects** — solar or battery storage, 5 MW and above, that
  entered the queue since the last scan
- **Capacity changes** — projects whose nameplate capacity changed by
  10+ MW or 15%+
- **Status changes** — projects that moved between study phases or
  changed interconnection status
- **Withdrawals** — projects that were pulled from the queue or
  cancelled

Each alert includes a satellite image of the project location with a
red pin marker, the county and state, the Queue ID from the ISO, and a
direct link to the full queue listing.

---

## How to Read an Alert

Here's what a typical new-project alert looks like:

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
```

**Key fields:**

| Field | What It Means |
|---|---|
| Type | Solar, Battery Storage, or hybrid |
| Capacity | Nameplate capacity in megawatts |
| County | Where the project is sited |
| Queue Date | When the developer submitted to the ISO |
| Queue ID | The official ID you can look up on the ISO's website |
| Status | Active, Under Study, Withdrawn, etc. |

---

## Alert Types at a Glance

| Icon | Type | Meaning |
|---|---|---|
| ☀️ | NEW | A project just appeared in the queue for the first time |
| 🔄 | UPDATED | Capacity, status, or completion date changed |
| ⚠️ | WITHDRAWN | The project was pulled or cancelled |

---

## Getting Started

### After You Pay

Once your Stripe payment completes, you'll receive a receipt by email.
Reply to that email (or DM me directly) with your **Telegram username
or chat ID**. I'll add you to the private alert channel for your
subscribed states within 24 hours (usually much faster).

Stripe handles all billing automatically. You can view invoices or
cancel your subscription anytime from the customer portal link in your
Stripe receipt.

### Step 1 — Get Added to the Channel

After payment, send me your Telegram username or chat ID. I'll add
you to the private alert channel for your subscribed states within
24 hours (usually much faster).

### Step 2 — Enable Notifications

In Telegram, open the Solar Sentinel channel and make sure
notifications are turned on:

1. Tap the channel name at the top
2. Tap "Notifications"
3. Select "All messages" or "Mentions and replies"

This ensures you see every alert the moment it drops.

### Step 3 — Start Monitoring

That's it. Alerts arrive automatically every morning. No app to
install, no dashboard to check, no passwords to remember.

---

## Tips for Getting Maximum Value

1. **Cross-reference with county GIS** — When you see a new project in
   a county you're active in, pull up the county's parcel map to
   identify the exact site before competing developers do.

2. **Track Queue IDs** — Save the Queue ID from alerts you care about.
   You can look up detailed interconnection studies on the ISO's
   website using that ID.

3. **Watch for capacity changes** — A project that doubles its
   capacity is a signal that the developer secured additional land or
   financing. These are real leads.

4. **Monitor withdrawals** — When a project withdraws, the land and
   interconnection position may become available. This is one of the
   highest-value signals in the feed.

5. **Use the satellite image** — The attached satellite view lets you
   quickly assess terrain, proximity to substations, and whether
   construction has started, without leaving Telegram.

---

## Covered Markets

| State | ISO | Queue Source |
|---|---|---|
| Illinois | MISO | Generator Interconnection Queue |
| Indiana | MISO | Generator Interconnection Queue |
| Texas | ERCOT | Interconnection Queue |
| California | CAISO | Public Queue Report |
| New York | NYISO | Interconnection Queue |
| New Jersey | PJM | Interconnection Queue |
| Ohio | PJM | Interconnection Queue |
| Massachusetts | ISO-NE | IRTT External Reports |

Florida is coming soon (utilities publish their own queues separately
from ISOs).

---

## FAQ

**How often do alerts arrive?**
Once per day, around 7:00 AM Eastern. If there are no changes that day,
you'll see nothing — no spam, no noise.

**What's the minimum project size?**
5 MW. Rooftop and small commercial projects are filtered out to keep
the feed focused on utility-scale.

**Can I upgrade to more states?**
Yes. Email me and I'll switch your tier. You'll only be charged the
difference.

**Can I cancel?**
Yes, anytime. You can cancel directly from the customer portal link in
your Stripe receipt, or email me and I'll handle it. Either way, no
questions asked.

**Where does the data come from?**
Directly from the official ISO interconnection queue systems (MISO,
ERCOT, CAISO, NYISO, PJM, ISO-NE) via the open-source gridstatus
library. The data is public; what Solar Sentinel does is monitor it
daily, detect changes, geocode locations, attach satellite imagery,
and deliver it to you instantly.

**Is this legal?**
Yes. All queue data is published publicly by the ISOs. Solar Sentinel
simply automates the monitoring process.

---

## Support

Have questions or issues? Reach out to me directly — I respond within
a few hours during business days.

Thank you for subscribing. Let's find the next big project before
everyone else does.

— Jared
