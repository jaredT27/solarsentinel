import Link from "next/link";
import {
  Shield,
  Bell,
  CheckCircle2,
  ArrowRight,
  Zap,
  Globe,
  Server,
  Building2,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Solar Sentinel",
  description:
    "Queue Monitor and Risk Radar pricing. First Risk Radar report free — no credit card required.",
};

const QUEUE_TIERS = [
  {
    name: "Starter",
    price: "$49",
    period: "/month",
    features: [
      "1 ISO market",
      "Daily Telegram alerts",
      "New + withdrawn projects",
      "Satellite imagery",
    ],
    cta: "Start Monitoring",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$149",
    period: "/month",
    features: [
      "All 6 ISOs",
      "Daily Telegram + weekly email",
      "Capacity change tracking",
      "County-level filtering",
      "CSV export",
    ],
    cta: "Go Pro",
    highlight: true,
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: [
      "All 6 ISOs + custom markets",
      "API access",
      "Dedicated Slack/Teams channel",
      "Custom filters & alerts",
      "Priority support",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

const RADAR_TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "first report",
    features: [
      "Full risk matrix (10 categories)",
      "Queue cross-referencing",
      "Data Center Mode included",
      "PDF export",
      "No credit card required",
    ],
    cta: "Get Your Free Report",
    highlight: true,
    badge: "Start Here",
  },
  {
    name: "Pro",
    price: "$499",
    period: "per report",
    features: [
      "Everything in Free",
      "Prioritized seller questions",
      "HTML + JSON export",
      "24-hour turnaround",
      "Email delivery",
    ],
    cta: "Run a Report",
    highlight: false,
  },
  {
    name: "Pipeline",
    price: "$1,999",
    period: "/month",
    features: [
      "Up to 10 reports/month",
      "Everything in Pro",
      "Portfolio-level dashboard",
      "12-hour priority turnaround",
      "Dedicated Slack channel",
    ],
    cta: "Start Pipeline",
    highlight: false,
    badge: "Best for Active Teams",
  },
  {
    name: "Partners",
    price: "Custom",
    period: "",
    features: [
      "White-label for your clients",
      "API access",
      "Custom risk frameworks",
      "Co-branded reports",
      "Volume pricing",
    ],
    cta: "Contact Us",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="bg-[#0a0f1c]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-transparent" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400 mb-6">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Simple, transparent pricing
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] mb-4">
            <span className="text-white">Choose your </span>
            <span className="bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
              intelligence level
            </span>
          </h1>
          <p className="text-base text-gray-400 max-w-xl mx-auto">
            Start with queue monitoring. Add AI diligence when you&apos;re ready
            to move on a deal.
          </p>
        </div>
      </section>

      {/* Queue Monitor Pricing */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Queue Monitor</h2>
            <p className="text-sm text-gray-500">
              Real-time interconnection queue tracking across 6 ISOs
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {QUEUE_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-xl border p-6 transition-all ${
                tier.highlight
                  ? "border-amber-500/30 bg-amber-500/[0.04]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-600 text-white whitespace-nowrap">
                  {tier.badge}
                </span>
              )}
              <div className="text-center mb-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-1">
                  {tier.name}
                </h3>
                <div className="text-3xl font-bold text-white">
                  {tier.price}
                </div>
                <div className="text-xs text-gray-500">{tier.period}</div>
              </div>
              <ul className="space-y-2.5 mb-6">
                {tier.features.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-400"
                  >
                    <CheckCircle2
                      className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                        tier.highlight ? "text-amber-400" : "text-gray-600"
                      }`}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  tier.highlight
                    ? "bg-gradient-to-r from-amber-400 to-amber-600 text-white hover:from-amber-300 hover:to-amber-500 shadow-lg shadow-amber-500/20"
                    : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                }`}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="border-t border-white/5" />
      </div>

      {/* Risk Radar Pricing */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Risk Radar</h2>
            <p className="text-sm text-gray-500">
              We built this for our own deal flow. Now it&apos;s yours.
            </p>
          </div>
          <span className="ml-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20">
            FREE REPORT
          </span>
        </div>

        {/* Free trial callout */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-white mb-1">
              Your first report is free. See what we catch.
            </p>
            <p className="text-xs text-gray-400">
              We built Risk Radar for our own deal pipeline — it was too useful
              not to share. Upload your docs, get a full AI diligence report
              with queue cross-referencing. No credit card, no sales call.
            </p>
          </div>
          <Link
            href="/risk-radar"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 text-sm font-semibold text-white hover:from-amber-300 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20 whitespace-nowrap"
          >
            <Shield className="w-4 h-4" />
            Try Free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {RADAR_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-xl border p-6 transition-all ${
                tier.highlight
                  ? "border-amber-500/30 bg-amber-500/[0.04]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-600 text-white whitespace-nowrap">
                  {tier.badge}
                </span>
              )}
              <div className="text-center mb-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-1">
                  {tier.name}
                </h3>
                <div className="text-3xl font-bold text-white">
                  {tier.price}
                </div>
                <div className="text-xs text-gray-500">{tier.period}</div>
              </div>
              <ul className="space-y-2.5 mb-6">
                {tier.features.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-400"
                  >
                    <CheckCircle2
                      className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                        tier.highlight ? "text-amber-400" : "text-gray-600"
                      }`}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={tier.highlight ? "/risk-radar" : "#"}
                className={`block w-full py-2.5 rounded-lg text-sm font-semibold text-center transition-all ${
                  tier.highlight
                    ? "bg-gradient-to-r from-amber-400 to-amber-600 text-white hover:from-amber-300 hover:to-amber-500 shadow-lg shadow-amber-500/20"
                    : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

      </section>

      {/* Comparison */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h3 className="text-lg font-bold text-white">
              Why teams bundle both products
            </h3>
          </div>
          <div className="grid sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
            {[
              {
                icon: Globe,
                title: "Spot it first",
                desc: "Queue Monitor catches new projects within 24 hours of filing.",
              },
              {
                icon: Server,
                title: "Diligence it fast",
                desc: "Risk Radar is the same diligence engine we use on our own pipeline — full AI analysis with queue cross-referencing in 24 hours.",
              },
              {
                icon: Building2,
                title: "Close with confidence",
                desc: "Structured risk matrix, seller questions, and gap analysis — ready for IC.",
              },
            ].map((item) => (
              <div key={item.title} className="p-6">
                <item.icon className="w-5 h-5 text-amber-400 mb-3" />
                <h4 className="text-sm font-semibold text-white mb-1">
                  {item.title}
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
