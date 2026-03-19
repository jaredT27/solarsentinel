import Link from "next/link";
import {
  Shield,
  Zap,
  Globe,
  ArrowRight,
  Clock,
  MapPin,
  FileText,
  Search,
  Send,
  ChevronRight,
} from "lucide-react";

const COVERAGE = [
  { state: "Illinois", iso: "MISO" },
  { state: "Indiana", iso: "MISO" },
  { state: "Texas", iso: "ERCOT" },
  { state: "California", iso: "CAISO" },
  { state: "New York", iso: "NYISO" },
  { state: "New Jersey", iso: "PJM" },
  { state: "Ohio", iso: "PJM" },
  { state: "Massachusetts", iso: "ISO-NE" },
  { state: "Florida", iso: "Early Access" },
];

const WORKFLOW = [
  {
    step: "Fetch",
    icon: Globe,
    desc: "Pull official queue data from monitored ISO sources.",
  },
  {
    step: "Diff",
    icon: Search,
    desc: "Detect new entries, meaningful MW changes, and withdrawals.",
  },
  {
    step: "Route",
    icon: Send,
    desc: "Send to all-alerts plus state channels based on subscriber entitlements.",
  },
  {
    step: "Report",
    icon: FileText,
    desc: "Deliver admin health summary and optional weekly briefing.",
  },
];

export default function Home() {
  return (
    <div className="bg-[#0a0f1c]">
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-amber-500/[0.03] blur-[120px] rounded-full" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400 mb-6">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            For Solar Developers, EPC Teams, and Storage Investors
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            <span className="text-white">See queue movement</span>
            <br />
            <span className="bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
              before everyone else
            </span>
          </h1>

          <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
            Solar Sentinel monitors interconnection queues daily and sends
            high-signal Telegram alerts for new entries, capacity shifts, and
            withdrawals &mdash; with map context attached.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="#pricing"
              className="flex items-center gap-2 px-6 py-3.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 text-sm font-semibold text-white hover:from-amber-300 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
            >
              Start All Markets
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="#pricing"
              className="flex items-center gap-2 px-6 py-3.5 rounded-lg bg-white/5 border border-white/10 text-sm font-medium text-gray-300 hover:bg-white/10 transition-all"
            >
              View Plans
            </Link>
          </div>
        </div>
      </section>

      {/* ── Key Stats ────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              value: "8",
              label: "States Monitored",
              sub: "Florida early access open",
              icon: MapPin,
            },
            {
              value: "7:00 AM ET",
              label: "Daily Delivery",
              sub: "Daily Telegram scans",
              icon: Clock,
            },
            {
              value: "6",
              label: "ISOs Covered",
              sub: "MISO, ERCOT, CAISO, NYISO, PJM, ISO-NE",
              icon: Globe,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="text-center p-5 rounded-xl bg-white/[0.03] border border-white/5"
            >
              <stat.icon className="w-4 h-4 text-amber-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-xs text-gray-400 font-medium">
                {stat.label}
              </div>
              <div className="text-[10px] text-gray-600 mt-1">{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Coverage Footprint ───────────────────────────── */}
      <section id="coverage" className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Coverage Footprint
          </h2>
          <p className="text-sm text-gray-500">
            Interconnection queue monitoring across 6 ISOs
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {COVERAGE.map((c) => (
            <div
              key={c.state}
              className={`rounded-xl border p-4 text-center transition-all ${
                c.iso === "Early Access"
                  ? "border-amber-500/20 bg-amber-500/[0.03]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <div className="text-sm font-semibold text-white">{c.state}</div>
              <div
                className={`text-[10px] font-bold uppercase mt-1 ${
                  c.iso === "Early Access" ? "text-amber-400" : "text-gray-500"
                }`}
              >
                {c.iso}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Alert Quality Example ────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            What Your Alerts Look Like
          </h2>
          <p className="text-sm text-gray-500">
            High-signal, map-enriched alerts delivered every morning
          </p>
        </div>
        <div className="max-w-md mx-auto rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-3 bg-amber-500/[0.06] border-b border-white/5 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase">
              New BESS Project #TX
            </span>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <div className="text-lg font-bold text-white">
                Razorbill Storage
              </div>
              <div className="text-xs text-gray-500">
                ERCOT &middot; Texas
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Capacity", value: "120 MW" },
                { label: "County", value: "Matagorda" },
                { label: "Status", value: "Active" },
                { label: "Queue Date", value: "2025-08-04" },
              ].map((field) => (
                <div key={field.label}>
                  <div className="text-[10px] text-gray-600 uppercase font-bold">
                    {field.label}
                  </div>
                  <div className="text-sm text-gray-300">{field.value}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-gray-600">
              Queue ID: <span className="text-gray-400">22INR0382</span>
            </div>
            <div className="flex gap-2 pt-1">
              <span className="px-2.5 py-1 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                View ERCOT Queue
              </span>
              <span className="px-2.5 py-1 rounded text-[10px] font-semibold bg-white/5 text-gray-400 border border-white/10">
                Google Earth
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Workflow ─────────────────────────────────────── */}
      <section
        id="workflow"
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-20"
      >
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            How It Works
          </h2>
          <p className="text-sm text-gray-500">
            From ISO source to your Telegram &mdash; every morning
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {WORKFLOW.map((w, i) => (
            <div
              key={w.step}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-6 relative"
            >
              <div className="text-xs font-bold text-amber-400 mb-3">
                0{i + 1}
              </div>
              <w.icon className="w-5 h-5 text-amber-400 mb-3" />
              <h3 className="text-sm font-bold text-white mb-2">{w.step}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{w.desc}</p>
              {i < WORKFLOW.length - 1 && (
                <ChevronRight className="hidden lg:block absolute top-1/2 -right-3.5 w-5 h-5 text-gray-700 -translate-y-1/2" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Risk Radar (NEW) ─────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-yellow-500/[0.02] p-8 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-amber-500/[0.05] blur-[80px] rounded-full" />
          <div className="relative flex flex-col lg:flex-row items-start gap-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-semibold mb-4">
                <Shield className="w-3.5 h-3.5" />
                NEW &mdash; Risk Radar
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                AI-Powered Project Diligence
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-6 max-w-lg">
                The diligence engine we built for our own deal pipeline. Upload
                PPAs, ICAs, and offtake docs &mdash; get a full risk matrix with
                queue cross-referencing in 24 hours. Your first report is free.
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  "Data Center Mode",
                  "24hr Turnaround",
                  "Queue Cross-Ref",
                  "Free First Report",
                ].map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <Link
                href="/risk-radar"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 text-sm font-semibold text-white hover:from-amber-300 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
              >
                <Shield className="w-4 h-4" />
                Get Your Free Report
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="w-full lg:w-80 rounded-xl border border-white/10 bg-[#111827] p-5 space-y-3">
              <div className="text-xs font-bold text-amber-400 uppercase mb-2">
                Sample Risk Output
              </div>
              {[
                { cat: "Load Matching", sev: "YELLOW", note: "38% coverage gap" },
                { cat: "Interconnection", sev: "GREEN", note: "GIA executed, 78% complete" },
                { cat: "Curtailment", sev: "RED", note: "West zone congestion risk" },
              ].map((risk) => (
                <div
                  key={risk.cat}
                  className="flex items-center gap-3 text-xs"
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      risk.sev === "RED"
                        ? "bg-red-500"
                        : risk.sev === "YELLOW"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-gray-300 font-medium w-28">
                    {risk.cat}
                  </span>
                  <span className="text-gray-500">{risk.note}</span>
                </div>
              ))}
              <div className="text-[10px] text-gray-600 pt-2 border-t border-white/5">
                Full report includes seller questions, doc gaps, and next steps
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Queue Monitor Pricing ────────────────────────── */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Pricing
          </h2>
          <p className="text-sm text-gray-500">
            Start with one state. Scale when you&apos;re ready.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {[
            {
              name: "Single State",
              price: "$49",
              period: "/mo",
              desc: "Daily alerts + satellite maps for your chosen state.",
              highlight: false,
            },
            {
              name: "5-State Bundle",
              price: "$99",
              period: "/mo",
              desc: "IL, TX, CA, NY, NJ coverage for active teams.",
              highlight: true,
              badge: "Most Popular",
            },
            {
              name: "All Markets",
              price: "$149",
              period: "/mo",
              desc: "All active states plus Florida launch positioning.",
              highlight: false,
            },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl border p-6 transition-all ${
                plan.highlight
                  ? "border-amber-500/30 bg-amber-500/[0.04]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-600 text-white whitespace-nowrap">
                  {plan.badge}
                </span>
              )}
              <div className="text-center mb-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-1">
                  {plan.name}
                </h3>
                <div className="text-3xl font-bold text-white">
                  {plan.price}
                  <span className="text-sm text-gray-500 font-normal">
                    {plan.period}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center mb-5">
                {plan.desc}
              </p>
              <button
                className={`block w-full py-2.5 rounded-lg text-sm font-semibold text-center transition-all ${
                  plan.highlight
                    ? "bg-gradient-to-r from-amber-400 to-amber-600 text-white hover:from-amber-300 hover:to-amber-500 shadow-lg shadow-amber-500/20"
                    : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                }`}
              >
                Get Started
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-4 mt-5 text-xs text-gray-600">
          <span>Add-on: Weekly Briefing (+$19)</span>
          <span>&middot;</span>
          <span>Add-on: Custom Capacity Filter (+$29)</span>
        </div>
      </section>

      {/* ── Implementation ───────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <h3 className="text-lg font-bold text-white mb-2">
            Launch in one day, not one quarter
          </h3>
          <p className="text-sm text-gray-500 max-w-lg mx-auto">
            After checkout, share your Telegram username or chat ID and Solar
            Sentinel can start delivering alerts the next morning.
          </p>
        </div>
      </section>
    </div>
  );
}
