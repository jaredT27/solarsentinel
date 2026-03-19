/**
 * POST /api/risk-radar — Solar Sentinel Risk Radar API
 *
 * Full diligence analysis pipeline:
 *   1. Accept file uploads (multipart) or projectId reference
 *   2. Parse documents (PDF, DOCX, XLSX, CSV, JSON)
 *   3. Pull queue context from Solar Sentinel snapshots
 *   4. Run Anthropic Claude diligence analysis
 *   5. Generate HTML + PDF reports
 *   6. Send Telegram notification
 *   7. Optionally create Stripe checkout session
 *   8. Return report URL + metadata
 *
 * ════════════════════════════════════════════════════════════════
 * ENVIRONMENT VARIABLES (add to Vercel project settings):
 * ════════════════════════════════════════════════════════════════
 *
 *   # Anthropic (required)
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 *   # Telegram (same as your Python bot)
 *   TELEGRAM_BOT_TOKEN=...
 *   TELEGRAM_ADMIN_CHAT=-1003840152476     # from config.yaml
 *   TELEGRAM_ALL_CHAT=-1003707091212       # from config.yaml
 *
 *   # Stripe
 *   STRIPE_SECRET_KEY=sk_live_... or sk_test_...
 *   STRIPE_PRICE_PRO=price_...             # $499 product
 *   STRIPE_PRICE_PIPELINE=price_...        # $1,999/mo product
 *
 *   # App
 *   NEXT_PUBLIC_BASE_URL=https://sentinel-alerts.vercel.app
 *   API_AUTH_TOKEN=your-secret-api-key     # simple auth for now
 *
 *   # Optional: Supabase (when you migrate from JSON snapshots)
 *   # SUPABASE_URL=https://xxx.supabase.co
 *   # SUPABASE_KEY=eyJ...
 *
 * ════════════════════════════════════════════════════════════════
 * REQUEST FORMAT:
 * ════════════════════════════════════════════════════════════════
 *
 * Content-Type: multipart/form-data
 *
 * Fields:
 *   files[]         — One or more files (PDF, DOCX, XLSX, CSV, JSON)
 *   projectId       — Optional Solar Sentinel queue ID (e.g. "ERCOT-Q2025-04812")
 *   dataCenterMode  — "true" (default) or "false"
 *   email           — Customer email (for Stripe + report delivery)
 *   tier            — "pro" | "pipeline" | "free_trial"
 *
 * ════════════════════════════════════════════════════════════════
 * RESPONSE:
 * ════════════════════════════════════════════════════════════════
 *
 * {
 *   "reportId": "rr-2026-03-15-a1b2c3",
 *   "reportUrl": "https://sentinel-alerts.vercel.app/api/risk-radar/reports/rr-2026-03-15-a1b2c3",
 *   "pdfUrl": "https://sentinel-alerts.vercel.app/api/risk-radar/reports/rr-2026-03-15-a1b2c3.pdf",
 *   "telegramLink": "https://t.me/c/...",
 *   "riskScore": "Medium",
 *   "modeUsed": "data_center",
 *   "checkoutUrl": "https://checkout.stripe.com/...",  // if tier != free_trial
 *   "report": { ... }  // full JSON report (only for free_trial or paid)
 * }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { rateLimit } from "@/lib/rate-limit";
import { lookupProject, getRecentQueueChanges, storeReportInDb } from "@/lib/sentinel-db";
import { runDiligenceAnalysis, type DiligenceReport } from "@/lib/anthropic-diligence";
import { parseDocuments, type ParsedDocument } from "@/lib/parse-documents";
import { generateFullReport } from "@/lib/report-engine";
import { createCheckoutSession, type PricingTier } from "@/lib/stripe-checkout";

// ── Config ─────────────────────────────────────────────────────

const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_FILES = 50;
const VALID_TIERS: PricingTier[] = [
  "pro",
  "pipeline",
];

// ── Report storage ─────────────────────────────────────────────
// Uses /tmp for Vercel serverless compatibility.
// For persistent storage, upgrade to Vercel Blob:
//
//   import { put } from "@vercel/blob";
//   const { url } = await put(`reports/${reportId}.html`, html, { access: "public" });

import { writeFile, mkdir } from "fs/promises";
import path from "path";

const REPORTS_DIR = path.join("/tmp", "risk-radar-reports");

async function storeReport(
  reportId: string,
  html: string,
  pdf: Buffer,
  report: DiligenceReport
): Promise<void> {
  await mkdir(REPORTS_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(REPORTS_DIR, `${reportId}.html`), html, "utf-8"),
    writeFile(path.join(REPORTS_DIR, `${reportId}.pdf`), pdf),
    writeFile(path.join(REPORTS_DIR, `${reportId}.json`), JSON.stringify(report, null, 2), "utf-8"),
  ]);
}

// ── Auth helper ────────────────────────────────────────────────

function authenticate(req: NextRequest): boolean {
  // For free trial / demo, allow unauthenticated
  // For paid tiers, require API key or session token
  const authHeader = req.headers.get("authorization");
  const apiToken = process.env.API_AUTH_TOKEN;

  // Skip auth for free trials
  if (!apiToken) return true;

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7) === apiToken;
  }

  // Also accept as query param for simple integrations
  const url = new URL(req.url);
  return url.searchParams.get("token") === apiToken;
}

// ── Main POST handler ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Rate limiting ────────────────────────────────────────
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const { ok: rateLimitOk, remaining } = rateLimit(clientIp);

    if (!rateLimitOk) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: "Maximum 5 requests per minute. Please wait and try again.",
          retryAfter: 60,
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // ── Parse multipart form data ────────────────────────────
    const formData = await req.formData();

    const projectId = formData.get("projectId")?.toString().trim() ?? "";
    const dataCenterMode = formData.get("dataCenterMode")?.toString() !== "false";
    const email = formData.get("email")?.toString().trim() ?? "";
    const tier = formData.get("tier")?.toString().trim() ?? "free_trial";

    // ── Auth check (skip for free trial) ─────────────────────
    if (tier !== "free_trial" && !authenticate(req)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid or missing API token." },
        { status: 401 }
      );
    }

    // ── Extract uploaded files ────────────────────────────────
    const fileEntries: Array<{ filename: string; buffer: Buffer }> = [];
    let totalSize = 0;

    // formData.getAll("files[]") handles multiple file uploads
    // Also check "files" key (some clients use different naming)
    const fileFields = [
      ...formData.getAll("files[]"),
      ...formData.getAll("files"),
    ];

    for (const entry of fileFields) {
      if (!(entry instanceof File)) continue;
      if (fileEntries.length >= MAX_FILES) {
        return NextResponse.json(
          { error: "Too many files", message: `Maximum ${MAX_FILES} files per request.` },
          { status: 400 }
        );
      }

      const arrayBuf = await entry.arrayBuffer();
      totalSize += arrayBuf.byteLength;

      if (totalSize > MAX_TOTAL_SIZE) {
        return NextResponse.json(
          { error: "Payload too large", message: "Total upload size exceeds 200 MB." },
          { status: 413 }
        );
      }

      fileEntries.push({
        filename: entry.name,
        buffer: Buffer.from(arrayBuf),
      });
    }

    // Must have files OR a projectId
    if (fileEntries.length === 0 && !projectId) {
      return NextResponse.json(
        {
          error: "No input provided",
          message:
            "Upload at least one document (files[] field) or provide a projectId from a Solar Sentinel alert.",
        },
        { status: 400 }
      );
    }

    // ── Generate report ID ───────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const reportId = `rr-${today}-${uuidv4().slice(0, 8)}`;

    // ── Step 1: Parse documents ──────────────────────────────
    let parsedDocs: ParsedDocument[] = [];
    if (fileEntries.length > 0) {
      parsedDocs = await parseDocuments(fileEntries);

      // Check for parse errors (warn but don't fail)
      const parseErrors = parsedDocs.filter((d) => d.error);
      if (parseErrors.length > 0) {
        console.warn(
          `[${reportId}] Parse warnings:`,
          parseErrors.map((d) => `${d.filename}: ${d.error}`)
        );
      }
    }

    // ── Step 2: Pull queue context from Solar Sentinel ───────
    //
    // This reads from the SAME snapshot files your Python bot writes:
    //   data/snapshot_ERCOT.json
    //   data/snapshot_MISO.json
    //   etc.
    //
    // See lib/sentinel-db.ts for connection options (JSON / Supabase / KV)

    let queueContext: Awaited<ReturnType<typeof lookupProject>> = null;
    let queueChanges: Awaited<ReturnType<typeof getRecentQueueChanges>> | undefined = undefined;

    if (projectId) {
      queueContext = await lookupProject(projectId);

      if (queueContext) {
        // Get recent changes for the same ISO (for cross-referencing)
        queueChanges = await getRecentQueueChanges(queueContext.iso);
        console.log(
          `[${reportId}] Queue context found: ${queueContext.project_name} (${queueContext.capacity_mw} MW, ${queueContext.iso})`
        );
      } else {
        console.warn(
          `[${reportId}] Project ID "${projectId}" not found in any ISO snapshot. ` +
          `Proceeding without queue context. ` +
          `Make sure solar_sentinel_enhanced.py has run recently.`
        );
      }
    }

    // ── Step 3: Run Claude diligence analysis ────────────────
    //
    // Uses the procurement expert persona from Prompt #1.
    // Model: claude-sonnet-4-6 (fast, capable, cost-effective for structured output)
    // Upgrade to claude-opus-4-6 for highest-stakes deals.

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error: "Configuration error",
          message: "ANTHROPIC_API_KEY not set. Add it to your Vercel environment variables.",
        },
        { status: 500 }
      );
    }

    let report: DiligenceReport;
    try {
      report = await runDiligenceAnalysis({
        documentTexts: parsedDocs
          .filter((d) => d.content.length > 0)
          .map((d) => ({ filename: d.filename, content: d.content })),
        dataCenterMode,
        queueContext,
        queueChanges,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${reportId}] Claude analysis failed:`, msg);
      return NextResponse.json(
        {
          error: "Analysis failed",
          message: `Claude analysis error: ${msg}`,
          reportId,
        },
        { status: 502 }
      );
    }

    // ── Step 4: Generate all outputs (HTML + PDF + Telegram) ──
    //
    // The report engine orchestrates all three outputs in parallel,
    // auto-pulls queue intel from Solar Sentinel, and applies
    // Data Center Mode emphasis where relevant.

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://sentinel-alerts.vercel.app";

    const engineResult = await generateFullReport({
      report,
      reportId,
      dataCenterMode,
      projectId: projectId || undefined,
      baseUrl,
      queueProject: queueContext,
      skipTelegram: false,
      skipPdf: false,
    });

    // ── Step 5: Store report ─────────────────────────────────
    // Primary: Supabase (persistent). Fallback: /tmp (ephemeral).

    const storedInDb = await storeReportInDb({
      reportId,
      email,
      tier,
      projectId: projectId || undefined,
      riskScore: report.overall_risk_score,
      filesProcessed: parsedDocs.length,
      dataCenterMode,
      reportJson: report as unknown as Record<string, unknown>,
      reportHtml: engineResult.html,
      queueContextFound: !!queueContext,
      elapsedMs: Date.now() - startTime,
      stripeSessionId: undefined, // set after Stripe checkout below
    });

    if (!storedInDb) {
      // Fallback to /tmp if Supabase unavailable
      console.warn(`[${reportId}] Supabase unavailable, falling back to /tmp storage`);
      await storeReport(
        reportId,
        engineResult.html,
        engineResult.pdf ?? Buffer.from("PDF unavailable"),
        report
      );
    }

    const reportUrl = engineResult.urls.html;
    const pdfUrl = engineResult.urls.pdf;
    const telegramLink = engineResult.telegram.deepLink;

    // ── Step 6: Create Stripe checkout (if not free trial) ───
    let checkoutUrl: string | null = null;
    let sessionId: string | null = null;

    if (tier !== "free_trial" && VALID_TIERS.includes(tier as PricingTier)) {
      if (!email) {
        return NextResponse.json(
          {
            error: "Email required",
            message: "Email is required for paid tiers to create a checkout session.",
            reportId,
            riskScore: report.overall_risk_score,
          },
          { status: 400 }
        );
      }

      try {
        const checkout = await createCheckoutSession({
          tier: tier as PricingTier,
          customerEmail: email,
          reportId,
          projectId: projectId || undefined,
          dataCenterMode,
        });
        checkoutUrl = checkout.checkoutUrl;
        sessionId = checkout.sessionId;
      } catch (err) {
        console.error(`[${reportId}] Stripe checkout failed:`, err);
        // Non-blocking — return report without checkout
      }
    }

    // ── Step 8: Return response ──────────────────────────────
    const elapsed = Date.now() - startTime;
    console.log(
      `[${reportId}] Analysis complete in ${elapsed}ms. ` +
      `Risk: ${report.overall_risk_score}. ` +
      `Mode: ${dataCenterMode ? "data_center" : "traditional"}. ` +
      `Files: ${parsedDocs.length}. ` +
      `Queue: ${queueContext ? queueContext.queue_id : "none"}.`
    );

    const response: Record<string, unknown> = {
      reportId,
      reportUrl,
      pdfUrl,
      telegramLink,
      riskScore: report.overall_risk_score,
      modeUsed: dataCenterMode ? "data_center" : "traditional",
      filesProcessed: parsedDocs.length,
      queueContextFound: !!queueContext,
      elapsedMs: elapsed,
    };

    // Include full report for free trials (paid users see it after checkout)
    if (tier === "free_trial") {
      response.report = report;
    }

    // Include checkout URL if created
    if (checkoutUrl) {
      response.checkoutUrl = checkoutUrl;
      response.stripeSessionId = sessionId;
    }

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "X-RateLimit-Remaining": String(remaining),
        "X-Report-Id": reportId,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[risk-radar] Unhandled error:", msg);
    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          process.env.NODE_ENV === "development"
            ? msg
            : "An unexpected error occurred. Please try again or contact support.",
      },
      { status: 500 }
    );
  }
}

// ── GET handler for health check ────────────────────────────────

export async function GET() {
  return NextResponse.json({
    service: "Solar Sentinel Risk Radar",
    version: "1.0.0",
    status: "operational",
    endpoints: {
      analyze: "POST /api/risk-radar",
      report_html: "GET /api/risk-radar/reports/{reportId}",
      report_pdf: "GET /api/risk-radar/reports/{reportId}.pdf",
    },
    pricing: {
      free: "First report free, no credit card",
      pro: "$499/report",
      pipeline: "$1,999/mo (up to 10 reports)",
      partners: "Custom — contact sales",
    },
    supported_formats: ["pdf", "docx", "xlsx", "csv", "json", "txt"],
    isos_monitored: ["ERCOT", "MISO", "CAISO", "PJM", "NYISO", "ISONE"],
  });
}
