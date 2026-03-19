"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import {
  Shield,
  Zap,
  ArrowRight,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Upload,
  Clock,
  BarChart3,
  Globe,
  Menu,
  X,
  Linkedin,
  Loader2,
  Trash2,
} from "lucide-react";

/* ── Design tokens matching sentinel-alerts.vercel.app ─────── */
const T = {
  bg: "linear-gradient(175deg, #f6f7ff 0%, #eef6ff 64%, #f8fbff 100%)",
  text: "#151b33",
  textMuted: "#5d6e9f",
  accentGrad: "linear-gradient(135deg, #6f4dff, #355dff)",
  accentShadow: "0px 12px 28px rgba(64, 76, 206, 0.34)",
  heroGrad: "linear-gradient(90deg, #3a58ff 0%, #3597ff 55%, #26c6e8 100%)",
  card: "rgba(255, 255, 255, 0.78)",
  cardBorder: "rgba(200, 215, 245, 0.5)",
  sectionBg: "rgba(246, 249, 255, 0.95)",
  pill: "#4e5fd4",
};

/* ── Risk data ─────────────────────────────────────────────── */
const RISK_MATRIX = [
  { category: "Load Matching", severity: "YELLOW", title: "Solar-only covers 38% of 24/7 AI load curve", note: "BESS bridges ~18 hrs but leaves 4-hr overnight gap", citation: "PPA_Draft_v4.pdf — §7.2" },
  { category: "Interconnection", severity: "GREEN", title: "GIA executed, network upgrades 78% complete", note: "$14.2M upgrade package, $11.1M funded", citation: "GIA_Executed_2025.pdf — §3.1" },
  { category: "Curtailment", severity: "YELLOW", title: "Curtailment cap missing from settlement terms", note: "ERCOT West 2024 curtailment hit 8.2% for solar", citation: "PPA_Draft_v4.pdf — §4.6" },
  { category: "Credit", severity: "GREEN", title: "Investment-grade counterparty (BBB+/Baa1)", note: "15-year PPA term, adequate for project finance", citation: "Credit_Package_2025.pdf — Ex. A" },
  { category: "Firm Power", severity: "RED", title: "No backup for 4-hr overnight gap", note: "24/7 CFE matching drops to 78% annually", citation: "Energy_Model_v2.xlsx — Hourly Dispatch" },
  { category: "Regulatory", severity: "GREEN", title: "ERCOT market rules favorable", note: "Energy-only market, no capacity obligations", citation: "Regulatory_Memo.pdf — §2" },
];

const HOW_IT_WORKS = [
  { step: "Upload", icon: Upload, desc: "Drop your PPAs, ICAs, offtake agreements, and supporting docs." },
  { step: "Analyze", icon: Search, desc: "AI parses every document, extracts terms, and cross-references queue data." },
  { step: "Score", icon: BarChart3, desc: "Risk matrix generated across 10 categories with severity ratings." },
  { step: "Deliver", icon: FileText, desc: "Full report with prioritized questions and next steps in 24 hours." },
];

const TIERS = [
  { name: "Free", price: "$0", period: "", desc: "First report free. No credit card.", features: ["1 project report", "Full risk matrix", "Queue cross-reference", "24-hr turnaround"], highlight: true, badge: "START HERE", cta: "Get Free Report" },
  { name: "Pro", price: "$499", period: "/report", desc: "One-off diligence for active deals.", features: ["Single project report", "Full risk matrix + doc gaps", "Seller question list", "Priority turnaround"], highlight: false, cta: "Buy Report" },
  { name: "Pipeline", price: "$1,999", period: "/mo", desc: "For teams running multiple deals.", features: ["Up to 10 reports/month", "Data center mode", "Queue cross-referencing", "Dedicated support"], highlight: false, cta: "Start Pipeline" },
  { name: "Partners", price: "Custom", period: "", desc: "White-label or fund-level deployment.", features: ["Unlimited reports", "Custom risk categories", "API access", "Co-branded output"], highlight: false, cta: "Contact Us" },
];

/* ── Severity badge ────────────────────────────────────────── */
function SeverityBadge({ severity }: { severity: string }) {
  const cfg: Record<string, { bg: string; border: string; color: string; Icon: typeof XCircle }> = {
    RED: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", color: "#dc2626", Icon: XCircle },
    YELLOW: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", color: "#d97706", Icon: AlertTriangle },
    GREEN: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", color: "#16a34a", Icon: CheckCircle2 },
  };
  const c = cfg[severity] ?? cfg.YELLOW;
  return (
    <span style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold">
      <c.Icon className="w-3.5 h-3.5" />
      {severity}
    </span>
  );
}

/* ── Nav (matches live site) ───────────────────────────────── */
function RiskRadarNav() {
  const [open, setOpen] = useState(false);
  return (
    <nav style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(200,215,245,0.4)" }} className="sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: T.accentGrad }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-sm" style={{ color: T.text }}>Solar Sentinel</div>
            <div className="text-[10px] font-medium tracking-wider uppercase" style={{ color: T.textMuted }}>Interconnection Queue Intelligence</div>
          </div>
        </Link>
        <div className="hidden md:flex items-center gap-6">
          {[
            { label: "Coverage", href: "/#coverage" },
            { label: "Workflow", href: "/#workflow" },
            { label: "Pricing", href: "/#pricing" },
            { label: "Contact", href: "mailto:jared@localmotionai.com" },
          ].map((l) => (
            <Link key={l.label} href={l.href} className="text-sm font-medium transition-colors hover:opacity-70" style={{ color: T.text }}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link href="https://calendly.com" className="hidden sm:inline-flex px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-[1.02]" style={{ background: T.accentGrad, boxShadow: T.accentShadow }}>
            Book a Demo
          </Link>
          <button className="md:hidden p-2" style={{ color: T.text }} onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t px-5 py-3 space-y-2" style={{ borderColor: T.cardBorder, background: "rgba(255,255,255,0.95)" }}>
          {["Coverage", "Workflow", "Pricing", "Contact"].map((l) => (
            <Link key={l} href={l === "Contact" ? "mailto:jared@localmotionai.com" : `/#${l.toLowerCase()}`} onClick={() => setOpen(false)} className="block py-2 text-sm font-medium" style={{ color: T.text }}>
              {l}
            </Link>
          ))}
          <Link href="https://calendly.com" onClick={() => setOpen(false)} className="block py-2.5 rounded-xl text-sm font-semibold text-white text-center" style={{ background: T.accentGrad }}>
            Book a Demo
          </Link>
        </div>
      )}
    </nav>
  );
}

/* ── Footer (matches live site) ────────────────────────────── */
function RiskRadarFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${T.cardBorder}` }} className="py-8">
      <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: T.accentGrad }}>
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold" style={{ color: T.text }}>Solar Sentinel</span>
          <span className="text-xs" style={{ color: T.textMuted }}>| Interconnection Queue Intelligence</span>
        </Link>
        <div className="flex items-center gap-4 text-xs" style={{ color: T.textMuted }}>
          <span>Built by Jared (ex-Tesla, Sunrun, Sunnova)</span>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
            <Linkedin className="w-4 h-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ── Upload Modal ──────────────────────────────────────────── */
const ACCEPTED = ".pdf,.docx,.xlsx,.csv,.json,.txt";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file

type UploadState = "idle" | "uploading" | "analyzing" | "done" | "error";

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState("");
  const [projectId, setProjectId] = useState("");
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const valid = Array.from(newFiles).filter((f) => {
      if (f.size > MAX_FILE_SIZE) return false;
      return true;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, 20));
  }, []);

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleSubmit = async () => {
    if (files.length === 0 && !projectId) return;
    setState("uploading");
    setProgress("Uploading documents...");
    setError("");

    try {
      const form = new FormData();
      files.forEach((f) => form.append("files[]", f));
      if (projectId) form.append("projectId", projectId);
      if (email) form.append("email", email);
      form.append("tier", "free_trial");
      form.append("dataCenterMode", "true");

      setState("analyzing");
      setProgress("Analyzing documents with AI... This may take 30-60 seconds.");

      const res = await fetch("/api/risk-radar", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Analysis failed");
      }

      setReportUrl(data.reportUrl);
      setState("done");
      setProgress("");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const reset = () => {
    setFiles([]);
    setEmail("");
    setProjectId("");
    setState("idle");
    setProgress("");
    setError("");
    setReportUrl("");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div
        className="relative w-full max-w-lg rounded-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto"
        style={{ background: "#fff", border: `1px solid ${T.cardBorder}` }}
      >
        <button onClick={() => { onClose(); reset(); }} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 transition-colors">
          <X className="w-5 h-5" style={{ color: T.textMuted }} />
        </button>

        {state === "done" ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4" style={{ color: "#16a34a" }} />
            <h3 className="text-xl font-bold mb-2" style={{ color: T.text }}>Report Ready</h3>
            <p className="text-sm mb-6" style={{ color: T.textMuted }}>Your risk analysis is complete.</p>
            <a
              href={reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
              style={{ background: T.accentGrad, boxShadow: T.accentShadow }}
            >
              View Report <ArrowRight className="w-4 h-4" />
            </a>
            <button onClick={() => { reset(); }} className="block mx-auto mt-4 text-sm font-medium hover:underline" style={{ color: T.textMuted }}>
              Analyze another deal
            </button>
          </div>
        ) : state === "uploading" || state === "analyzing" ? (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: "#6f4dff" }} />
            <h3 className="text-lg font-bold mb-2" style={{ color: T.text }}>
              {state === "uploading" ? "Uploading..." : "Analyzing..."}
            </h3>
            <p className="text-sm" style={{ color: T.textMuted }}>{progress}</p>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-bold mb-1" style={{ color: T.text }}>Upload Your Documents</h3>
            <p className="text-sm mb-6" style={{ color: T.textMuted }}>
              Drop your deal docs below. First report is free.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626" }}>
                {error}
              </div>
            )}

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors hover:border-[#6f4dff] hover:bg-[#6f4dff]/[0.03]"
              style={{ borderColor: T.cardBorder }}
            >
              <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: T.textMuted }} />
              <p className="text-sm font-medium" style={{ color: T.text }}>
                Drop files here or click to browse
              </p>
              <p className="text-xs mt-1" style={{ color: T.textMuted }}>
                PDF, DOCX, XLSX, CSV, JSON, TXT &mdash; up to 50MB each
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(111,77,255,0.04)", border: `1px solid ${T.cardBorder}` }}>
                    <FileText className="w-4 h-4 flex-shrink-0" style={{ color: "#6f4dff" }} />
                    <span className="flex-1 truncate" style={{ color: T.text }}>{f.name}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: T.textMuted }}>{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(i)} className="p-0.5 rounded hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" style={{ color: "#dc2626" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Optional fields */}
            <div className="mt-5 space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: T.textMuted }}>
                  Email <span className="font-normal">(optional — to receive a copy)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#6f4dff]/30"
                  style={{ border: `1.5px solid ${T.cardBorder}`, color: T.text }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: T.textMuted }}>
                  Queue ID <span className="font-normal">(optional — for cross-referencing)</span>
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="e.g. ERCOT-24INR0123"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#6f4dff]/30"
                  style={{ border: `1.5px solid ${T.cardBorder}`, color: T.text }}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={files.length === 0 && !projectId}
              className="w-full mt-6 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: T.accentGrad, boxShadow: T.accentShadow }}
            >
              <Shield className="w-4 h-4" />
              Analyze Documents
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-center text-xs mt-3" style={{ color: T.textMuted }}>
              Your documents are encrypted and auto-deleted after 30 days.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────── */
export default function RiskRadarPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div
      className="min-h-screen"
      style={{
        background: T.bg,
        color: T.text,
        fontFamily: '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* Override the dark root layout — hide root nav/footer, reset body bg */}
      <style>{`
        #sentinel-root-nav { display: none !important; }
        #sentinel-root-footer { display: none !important; }
        body { background: #f6f7ff !important; color: #151b33 !important; }
      `}</style>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <RiskRadarNav />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 sm:pt-28 pb-20">
        {/* Decorative radials matching live site */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 18% 58%, rgba(154,255,232,0.18), transparent 33%), radial-gradient(circle at 82% 30%, rgba(86,111,255,0.22), transparent 46%), radial-gradient(circle at 63% 65%, rgba(188,170,255,0.18), transparent 36%)" }} />

        <div className="relative max-w-4xl mx-auto px-5 text-center">
          <p className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-8" style={{ color: T.pill, border: `1.5px solid ${T.cardBorder}`, background: "rgba(255,255,255,0.6)" }}>
            <Shield className="w-3.5 h-3.5" />
            AI-Powered Document Diligence
          </p>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.15] mb-6">
            See what we catch{" "}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: T.heroGrad }}>
              before you close.
            </span>
          </h1>

          <p className="text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-10" style={{ color: T.textMuted }}>
            Upload PPAs, ICAs, and offtake docs &mdash; get a full risk matrix
            with queue cross-referencing in 24 hours. Built for our own deal
            pipeline. Now it&apos;s yours.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => setUploadOpen(true)} className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-[1.02]" style={{ background: T.accentGrad, boxShadow: T.accentShadow }}>
              Get Your Free Report
              <ArrowRight className="w-4 h-4" />
            </button>
            <Link href="#sample" className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium transition-all hover:bg-white/50" style={{ color: T.text, border: `1.5px solid ${T.cardBorder}`, background: "rgba(255,255,255,0.5)" }}>
              See Sample Output
            </Link>
          </div>
        </div>
      </section>

      {/* ── Key Stats ─────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 pb-20">
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: "24 hr", label: "Turnaround", sub: "Full report delivered", Icon: Clock },
            { value: "10+", label: "Risk Categories", sub: "Comprehensive coverage", Icon: Shield },
            { value: "6", label: "ISOs Cross-Referenced", sub: "Via Solar Sentinel queue data", Icon: Globe },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-5 rounded-2xl" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
              <stat.Icon className="w-4 h-4 mx-auto mb-2" style={{ color: "#6f4dff" }} />
              <div className="text-2xl font-bold" style={{ color: T.text }}>{stat.value}</div>
              <div className="text-xs font-medium" style={{ color: T.textMuted }}>{stat.label}</div>
              <div className="text-[10px] mt-1" style={{ color: "#9ba8c9" }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-[2.1rem] font-bold mb-3" style={{ color: T.text }}>How It Works</h2>
          <p className="text-sm" style={{ color: T.textMuted }}>From document upload to actionable risk report</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {HOW_IT_WORKS.map((w, i) => (
            <div key={w.step} className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
              <div className="text-xs font-bold mb-3" style={{ color: "#6f4dff" }}>0{i + 1}</div>
              <w.icon className="w-5 h-5 mb-3" style={{ color: "#6f4dff" }} />
              <h3 className="text-sm font-bold mb-2" style={{ color: T.text }}>{w.step}</h3>
              <p className="text-xs leading-relaxed" style={{ color: T.textMuted }}>{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sample Report ─────────────────────────────────── */}
      <section id="sample" className="max-w-6xl mx-auto px-5 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-[2.1rem] font-bold mb-3" style={{ color: T.text }}>Sample Risk Output</h2>
          <p className="text-sm" style={{ color: T.textMuted }}>450 MW Solar + 200 MW BESS Hybrid &mdash; ERCOT West</p>
        </div>

        {/* Overview card */}
        <div className="max-w-4xl mx-auto mb-6">
          <div className="rounded-2xl p-5 flex items-center justify-between gap-6" style={{ background: "rgba(111,77,255,0.06)", border: "1px solid rgba(111,77,255,0.2)" }}>
            <div>
              <div className="text-xs font-bold uppercase mb-1" style={{ color: "#6f4dff" }}>Project Overview</div>
              <p className="text-sm leading-relaxed max-w-2xl" style={{ color: T.textMuted }}>
                GIA executed Q3 2025 with 2027 COD. Strong fit for hyperscale 24/7 CFE
                procurement but hourly shape risk requires BESS dispatch optimization
                and nodal basis hedging.
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[10px] uppercase font-bold" style={{ color: "#9ba8c9" }}>Overall</div>
              <div className="text-lg font-bold" style={{ color: "#6f4dff" }}>Medium Risk</div>
            </div>
          </div>
        </div>

        {/* Risk rows */}
        <div className="max-w-4xl mx-auto space-y-3">
          {RISK_MATRIX.map((risk) => (
            <div key={risk.category} className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h4 className="text-sm font-bold" style={{ color: T.text }}>{risk.title}</h4>
                  <p className="text-xs mt-1" style={{ color: T.textMuted }}>{risk.note}</p>
                </div>
                <SeverityBadge severity={risk.severity} />
              </div>
              <div className="text-[10px]" style={{ color: "#9ba8c9" }}>
                <span className="font-bold uppercase">Source:</span> {risk.citation}
              </div>
            </div>
          ))}
        </div>

        {/* Gaps + Questions */}
        <div className="max-w-4xl mx-auto mt-6 grid sm:grid-cols-2 gap-5">
          <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
            <div className="text-xs font-bold uppercase mb-3" style={{ color: "#6f4dff" }}>Document Gaps Found</div>
            <ul className="space-y-2">
              {["Independent Engineer (IE) report", "Phase I Environmental Site Assessment", "Basis risk study for ERCOT West node", "BESS degradation & warranty terms"].map((gap) => (
                <li key={gap} className="flex items-start gap-2 text-xs" style={{ color: T.textMuted }}>
                  <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  {gap}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
            <div className="text-xs font-bold uppercase mb-3" style={{ color: "#6f4dff" }}>Seller Questions Generated</div>
            <ul className="space-y-2">
              {["Contractual BESS dispatch obligation?", "Will seller agree to 5% curtailment cap?", "Planned Phase 2 BESS augmentation?", "Nodal basis differential at project bus?"].map((q) => (
                <li key={q} className="flex items-start gap-2 text-xs" style={{ color: T.textMuted }}>
                  <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#6f4dff" }} />
                  {q}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── What Gets Analyzed ────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-[2.1rem] font-bold mb-3" style={{ color: T.text }}>What Gets Analyzed</h2>
          <p className="text-sm" style={{ color: T.textMuted }}>Upload any combination — we parse them all</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-4xl mx-auto">
          {["Power Purchase Agreements", "Interconnection Agreements", "Offtake Contracts", "Credit Packages", "Energy Models", "Environmental Reports", "Site Control Docs", "Regulatory Filings", "Equipment Warranties", "Financial Models"].map((doc) => (
            <div key={doc} className="rounded-2xl p-4 text-center transition-all hover:shadow-md" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
              <FileText className="w-4 h-4 mx-auto mb-2" style={{ color: "#6f4dff" }} />
              <div className="text-xs font-medium" style={{ color: T.text }}>{doc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────── */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-[2.1rem] font-bold mb-3" style={{ color: T.text }}>Simple pricing, immediate access</h2>
          <p className="text-sm" style={{ color: T.textMuted }}>Start free. Pay when it saves you from a bad deal.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
          {TIERS.map((tier) => (
            <div key={tier.name} className="relative rounded-2xl p-6 transition-all hover:shadow-lg" style={{ background: tier.highlight ? "rgba(111,77,255,0.04)" : T.card, border: `1px solid ${tier.highlight ? "rgba(111,77,255,0.25)" : T.cardBorder}` }}>
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white whitespace-nowrap" style={{ background: T.accentGrad }}>
                  {tier.badge}
                </span>
              )}
              <div className="text-center mb-4">
                <h3 className="text-sm font-semibold mb-1" style={{ color: T.textMuted }}>{tier.name}</h3>
                <div className="text-3xl font-bold" style={{ color: T.text }}>
                  {tier.price}
                  {tier.period && <span className="text-sm font-normal" style={{ color: T.textMuted }}>{tier.period}</span>}
                </div>
              </div>
              <p className="text-xs text-center mb-5" style={{ color: T.textMuted }}>{tier.desc}</p>
              <ul className="space-y-2 mb-5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs" style={{ color: T.textMuted }}>
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#16a34a" }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => tier.name === "Partners" ? window.location.href = "mailto:jared@localmotionai.com?subject=Risk%20Radar%20—%20Partners" : setUploadOpen(true)}
                className="block w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-all hover:scale-[1.02]"
                style={tier.highlight
                  ? { background: T.accentGrad, color: "#fff", boxShadow: T.accentShadow }
                  : { background: "rgba(255,255,255,0.6)", color: T.text, border: `1.5px solid ${T.cardBorder}` }
                }
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 pb-20">
        <div className="rounded-2xl p-8 sm:p-10 text-center" style={{ background: "rgba(111,77,255,0.06)", border: "1px solid rgba(111,77,255,0.2)" }}>
          <h3 className="text-xl font-bold mb-2" style={{ color: T.text }}>
            Upload a real deal. See what we find.
          </h3>
          <p className="text-sm max-w-lg mx-auto mb-6" style={{ color: T.textMuted }}>
            Your first report is free &mdash; no credit card, no commitment. If we
            don&apos;t catch something your team missed, don&apos;t come back.
          </p>
          <button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-[1.02]" style={{ background: T.accentGrad, boxShadow: T.accentShadow }}>
            <Shield className="w-4 h-4" />
            Get Your Free Report
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <RiskRadarFooter />
    </div>
  );
}
