/**
 * PDF Report Generator — Solar Sentinel Risk Radar
 *
 * Compact, multi-page PDF with Sentinel dark branding.
 * Uses @react-pdf/renderer (server-side in Vercel functions).
 *
 * Data Center Mode: emphasizes load matching, firm power, and
 * hourly shape analysis with DC PRIORITY badges on flagged risks.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Link,
} from "@react-pdf/renderer";
import type { DiligenceReport } from "./anthropic-diligence";
import type { QueueProject } from "./sentinel-db";

// ── Types ──────────────────────────────────────────────────────

interface PDFMeta {
  reportId: string;
  dataCenterMode: boolean;
  projectId?: string;
  generatedAt: string;
  queueProject?: QueueProject | null;
  queueChanges?: {
    new_projects: string[];
    withdrawn: string[];
    capacity_changes: string[];
  };
}

// ── Colors ─────────────────────────────────────────────────────

const BG     = "#0a0f1c";
const CARD   = "#111827";
const BORDER = "#1e293b";
const INNER  = "#0d1424";
const TEAL   = "#14b8a6";
const GOLD   = "#f0c040";
const WHITE  = "#f1f5f9";
const MUTED  = "#94a3b8";
const DIM    = "#64748b";

const SEV = {
  RED:    { bg: "#3b0a0a", border: "#ef4444", text: "#fca5a5" },
  YELLOW: { bg: "#3b1a03", border: "#f59e0b", text: "#fcd34d" },
  GREEN:  { bg: "#052e16", border: "#10b981", text: "#6ee7b7" },
};

const RISK_BG: Record<string, { bg: string; text: string }> = {
  High:   { bg: "#3b0a0a", text: "#fca5a5" },
  Medium: { bg: "#3b1a03", text: "#fcd34d" },
  Low:    { bg: "#052e16", text: "#6ee7b7" },
};

// ── Styles ─────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: WHITE,
    backgroundColor: BG,
  },
  // Header
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  logoBox: {
    width: 24,
    height: 24,
    borderRadius: 5,
    backgroundColor: GOLD,
    marginRight: 8,
  },
  navTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: WHITE },
  navBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: TEAL,
    backgroundColor: "#14b8a611",
    padding: "2px 6px",
    borderRadius: 3,
    marginLeft: 6,
  },
  navDate: { fontSize: 8, color: DIM },
  // Sections
  section: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: DIM,
    marginBottom: 8,
  },
  // Header card
  riskBadge: {
    padding: "5px 12px",
    borderRadius: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  overviewText: { fontSize: 9, lineHeight: 1.6, color: MUTED },
  // Risk row
  riskCard: {
    backgroundColor: INNER,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 7,
    padding: 10,
    marginBottom: 6,
  },
  riskCardDC: {
    backgroundColor: INNER,
    borderRadius: 7,
    padding: 10,
    marginBottom: 6,
  },
  sevBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    padding: "1px 7px",
    borderRadius: 8,
  },
  riskTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: WHITE },
  riskDesc: { fontSize: 8, color: MUTED, lineHeight: 1.4, marginTop: 3 },
  riskMeta: { fontSize: 7, color: DIM, marginTop: 3 },
  dcBadge: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: TEAL,
    backgroundColor: "#14b8a618",
    padding: "1px 5px",
    borderRadius: 3,
    marginLeft: 4,
  },
  // Queue banner
  queueBanner: {
    borderWidth: 1,
    borderColor: "#14b8a644",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#14b8a608",
  },
  queueLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: TEAL, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  queueRow: { flexDirection: "row", marginBottom: 3 },
  queueKey: { width: 65, fontSize: 8, color: DIM },
  queueVal: { flex: 1, fontSize: 8, color: WHITE },
  // Lists
  listItem: { fontSize: 8, lineHeight: 1.5, marginBottom: 3, color: WHITE },
  gapItem: { fontSize: 8, lineHeight: 1.5, marginBottom: 3, color: "#fcd34d" },
  strengthItem: { fontSize: 8, lineHeight: 1.5, marginBottom: 3, color: "#6ee7b7" },
  numberedRow: { flexDirection: "row", marginBottom: 4, alignItems: "flex-start" },
  numCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#14b8a622",
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  numText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: TEAL, textAlign: "center" },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerText: { fontSize: 6, color: DIM },
  // Counts row
  countRow: { flexDirection: "row", gap: 4, marginBottom: 10 },
  countBadge: { fontSize: 7, fontFamily: "Helvetica-Bold", padding: "2px 8px", borderRadius: 4 },
});

// ── Helpers ────────────────────────────────────────────────────

const el = React.createElement;
const DC_CATS = new Set(["Load Matching", "Firm Power / Backup", "Colocation / Behind-the-Meter"]);

// ── Document ───────────────────────────────────────────────────

function ReportPDF({ report, meta }: { report: DiligenceReport; meta: PDFMeta }) {
  const rb = RISK_BG[report.overall_risk_score] ?? RISK_BG.Medium;
  const modeLabel = meta.dataCenterMode ? "Data Center Mode" : "Traditional Renewable";
  const reds    = report.risk_matrix.filter((r) => r.severity === "RED").length;
  const yellows = report.risk_matrix.filter((r) => r.severity === "YELLOW").length;
  const greens  = report.risk_matrix.filter((r) => r.severity === "GREEN").length;

  return el(Document, null,
    // ── Page 1: Header + Risk Matrix ──────────────────
    el(Page, { size: "A4", style: s.page, wrap: true },

      // Nav
      el(View, { style: s.navRow },
        el(View, { style: { flexDirection: "row", alignItems: "center" } },
          el(View, { style: s.logoBox }),
          el(Text, { style: s.navTitle }, "Solar Sentinel"),
          el(Text, { style: s.navBadge }, "RISK RADAR"),
        ),
        el(Text, { style: s.navDate }, meta.generatedAt.split("T")[0]),
      ),

      // Report header
      el(View, { style: { ...s.section, borderColor: `${rb.text}44` } },
        el(View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
          el(View, null,
            el(Text, { style: { fontSize: 8, fontFamily: "Helvetica-Bold", color: TEAL, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 } }, `Diligence Report — ${modeLabel}`),
            el(Text, { style: { fontSize: 7, color: DIM } }, `ID: ${meta.reportId}${meta.projectId ? `  |  Queue: ${meta.projectId}` : ""}`),
          ),
          el(Text, { style: { ...s.riskBadge, backgroundColor: rb.bg, color: rb.text } }, `${report.overall_risk_score.toUpperCase()} RISK`),
        ),
        // Severity counts
        el(View, { style: s.countRow },
          el(Text, { style: { ...s.countBadge, backgroundColor: SEV.RED.bg, color: SEV.RED.text } }, `${reds} RED`),
          el(Text, { style: { ...s.countBadge, backgroundColor: SEV.YELLOW.bg, color: SEV.YELLOW.text } }, `${yellows} YELLOW`),
          el(Text, { style: { ...s.countBadge, backgroundColor: SEV.GREEN.bg, color: SEV.GREEN.text } }, `${greens} GREEN`),
        ),
        el(Text, { style: s.overviewText }, report.project_overview),
      ),

      // Queue intel
      ...(meta.queueProject ? [
        el(View, { style: s.queueBanner, key: "queue" },
          el(Text, { style: s.queueLabel }, "Solar Sentinel Queue Intel — Live"),
          ...[
            ["Queue ID", meta.queueProject.queue_id],
            ["Project", meta.queueProject.project_name],
            ["Capacity", `${meta.queueProject.capacity_mw} MW ${meta.queueProject.gen_type}`],
            ["Location", `${meta.queueProject.iso} · ${meta.queueProject.state}${meta.queueProject.county ? ` · ${meta.queueProject.county} Co.` : ""}`],
            ["Status", meta.queueProject.status],
            ["COD", meta.queueProject.proposed_cod || "TBD"],
          ].map(([k, v], i) =>
            el(View, { style: s.queueRow, key: `q${i}` },
              el(Text, { style: s.queueKey }, k),
              el(Text, { style: { ...s.queueVal, fontFamily: k === "Queue ID" ? "Courier" : "Helvetica" } }, v),
            )
          ),
          ...(meta.queueChanges ? (() => {
            const parts: string[] = [];
            if (meta.queueChanges.new_projects.length) parts.push(`+${meta.queueChanges.new_projects.length} new`);
            if (meta.queueChanges.withdrawn.length) parts.push(`-${meta.queueChanges.withdrawn.length} withdrawn`);
            if (meta.queueChanges.capacity_changes.length) parts.push(`${meta.queueChanges.capacity_changes.length} MW changes`);
            return parts.length ? [el(Text, { key: "qch", style: { fontSize: 7, color: TEAL, marginTop: 6 } }, `Queue movement: ${parts.join(" · ")}`)] : [];
          })() : []),
        ),
      ] : []),

      // Risk matrix
      el(View, { style: s.section },
        el(Text, { style: { ...s.sectionLabel, color: TEAL } }, meta.dataCenterMode ? "Risk Matrix — DC Priority" : "Risk Matrix"),
        ...report.risk_matrix.map((risk, i) => {
          const sv = SEV[risk.severity as keyof typeof SEV] ?? SEV.YELLOW;
          const isDC = meta.dataCenterMode && DC_CATS.has(risk.category);
          return el(View, { key: `r${i}`, style: { ...(isDC ? s.riskCardDC : s.riskCard), borderWidth: 1, borderColor: isDC ? sv.border + "66" : BORDER, backgroundColor: isDC ? sv.bg : INNER }, wrap: false },
            el(View, { style: { flexDirection: "row", alignItems: "center", marginBottom: 4 } },
              el(Text, { style: { ...s.sevBadge, backgroundColor: sv.bg, color: sv.text } }, risk.severity),
              el(Text, { style: { fontSize: 7, color: DIM, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginLeft: 6 } }, risk.category),
              ...(isDC ? [el(Text, { key: "dc", style: s.dcBadge }, "DC PRIORITY")] : []),
            ),
            el(Text, { style: s.riskTitle }, risk.title),
            el(Text, { style: s.riskDesc }, risk.description),
            el(Text, { style: s.riskMeta }, `Source: ${risk.citation}  |  Impact: ${risk.impact}`),
          );
        }),
      ),

      // Footer
      el(View, { style: s.footer, fixed: true },
        el(Text, { style: s.footerText }, `Solar Sentinel Risk Radar  |  ${modeLabel}  |  Confidential`),
        el(Link, { style: { ...s.footerText, color: TEAL }, src: "https://sentinel-alerts.vercel.app/risk-radar" }, "sentinel-alerts.vercel.app"),
      ),
    ),

    // ── Page 2: Gaps, Questions, Strengths, Next Steps ──
    el(Page, { size: "A4", style: s.page },

      // Document gaps
      el(View, { style: s.section },
        el(Text, { style: { ...s.sectionLabel, color: "#f59e0b" } }, `Document Gaps (${report.document_gaps.length})`),
        ...report.document_gaps.map((g, i) =>
          el(Text, { key: `g${i}`, style: s.gapItem }, `!  ${g}`)
        ),
      ),

      // Questions
      el(View, { style: s.section },
        el(Text, { style: s.sectionLabel }, `Top ${report.prioritized_questions.length} Questions for Seller`),
        ...report.prioritized_questions.map((q, i) =>
          el(View, { key: `q${i}`, style: s.numberedRow },
            el(View, { style: s.numCircle }, el(Text, { style: s.numText }, `${i + 1}`)),
            el(Text, { style: { ...s.listItem, flex: 1 } }, q),
          )
        ),
      ),

      // Strengths
      el(View, { style: s.section },
        el(Text, { style: { ...s.sectionLabel, color: TEAL } }, "Key Strengths"),
        ...report.key_strengths.map((str, i) =>
          el(Text, { key: `s${i}`, style: s.strengthItem }, `✓  ${str}`)
        ),
      ),

      // Next steps
      el(View, { style: s.section },
        el(Text, { style: { ...s.sectionLabel, color: "#06b6d4" } }, "Next Steps"),
        ...report.next_steps.map((step, i) =>
          el(View, { key: `n${i}`, style: s.numberedRow },
            el(View, { style: { ...s.numCircle, backgroundColor: "#06b6d422" } }, el(Text, { style: { ...s.numText, color: "#06b6d4" } }, `${i + 1}`)),
            el(Text, { style: { ...s.listItem, flex: 1 } }, step),
          )
        ),
      ),

      // Footer
      el(View, { style: s.footer, fixed: true },
        el(Text, { style: s.footerText }, `Solar Sentinel Risk Radar  |  Report ${meta.reportId}  |  ${meta.generatedAt.split("T")[0]}`),
        el(Text, { style: s.footerText }, "Page 2"),
      ),
    ),
  );
}

// ── Render ─────────────────────────────────────────────────────

export async function generateReportPDF(
  report: DiligenceReport,
  meta: PDFMeta
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = el(ReportPDF, { report, meta }) as any;
  const buffer = await renderToBuffer(doc);
  return Buffer.from(buffer);
}
