/**
 * Report Engine — Solar Sentinel Risk Radar
 *
 * Unified orchestrator that takes a DiligenceReport JSON (from Prompt #1)
 * and produces all three output formats:
 *
 *   1. Full HTML report page (dark Sentinel theme, DC mode emphasis)
 *   2. Compact PDF (2-page, dark branded, multi-section)
 *   3. Telegram message (emoji severity flags, queue cross-ref, deep links)
 *
 * Also handles auto-pull of latest queue intel when a projectId is provided.
 *
 * Usage:
 *   import { generateFullReport } from "@/lib/report-engine";
 *
 *   const result = await generateFullReport({
 *     report: diligenceJSON,
 *     reportId: "rr-2026-03-15-a1b2c3",
 *     dataCenterMode: true,
 *     projectId: "ERCOT-Q2025-04812",
 *   });
 *
 *   // result.html     — full HTML string
 *   // result.pdf      — Buffer
 *   // result.telegram  — { adminSent, subscriberSent, deepLink }
 *   // result.meta      — enriched metadata (with queue data)
 */

import { buildReportHTML, buildReportSummaryHTML, type ReportMeta } from "./report-html";
import { generateReportPDF } from "./report-pdf";
import { notifyTelegram, buildAdminMessage, buildSubscriberMessage, type TelegramNotifyOptions } from "./telegram-notify";
import { lookupProject, getRecentQueueChanges, type QueueProject } from "./sentinel-db";
import type { DiligenceReport } from "./anthropic-diligence";

// ── Input ──────────────────────────────────────────────────────

export interface ReportEngineInput {
  /** The diligence JSON from Claude (Prompt #1 output) */
  report: DiligenceReport;
  /** Unique report identifier */
  reportId: string;
  /** Data Center Mode vs Traditional Renewable */
  dataCenterMode: boolean;
  /** Optional Solar Sentinel queue ID for auto-pull */
  projectId?: string;
  /** Base URL for report links */
  baseUrl?: string;
  /** Skip Telegram notifications */
  skipTelegram?: boolean;
  /** Skip PDF generation (faster) */
  skipPdf?: boolean;
  /** Pre-fetched queue project (skips DB lookup if provided) */
  queueProject?: QueueProject | null;
}

// ── Output ─────────────────────────────────────────────────────

export interface ReportEngineOutput {
  /** Full HTML report (self-contained, dark theme) */
  html: string;
  /** Compact HTML summary (for email embedding) */
  htmlSummary: string;
  /** PDF buffer (null if skipped) */
  pdf: Buffer | null;
  /** Telegram results */
  telegram: {
    adminMessage: string;
    subscriberMessage: string;
    deepLink: string | null;
    sent: boolean;
  };
  /** Enriched metadata (includes queue data if found) */
  meta: ReportMeta;
  /** Report URLs */
  urls: {
    html: string;
    pdf: string;
  };
}

// ── Main ───────────────────────────────────────────────────────

export async function generateFullReport(input: ReportEngineInput): Promise<ReportEngineOutput> {
  const {
    report,
    reportId,
    dataCenterMode,
    projectId,
    baseUrl = "https://sentinel-alerts.vercel.app",
    skipTelegram = false,
    skipPdf = false,
  } = input;

  // ── Step 1: Auto-pull queue intel ─────────────────────
  let queueProject: QueueProject | null = input.queueProject ?? null;
  let queueChanges: Awaited<ReturnType<typeof getRecentQueueChanges>> | undefined;

  if (projectId && !queueProject) {
    queueProject = await lookupProject(projectId);
  }

  if (queueProject) {
    queueChanges = await getRecentQueueChanges(queueProject.iso);
  }

  // ── Step 2: Build metadata ────────────────────────────
  const meta: ReportMeta = {
    reportId,
    dataCenterMode,
    projectId,
    generatedAt: new Date().toISOString(),
    queueProject,
    queueChanges,
  };

  const urls = {
    html: `${baseUrl}/api/risk-radar/reports/${reportId}`,
    pdf: `${baseUrl}/api/risk-radar/reports/${reportId}.pdf`,
  };

  // ── Step 3: Generate all outputs in parallel ──────────
  const telegramOpts: TelegramNotifyOptions = {
    report,
    reportId,
    reportUrl: urls.html,
    pdfUrl: urls.pdf,
    dataCenterMode,
    projectId,
    queueProject,
    queueChanges,
  };

  // Pre-build messages (always, even if not sending)
  const adminMessage = buildAdminMessage(telegramOpts);
  const subscriberMessage = buildSubscriberMessage(telegramOpts);

  // Run HTML + PDF + Telegram in parallel
  const [html, htmlSummary, pdf, telegramLink] = await Promise.all([
    // HTML — synchronous but wrapped for Promise.all
    Promise.resolve(buildReportHTML(report, meta)),

    // Summary HTML
    Promise.resolve(buildReportSummaryHTML(report, meta)),

    // PDF
    skipPdf
      ? Promise.resolve(null)
      : generateReportPDF(report, {
          reportId,
          dataCenterMode,
          projectId,
          generatedAt: meta.generatedAt,
          queueProject,
          queueChanges,
        }).catch((err) => {
          console.error(`[${reportId}] PDF generation failed:`, err);
          return null;
        }),

    // Telegram
    skipTelegram
      ? Promise.resolve(null)
      : notifyTelegram(telegramOpts).catch((err) => {
          console.error(`[${reportId}] Telegram notification failed:`, err);
          return null;
        }),
  ]);

  return {
    html,
    htmlSummary,
    pdf,
    telegram: {
      adminMessage,
      subscriberMessage,
      deepLink: telegramLink,
      sent: !skipTelegram && telegramLink !== null,
    },
    meta,
    urls,
  };
}
