/**
 * Anthropic Claude — Power Procurement Diligence Engine
 *
 * Uses the system prompt from Prompt #1 (the procurement expert persona)
 * to analyze uploaded documents and queue context.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { QueueProject } from "./sentinel-db";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _client;
}

// ── The full procurement expert system prompt from Prompt #1 ──────

const SYSTEM_PROMPT = `You are a world-class power procurement and diligence expert with 15+ years at hyperscalers and renewable developers. You have personally diligenced 500+ PPAs, ICAs, colocation agreements, and offtake contracts for AI data centers + solar/BESS/hybrid projects in ERCOT, PJM, MISO, CAISO, etc.

Your tone is precise, skeptical, and finance-focused — you kill deals on red flags and speak like a senior director of energy procurement at Google/Microsoft/Meta.

When given parsed documents + optional Solar Sentinel queue context + optional "Data Center Mode: true", output **strict JSON only** (no extra text):
{
  "project_overview": "2–3 sentence summary (size, location, type, data-center relevance)",
  "overall_risk_score": "Low | Medium | High",
  "risk_matrix": [
    {
      "category": "PPA | Interconnection | Site Control | Load Matching | Credit / Counterparty | Environmental / Air Permitting | Colocation / Behind-the-Meter | Firm Power / Backup | Regulatory | Other",
      "severity": "RED | YELLOW | GREEN",
      "title": "One-line title",
      "description": "Detailed explanation with $ impact (especially hourly load matching, climate yield risk, spot-market exposure)",
      "citation": "Exact filename + page/section",
      "impact": "Financial / Timeline / Bankability impact in 1 sentence"
    }
  ],
  "document_gaps": ["Missing critical docs with why they matter for data-center deals"],
  "prioritized_questions": ["Top 5 questions for seller/developer, ranked by urgency"],
  "key_strengths": ["Bullet list"],
  "next_steps": ["3–5 actionable recommendations"]
}

Special rules for Data Center Mode:
- Prioritize 24/7 load matching, hourly shape risk, curtailment clauses, and firm power guarantees.
- Flag any mismatch between solar/BESS profile and AI hyperscale demand.
- Cross-reference queue shifts from Solar Sentinel (e.g., "This matches the +45 MW interconnection advancement we alerted yesterday").

If Data Center Mode is false, fall back to standard renewable investor diligence.`;

// ── Types ─────────────────────────────────────────────────────────

export interface DiligenceReport {
  project_overview: string;
  overall_risk_score: "Low" | "Medium" | "High";
  risk_matrix: Array<{
    category: string;
    severity: "RED" | "YELLOW" | "GREEN";
    title: string;
    description: string;
    citation: string;
    impact: string;
  }>;
  document_gaps: string[];
  prioritized_questions: string[];
  key_strengths: string[];
  next_steps: string[];
}

// ── Build the user message with all context ──────────────────────

function buildUserMessage(opts: {
  documentTexts: Array<{ filename: string; content: string }>;
  dataCenterMode: boolean;
  queueContext?: QueueProject | null;
  queueChanges?: {
    new_projects: string[];
    withdrawn: string[];
    capacity_changes: string[];
  };
}): string {
  const parts: string[] = [];

  parts.push(`Data Center Mode: ${opts.dataCenterMode}`);
  parts.push("");

  // Queue context from Solar Sentinel
  if (opts.queueContext) {
    parts.push("=== SOLAR SENTINEL QUEUE CONTEXT ===");
    parts.push(`Queue ID: ${opts.queueContext.queue_id}`);
    parts.push(`ISO: ${opts.queueContext.iso}`);
    parts.push(`Project: ${opts.queueContext.project_name}`);
    parts.push(`Capacity: ${opts.queueContext.capacity_mw} MW`);
    parts.push(`Type: ${opts.queueContext.gen_type}`);
    parts.push(`State: ${opts.queueContext.state}, County: ${opts.queueContext.county}`);
    parts.push(`Status: ${opts.queueContext.status}`);
    parts.push(`Proposed COD: ${opts.queueContext.proposed_cod}`);
    if (opts.queueContext.lat && opts.queueContext.lon) {
      parts.push(`Coordinates: ${opts.queueContext.lat}, ${opts.queueContext.lon}`);
    }
    parts.push("");
  }

  // Recent queue changes for cross-referencing
  if (opts.queueChanges) {
    parts.push("=== RECENT QUEUE CHANGES (past 7 days) ===");
    if (opts.queueChanges.new_projects.length > 0) {
      parts.push(`New entries: ${opts.queueChanges.new_projects.slice(0, 10).join(", ")}`);
    }
    if (opts.queueChanges.withdrawn.length > 0) {
      parts.push(`Withdrawn: ${opts.queueChanges.withdrawn.slice(0, 10).join(", ")}`);
    }
    if (opts.queueChanges.capacity_changes.length > 0) {
      parts.push(`Capacity changes: ${opts.queueChanges.capacity_changes.slice(0, 10).join("; ")}`);
    }
    parts.push("");
  }

  // Parsed documents
  parts.push("=== UPLOADED DOCUMENTS ===");
  for (const doc of opts.documentTexts) {
    parts.push(`\n--- FILE: ${doc.filename} ---`);
    // Truncate individual docs to ~30k chars to stay within context
    const truncated =
      doc.content.length > 30_000
        ? doc.content.slice(0, 30_000) + "\n[... truncated, document continues ...]"
        : doc.content;
    parts.push(truncated);
  }

  parts.push("\n\nNow analyze these documents + queue context. Return STRICT JSON ONLY.");
  return parts.join("\n");
}

// ── Main analysis function ───────────────────────────────────────

export async function runDiligenceAnalysis(opts: {
  documentTexts: Array<{ filename: string; content: string }>;
  dataCenterMode: boolean;
  queueContext?: QueueProject | null;
  queueChanges?: {
    new_projects: string[];
    withdrawn: string[];
    capacity_changes: string[];
  };
}): Promise<DiligenceReport> {
  const userMessage = buildUserMessage(opts);

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract text from response
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Parse JSON from response (handle possible markdown code fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude did not return valid JSON. Raw response saved for debugging.");
  }

  const report: DiligenceReport = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!report.project_overview || !report.overall_risk_score || !report.risk_matrix) {
    throw new Error("Claude response missing required report fields.");
  }

  return report;
}
