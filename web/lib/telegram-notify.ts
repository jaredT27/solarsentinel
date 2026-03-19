/**
 * Telegram Notification — Risk Radar Reports
 *
 * Styled to match the EXACT format of solar_sentinel_enhanced.py alerts:
 *   ☀️ NEW Solar Project  #TX
 *   🏗 West Texas Solar IV
 *   ...
 *
 * Uses the SAME bot token and channel IDs from your config.yaml.
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN  — Same bot as solar_sentinel_enhanced.py
 *   TELEGRAM_ADMIN_CHAT — config.yaml → telegram.admin_chat_id
 *   TELEGRAM_ALL_CHAT   — config.yaml → telegram.channels.all
 */

import type { DiligenceReport } from "./anthropic-diligence";
import type { QueueProject } from "./sentinel-db";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT ?? "";
const ALL_CHAT = process.env.TELEGRAM_ALL_CHAT ?? "";

export interface TelegramNotifyOptions {
  report: DiligenceReport;
  reportId: string;
  reportUrl: string;
  pdfUrl: string;
  dataCenterMode: boolean;
  projectId?: string;
  queueProject?: QueueProject | null;
  queueChanges?: {
    new_projects: string[];
    withdrawn: string[];
    capacity_changes: string[];
  };
}

function h(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ════════════════════════════════════════════════════════════════
// ADMIN MESSAGE — Full detail (matches Sentinel alert density)
// ════════════════════════════════════════════════════════════════

function buildAdminMessage(opts: TelegramNotifyOptions): string {
  const { report, reportId, reportUrl, pdfUrl, dataCenterMode, projectId, queueProject, queueChanges } = opts;

  // Risk emoji — matches severity scoring
  const riskEmoji = report.overall_risk_score === "High" ? "🔴" : report.overall_risk_score === "Medium" ? "🟡" : "🟢";
  const modeEmoji = dataCenterMode ? "⚡" : "☀️";
  const modeTag = dataCenterMode ? "#DataCenter" : "#Renewable";

  // Severity counts
  const reds    = report.risk_matrix.filter((r) => r.severity === "RED").length;
  const yellows = report.risk_matrix.filter((r) => r.severity === "YELLOW").length;
  const greens  = report.risk_matrix.filter((r) => r.severity === "GREEN").length;

  const lines: string[] = [
    // ── Header line (mirrors Sentinel: ☀️ NEW Solar Project  #TX)
    `🛡 <b>RISK RADAR REPORT</b>  ${modeEmoji} ${modeTag}`,
    "",

    // ── Risk score (prominent, like Sentinel capacity line)
    `${riskEmoji} <b>Overall Risk: ${report.overall_risk_score.toUpperCase()}</b>`,
    `<b>Breakdown:</b> ${reds > 0 ? `🔴 ${reds} RED` : ""}${yellows > 0 ? ` 🟡 ${yellows} YELLOW` : ""}${greens > 0 ? ` 🟢 ${greens} GREEN` : ""}`,
    "",
  ];

  // ── Queue context (mirrors Sentinel project details block)
  if (queueProject) {
    const qp = queueProject;
    lines.push(
      `🏗 <b>${h(qp.project_name)}</b>`,
      `<b>Type:</b> ${h(qp.gen_type)}`,
      `<b>Capacity:</b> ${qp.capacity_mw} MW`,
      `<b>County:</b> ${h(qp.county || "N/A")}`,
      `<b>State:</b> ${h(qp.state)}`,
      `<b>Status:</b> ${h(qp.status)}`,
      `<b>COD:</b> ${h(qp.proposed_cod || "TBD")}`,
      `<b>Queue ID:</b> <code>${h(qp.queue_id)}</code>`,
      `<b>ISO:</b> ${h(qp.iso)}`,
    );

    // ── Queue movement (matches Sentinel Δ Changes line)
    if (queueChanges) {
      const parts: string[] = [];
      if (queueChanges.new_projects.length)     parts.push(`+${queueChanges.new_projects.length} new`);
      if (queueChanges.withdrawn.length)        parts.push(`-${queueChanges.withdrawn.length} withdrawn`);
      if (queueChanges.capacity_changes.length) parts.push(`${queueChanges.capacity_changes.length} MW changes`);
      if (parts.length > 0) {
        lines.push("", `<b>Δ Queue Movement:</b> ${parts.join(" | ")}`);
      }
    }
    lines.push("");
  } else if (projectId) {
    lines.push(`📋 <b>Project:</b> <code>${h(projectId)}</code>`, "");
  }

  // ── Overview
  lines.push(`<b>Overview:</b>`, h(report.project_overview), "");

  // ── Top flags (RED first, then YELLOW — max 4)
  const topFlags = report.risk_matrix
    .filter((r) => r.severity === "RED" || r.severity === "YELLOW")
    .sort((a, b) => (a.severity === "RED" ? -1 : 1) - (b.severity === "RED" ? -1 : 1))
    .slice(0, 4);

  if (topFlags.length > 0) {
    lines.push("<b>Key Flags:</b>");
    for (const f of topFlags) {
      const icon = f.severity === "RED" ? "🔴" : "🟡";
      lines.push(`  ${icon} <b>${h(f.category)}</b>: ${h(f.title)}`);
    }
    lines.push("");
  }

  // ── DC mode: highlight load matching specifics
  if (dataCenterMode) {
    const loadMatch = report.risk_matrix.find((r) => r.category === "Load Matching");
    const firmPower = report.risk_matrix.find((r) => r.category === "Firm Power / Backup");
    if (loadMatch || firmPower) {
      lines.push("⚡ <b>Data Center Load Analysis:</b>");
      if (loadMatch) lines.push(`  📊 ${h(loadMatch.title)}`);
      if (firmPower) lines.push(`  🔋 ${h(firmPower.title)}`);
      lines.push("");
    }
  }

  // ── Stats line
  lines.push(
    `📄 <b>Docs Gaps:</b> ${report.document_gaps.length} missing`,
    `❓ <b>Seller Questions:</b> ${report.prioritized_questions.length}`,
    `✅ <b>Strengths:</b> ${report.key_strengths.length}`,
    `📌 <b>Next Steps:</b> ${report.next_steps.length}`,
    "",
  );

  // ── Report ID
  lines.push(`🆔 Report: <code>${h(reportId)}</code>`, "");

  // ── Links row (mirrors Sentinel 🔗 View ERCOT Queue | 📍 Google Earth)
  const links: string[] = [];
  links.push(`📎 <a href="${reportUrl}">View Full Report</a>`);
  links.push(`📄 <a href="${pdfUrl}">Download PDF</a>`);

  if (queueProject?.iso) {
    const isoUrls: Record<string, string> = {
      ERCOT: "https://www.ercot.com/gridinfo/resource",
      MISO: "https://www.misoenergy.org/planning/generator-interconnection/GI_Queue/",
      CAISO: "https://rimspub.caiso.com/rimsui/logon.do",
      PJM: "https://www.pjm.com/planning/services-requests/interconnection-queues",
      NYISO: "https://www.nyiso.com/interconnections",
      ISONE: "https://irtt.iso-ne.com/reports/external",
    };
    const queueUrl = isoUrls[queueProject.iso];
    if (queueUrl) {
      links.push(`🔗 <a href="${queueUrl}">View ${h(queueProject.iso)} Queue</a>`);
    }
  }

  lines.push(links.join(" | "));

  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════
// SUBSCRIBER MESSAGE — Compact (for the public channel)
// ════════════════════════════════════════════════════════════════

function buildSubscriberMessage(opts: TelegramNotifyOptions): string {
  const { report, reportUrl, dataCenterMode, queueProject } = opts;

  const riskEmoji = report.overall_risk_score === "High" ? "🔴" : report.overall_risk_score === "Medium" ? "🟡" : "🟢";
  const reds    = report.risk_matrix.filter((r) => r.severity === "RED").length;
  const yellows = report.risk_matrix.filter((r) => r.severity === "YELLOW").length;

  const lines: string[] = [
    `🛡 <b>New Risk Radar Report</b>`,
    "",
    `${riskEmoji} <b>${report.overall_risk_score.toUpperCase()} RISK</b>`,
  ];

  if (queueProject) {
    lines.push(`🏗 ${h(queueProject.project_name)} · ${queueProject.capacity_mw} MW · ${h(queueProject.iso)}`);
  }

  // Top flag
  const topFlag = report.risk_matrix.find((r) => r.severity === "RED") ?? report.risk_matrix.find((r) => r.severity === "YELLOW");
  if (topFlag) {
    const icon = topFlag.severity === "RED" ? "🔴" : "🟡";
    lines.push("", `${icon} ${h(topFlag.title)}`);
  }

  if (reds > 0 || yellows > 0) {
    lines.push(`${reds > 0 ? `🔴 ${reds} red flags` : ""}${reds > 0 && yellows > 0 ? " · " : ""}${yellows > 0 ? `🟡 ${yellows} caution items` : ""}`);
  }

  lines.push(
    "",
    `${dataCenterMode ? "⚡" : "☀️"} ${dataCenterMode ? "Data Center" : "Renewable"} Mode`,
    "",
    `📎 <a href="${reportUrl}">View Full Report</a>`,
  );

  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════
// SEND
// ════════════════════════════════════════════════════════════════

async function sendMessage(chatId: string, text: string): Promise<{ ok: boolean; messageId?: number }> {
  if (!BOT_TOKEN || !chatId) return { ok: false };

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    if (!res.ok) {
      console.error(`Telegram send failed (${chatId}):`, await res.text());
      return { ok: false };
    }

    const data = await res.json();
    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    console.error(`Telegram error (${chatId}):`, err);
    return { ok: false };
  }
}

/**
 * Send report to admin channel (full detail) + subscriber channel (compact).
 * Returns Telegram deep link to the admin message.
 */
export async function notifyTelegram(opts: TelegramNotifyOptions): Promise<string | null> {
  // Admin gets full report
  const adminMsg = buildAdminMessage(opts);
  const adminResult = await sendMessage(ADMIN_CHAT, adminMsg);

  // Subscribers get compact version
  if (ALL_CHAT) {
    const subMsg = buildSubscriberMessage(opts);
    await sendMessage(ALL_CHAT, subMsg);
  }

  // Return deep link if we got the message ID
  if (adminResult.ok && adminResult.messageId && ADMIN_CHAT) {
    const cleanId = ADMIN_CHAT.replace(/^-100/, "");
    return `https://t.me/c/${cleanId}/${adminResult.messageId}`;
  }

  return null;
}

// ── Exported for testing ──────────────────────────────────────

export { buildAdminMessage, buildSubscriberMessage };
