/**
 * GET /api/risk-radar/reports/{reportId}
 * GET /api/risk-radar/reports/{reportId}.pdf
 *
 * Serves generated reports. Checks Supabase first, falls back to /tmp.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReportFromDb } from "@/lib/sentinel-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;

  const isPDF = reportId.endsWith(".pdf");
  const cleanId = isPDF ? reportId.replace(/\.pdf$/, "") : reportId;

  // ── Try Supabase first (persistent, production) ──────────────
  const dbReport = await getReportFromDb(cleanId);
  if (dbReport) {
    if (isPDF) {
      // PDF not stored in DB — redirect to HTML view
      return new NextResponse(dbReport.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    return new NextResponse(dbReport.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // ── Fallback: /tmp file lookup (dev / same-invocation) ───────
  const fs = await import("fs/promises");
  const path = await import("path");

  const ext = isPDF ? "pdf" : "html";
  const filePath = path.join("/tmp", "risk-radar-reports", `${cleanId}.${ext}`);

  try {
    const data = await fs.readFile(filePath);

    if (isPDF) {
      return new NextResponse(data, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="sentinel-risk-radar-${cleanId}.pdf"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    return new NextResponse(data, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Report not found",
        message: `Report "${cleanId}" not found. It may have expired or not been generated yet.`,
      },
      { status: 404 }
    );
  }
}
