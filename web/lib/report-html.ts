/**
 * HTML Report Generator — Solar Sentinel Risk Radar
 *
 * Produces a full self-contained HTML page styled to match the
 * Sentinel dark theme (navy/teal/amber). Adapts language and
 * emphasis based on Data Center Mode vs Traditional Renewable.
 *
 * Also exports a compact summary variant for email embedding.
 */

import type { DiligenceReport } from "./anthropic-diligence";
import type { QueueProject } from "./sentinel-db";

// ── Shared types ──────────────────────────────────────────────────

export interface ReportMeta {
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

// ── Color tokens (matches Sentinel dark theme) ────────────────────

const C = {
  bg: "#0a0f1c",
  card: "#111827",
  cardBorder: "#1e293b",
  inner: "#0d1424",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  gold: "#f0c040",
  amber: "#f59e0b",
  text: "#e2e8f0",
  muted: "#94a3b8",
  dim: "#64748b",
  white: "#ffffff",
} as const;

const SEV = {
  RED:    { bg: "#450a0a", border: "#ef4444", text: "#fca5a5", dot: "#ef4444" },
  YELLOW: { bg: "#451a03", border: "#f59e0b", text: "#fcd34d", dot: "#f59e0b" },
  GREEN:  { bg: "#052e16", border: "#10b981", text: "#6ee7b7", dot: "#10b981" },
} as const;

const RISK_BADGE: Record<string, { bg: string; border: string; text: string }> = {
  High:   { bg: "#450a0a", border: "#ef4444", text: "#fca5a5" },
  Medium: { bg: "#451a03", border: "#f59e0b", text: "#fcd34d" },
  Low:    { bg: "#052e16", border: "#10b981", text: "#6ee7b7" },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ════════════════════════════════════════════════════════════════
// FULL HTML REPORT
// ════════════════════════════════════════════════════════════════

export function buildReportHTML(report: DiligenceReport, meta: ReportMeta): string {
  const rs = RISK_BADGE[report.overall_risk_score] ?? RISK_BADGE.Medium;
  const modeLabel = meta.dataCenterMode ? "Data Center Mode" : "Traditional Renewable";
  const modeIcon = meta.dataCenterMode ? "&#9889;" : "&#9728;&#65039;";

  const reds    = report.risk_matrix.filter((r) => r.severity === "RED").length;
  const yellows = report.risk_matrix.filter((r) => r.severity === "YELLOW").length;
  const greens  = report.risk_matrix.filter((r) => r.severity === "GREEN").length;

  // ── Risk matrix cards ───────────────────────────────
  const riskCards = report.risk_matrix.map((r) => {
    const sv = SEV[r.severity as keyof typeof SEV] ?? SEV.YELLOW;
    const isDcPriority = meta.dataCenterMode &&
      (r.category === "Load Matching" || r.category === "Firm Power / Backup" || r.category === "Colocation / Behind-the-Meter");

    return `
    <div style="border:1px solid ${isDcPriority ? sv.border + "66" : C.cardBorder};border-radius:10px;padding:16px;margin-bottom:10px;background:${isDcPriority ? sv.bg : C.inner};">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${sv.dot};display:inline-block;"></span>
        <span style="padding:2px 10px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${sv.bg};border:1px solid ${sv.border};color:${sv.text};">${r.severity}</span>
        <span style="font-size:11px;color:${C.dim};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${esc(r.category)}</span>
        ${isDcPriority ? `<span style="font-size:9px;padding:2px 8px;border-radius:4px;background:${C.teal}22;color:${C.teal};border:1px solid ${C.teal}44;font-weight:600;">DC PRIORITY</span>` : ""}
      </div>
      <div style="font-size:14px;font-weight:700;color:${C.white};margin-bottom:6px;">${esc(r.title)}</div>
      <div style="font-size:12px;color:${C.muted};line-height:1.6;margin-bottom:8px;">${esc(r.description)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:11px;">
        <span style="color:${C.dim};"><strong style="color:${C.muted};">Source:</strong> ${esc(r.citation)}</span>
        <span style="color:${C.dim};"><strong style="color:${C.muted};">Impact:</strong> ${esc(r.impact)}</span>
      </div>
    </div>`;
  }).join("");

  // ── Queue intel banner ──────────────────────────────
  let queueBanner = "";
  if (meta.queueProject) {
    const qp = meta.queueProject;
    const ch = meta.queueChanges;
    const changeParts: string[] = [];
    if (ch?.new_projects.length)     changeParts.push(`${ch.new_projects.length} new entries`);
    if (ch?.withdrawn.length)        changeParts.push(`${ch.withdrawn.length} withdrawn`);
    if (ch?.capacity_changes.length) changeParts.push(`${ch.capacity_changes.length} capacity changes`);

    queueBanner = `
    <div style="border:1px solid ${C.teal}44;border-radius:10px;padding:16px;margin-bottom:16px;background:${C.teal}08;">
      <div style="font-size:10px;font-weight:700;color:${C.teal};text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">&#128225; Solar Sentinel Queue Intel — Live Cross-Reference</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        ${[
          ["Queue ID", `<span style="font-family:monospace;color:${C.white};font-weight:600;">${esc(qp.queue_id)}</span>`],
          ["Project",  esc(qp.project_name)],
          ["Capacity", `<span style="color:${C.white};font-weight:700;">${qp.capacity_mw} MW</span> ${esc(qp.gen_type)}`],
          ["Location", `${esc(qp.iso)} &middot; ${esc(qp.state)}${qp.county ? ` &middot; ${esc(qp.county)} Co.` : ""}`],
          ["Status",   `<span style="color:${qp.status.toLowerCase() === "active" ? C.teal : C.amber};font-weight:600;">${esc(qp.status)}</span>`],
          ["COD",      esc(qp.proposed_cod || "TBD")],
        ].map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:${C.dim};width:90px;">${k}</td><td style="padding:4px 0;color:${C.text};">${v}</td></tr>`).join("")}
      </table>
      ${changeParts.length ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid ${C.teal}22;font-size:11px;color:${C.teal};">&#128200; <strong>${esc(qp.iso)} queue movement this week:</strong> ${esc(changeParts.join(" · "))}</div>` : ""}
    </div>`;
  }

  // ── Document gaps ───────────────────────────────────
  const gaps = report.document_gaps.map((g) =>
    `<div style="display:flex;gap:8px;margin-bottom:8px;font-size:12px;color:#fcd34d;"><span style="flex-shrink:0;margin-top:2px;">&#9888;</span><span>${esc(g)}</span></div>`
  ).join("");

  // ── Questions ───────────────────────────────────────
  const questions = report.prioritized_questions.map((q, i) =>
    `<div style="display:flex;gap:10px;margin-bottom:10px;"><span style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:${C.teal}22;color:${C.teal};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;">${i + 1}</span><span style="font-size:12px;color:${C.text};line-height:1.5;">${esc(q)}</span></div>`
  ).join("");

  // ── Strengths ───────────────────────────────────────
  const strengths = report.key_strengths.map((s) =>
    `<div style="display:flex;gap:8px;margin-bottom:8px;font-size:12px;color:#6ee7b7;"><span style="flex-shrink:0;">&#10003;</span><span>${esc(s)}</span></div>`
  ).join("");

  // ── Next steps ──────────────────────────────────────
  const steps = report.next_steps.map((s, i) =>
    `<div style="display:flex;gap:10px;margin-bottom:10px;"><span style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:${C.cyan}22;color:${C.cyan};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;">${i + 1}</span><span style="font-size:12px;color:${C.text};line-height:1.5;">${esc(s)}</span></div>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Risk Radar — ${esc(meta.reportId)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;background:${C.bg};color:${C.text};-webkit-font-smoothing:antialiased}
a{color:${C.teal};text-decoration:none}a:hover{text-decoration:underline}
.c{max-width:780px;margin:0 auto;padding:24px 16px}
@media(min-width:640px){.c{padding:40px 24px}}
.s{background:${C.card};border:1px solid ${C.cardBorder};border-radius:12px;padding:20px;margin-bottom:16px}
@media(min-width:640px){.s{padding:24px}}
.sl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.dim};margin-bottom:12px}
</style>
</head><body>
<div class="c">

<!-- NAV -->
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid ${C.cardBorder};">
  <div style="display:flex;align-items:center;gap:10px;">
    <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,${C.gold},${C.amber});display:flex;align-items:center;justify-content:center;font-size:18px;">&#9728;&#65039;</div>
    <span style="font-weight:700;font-size:16px;color:${C.white};">Solar Sentinel</span>
    <span style="font-size:9px;padding:3px 8px;border-radius:4px;background:${C.teal}22;color:${C.teal};border:1px solid ${C.teal}33;font-weight:700;">RISK RADAR</span>
  </div>
  <span style="font-size:11px;color:${C.dim};">${esc(meta.generatedAt.split("T")[0])}</span>
</div>

<!-- HEADER -->
<div class="s" style="border-color:${rs.border}44;">
  <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;">
    <div>
      <div style="font-size:10px;font-weight:700;color:${C.teal};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">&#128737; Diligence Report ${modeIcon} ${esc(modeLabel)}</div>
      <div style="font-size:11px;color:${C.dim};">
        ID: <span style="font-family:monospace;color:${C.muted};">${esc(meta.reportId)}</span>
        ${meta.projectId ? ` &middot; Queue: <span style="font-family:monospace;color:${C.muted};">${esc(meta.projectId)}</span>` : ""}
      </div>
    </div>
    <div style="padding:8px 18px;border-radius:8px;background:${rs.bg};border:1px solid ${rs.border};color:${rs.text};font-weight:800;font-size:15px;">
      ${report.overall_risk_score.toUpperCase()} RISK
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:16px;">
    <span style="padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;background:${SEV.RED.bg};border:1px solid ${SEV.RED.border}44;color:${SEV.RED.text};">${reds} RED</span>
    <span style="padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;background:${SEV.YELLOW.bg};border:1px solid ${SEV.YELLOW.border}44;color:${SEV.YELLOW.text};">${yellows} YELLOW</span>
    <span style="padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;background:${SEV.GREEN.bg};border:1px solid ${SEV.GREEN.border}44;color:${SEV.GREEN.text};">${greens} GREEN</span>
  </div>
  <div style="font-size:14px;line-height:1.7;color:${C.muted};">${esc(report.project_overview)}</div>
</div>

${queueBanner}

<!-- RISK MATRIX -->
<div class="s">
  <div class="sl" style="color:${C.teal};">${meta.dataCenterMode ? "&#9889; Risk Matrix — Data Center Priority Scoring" : "Risk Matrix"}</div>
  ${riskCards}
</div>

<!-- DOCUMENT GAPS -->
<div class="s">
  <div class="sl" style="color:${C.amber};">&#9888; Document Gaps (${report.document_gaps.length})</div>
  ${gaps}
</div>

<!-- QUESTIONS -->
<div class="s">
  <div class="sl">&#10067; Top ${report.prioritized_questions.length} Questions for Seller</div>
  ${questions}
</div>

<!-- STRENGTHS -->
<div class="s">
  <div class="sl" style="color:${C.teal};">&#10003; Key Strengths</div>
  ${strengths}
</div>

<!-- NEXT STEPS -->
<div class="s">
  <div class="sl" style="color:${C.cyan};">&#10148; Next Steps</div>
  ${steps}
</div>

<!-- FOOTER -->
<div style="text-align:center;padding:24px 0;border-top:1px solid ${C.cardBorder};">
  <div style="font-size:10px;color:${C.dim};line-height:1.8;">
    Solar Sentinel Risk Radar &middot; Confidential &middot; ${esc(modeLabel)}<br>
    Generated with AI analysis + human expert review framework<br>
    <a href="https://sentinel-alerts.vercel.app/risk-radar">sentinel-alerts.vercel.app/risk-radar</a>
  </div>
</div>

</div></body></html>`;
}

// ════════════════════════════════════════════════════════════════
// COMPACT SUMMARY (for email embedding)
// ════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildReportSummaryHTML(report: DiligenceReport, meta: ReportMeta): string {
  const rs = RISK_BADGE[report.overall_risk_score] ?? RISK_BADGE.Medium;
  const reds    = report.risk_matrix.filter((r) => r.severity === "RED").length;
  const yellows = report.risk_matrix.filter((r) => r.severity === "YELLOW").length;
  const greens  = report.risk_matrix.filter((r) => r.severity === "GREEN").length;

  const topFlags = report.risk_matrix
    .filter((r) => r.severity === "RED" || r.severity === "YELLOW")
    .slice(0, 3)
    .map((r) => {
      const icon = r.severity === "RED" ? "&#128308;" : "&#128993;";
      return `<div style="font-size:12px;color:${C.text};margin-bottom:4px;">${icon} <strong>${esc(r.category)}:</strong> ${esc(r.title)}</div>`;
    }).join("");

  return `
  <div style="background:${C.card};border:1px solid ${C.cardBorder};border-radius:10px;padding:20px;font-family:-apple-system,sans-serif;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:14px;font-weight:700;color:${C.white};">&#128737; Risk Radar</span>
      <span style="padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;background:${rs.bg};border:1px solid ${rs.border};color:${rs.text};">${report.overall_risk_score.toUpperCase()}</span>
    </div>
    <div style="font-size:12px;color:${C.muted};line-height:1.5;margin-bottom:12px;">${esc(report.project_overview)}</div>
    <div style="display:flex;gap:6px;margin-bottom:12px;">
      <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${SEV.RED.bg};color:${SEV.RED.text};">${reds}R</span>
      <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${SEV.YELLOW.bg};color:${SEV.YELLOW.text};">${yellows}Y</span>
      <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${SEV.GREEN.bg};color:${SEV.GREEN.text};">${greens}G</span>
    </div>
    ${topFlags}
    <div style="margin-top:10px;font-size:11px;color:${C.dim};">${report.document_gaps.length} doc gaps &middot; ${report.next_steps.length} action items</div>
  </div>`;
}
