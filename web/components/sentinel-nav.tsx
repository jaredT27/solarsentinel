"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Shield, Menu, X, Map, GitBranch, DollarSign, Mail } from "lucide-react";

const NAV_LINKS = [
  { href: "/#coverage", label: "Coverage", icon: Map },
  { href: "/#workflow", label: "Workflow", icon: GitBranch },
  { href: "/#pricing", label: "Pricing", icon: DollarSign },
  { href: "/risk-radar", label: "Risk Radar", icon: Shield, badge: "NEW" },
  { href: "mailto:jared@localmotionai.com", label: "Contact", icon: Mail },
];

export default function SentinelNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav id="sentinel-root-nav" className="sticky top-0 z-50 backdrop-blur-xl bg-[#0a0f1c]/80 border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center transition-transform group-hover:scale-105">
            <Sun className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-white tracking-tight">
            Solar Sentinel
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href ||
              (link.href !== "/" && !link.href.startsWith("mailto") && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <link.icon className="w-3.5 h-3.5" />
                {link.label}
                {link.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* CTA + mobile toggle */}
        <div className="flex items-center gap-3">
          <Link
            href="https://calendly.com"
            className="hidden sm:inline-flex px-4 py-2 rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 text-sm font-semibold text-white hover:from-amber-300 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
          >
            Book a Demo
          </Link>
          <button
            className="md:hidden p-2 text-gray-400 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/5 bg-[#0a0f1c]/95 backdrop-blur-xl">
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href ||
                (link.href !== "/" && !link.href.startsWith("mailto") && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                  {link.badge && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
            <Link
              href="https://calendly.com"
              onClick={() => setMobileOpen(false)}
              className="block mt-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 text-sm font-semibold text-white text-center"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
