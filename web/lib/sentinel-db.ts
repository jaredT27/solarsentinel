/**
 * Solar Sentinel Queue Database Connector
 *
 * Reads queue data from Supabase (production) with JSON file fallback (dev).
 *
 * Environment:
 *   SUPABASE_URL=https://epgrufblflvkmomhkzav.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJ...  (service role key for server-side access)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import path from "path";

export interface QueueProject {
  queue_id: string;
  iso: string;
  project_name: string;
  capacity_mw: number;
  state: string;
  county: string;
  gen_type: string;
  status: string;
  proposed_cod: string;
  lat: number | null;
  lon: number | null;
  raw: Record<string, unknown>;
}

// ── Supabase client (lazy singleton) ─────────────────────────

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

// ── JSON file fallback (dev only) ────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "..", "data");
const ISO_LIST = ["ERCOT", "MISO", "CAISO", "PJM", "NYISO", "ISONE"] as const;

async function loadSnapshot(iso: string): Promise<Record<string, Record<string, unknown>>> {
  try {
    const raw = await readFile(path.join(DATA_DIR, `snapshot_${iso}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Look up a project by Queue ID.
 *
 * Accepts formats like:
 *   "ERCOT-16INR0049"   → searches by composite ID
 *   "16INR0049"          → searches by raw queue_id
 *   "ERCOT-Q2025-04812" → searches by composite ID
 */
export async function lookupProject(projectId: string): Promise<QueueProject | null> {
  const normalized = projectId.trim();

  // ── Try Supabase first ──
  const sb = getSupabase();
  if (sb) {
    // Try exact match on composite id
    const { data: exact } = await sb
      .from("queue_projects")
      .select("*")
      .eq("id", normalized.toUpperCase())
      .limit(1)
      .maybeSingle();

    if (exact) return supabaseRowToProject(exact);

    // Try match on raw queue_id
    const { data: byQid } = await sb
      .from("queue_projects")
      .select("*")
      .eq("queue_id", normalized.toUpperCase())
      .limit(1)
      .maybeSingle();

    if (byQid) return supabaseRowToProject(byQid);

    // Fuzzy search (ILIKE)
    const { data: fuzzy } = await sb
      .from("queue_projects")
      .select("*")
      .or(`id.ilike.%${normalized}%,queue_id.ilike.%${normalized}%,project_name.ilike.%${normalized}%`)
      .limit(1)
      .maybeSingle();

    if (fuzzy) return supabaseRowToProject(fuzzy);

    return null;
  }

  // ── Fallback: JSON snapshots (dev) ──
  const prefixMatch = normalized.toUpperCase().match(/^(ERCOT|MISO|CAISO|PJM|NYISO|ISONE)-(.+)$/);
  const isosToSearch = prefixMatch ? [prefixMatch[1]] : [...ISO_LIST];

  for (const iso of isosToSearch) {
    const snapshot = await loadSnapshot(iso);

    if (snapshot[projectId]) {
      return normalizeProject(projectId, iso, snapshot[projectId]);
    }

    for (const [qid, data] of Object.entries(snapshot)) {
      if (
        qid.toUpperCase().includes(normalized.toUpperCase()) ||
        normalized.toUpperCase().includes(qid.toUpperCase())
      ) {
        return normalizeProject(qid, iso, data);
      }
    }
  }

  return null;
}

/**
 * Get recent queue changes for a given ISO.
 * Compares current data against records with older last_updated timestamps.
 */
export async function getRecentQueueChanges(
  iso: string
): Promise<{ new_projects: string[]; withdrawn: string[]; capacity_changes: string[] }> {
  const sb = getSupabase();

  if (sb) {
    // New projects: first_seen in the last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: newProjects } = await sb
      .from("queue_projects")
      .select("id")
      .eq("iso", iso)
      .gte("first_seen", weekAgo);

    // For withdrawn/capacity changes we'd need historical data.
    // For now, return new projects from Supabase + empty arrays for the rest.
    // The weekly baseline comparison still works via JSON fallback if needed.
    return {
      new_projects: (newProjects ?? []).map((p) => p.id),
      withdrawn: [],
      capacity_changes: [],
    };
  }

  // ── Fallback: JSON baseline comparison ──
  const current = await loadSnapshot(iso);
  let baseline: Record<string, Record<string, unknown>> = {};
  try {
    const raw = await readFile(
      path.join(DATA_DIR, "weekly_baselines", `baseline_${iso}.json`),
      "utf-8"
    );
    baseline = JSON.parse(raw);
  } catch {
    // No baseline = first run
  }

  const new_projects = Object.keys(current).filter((k) => !baseline[k]);
  const withdrawn = Object.keys(baseline).filter((k) => !current[k]);
  const capacity_changes: string[] = [];

  for (const [qid, proj] of Object.entries(current)) {
    if (baseline[qid]) {
      const oldCap = Number(baseline[qid]["Capacity (MW)"] ?? 0);
      const newCap = Number(proj["Capacity (MW)"] ?? 0);
      if (oldCap !== newCap) {
        const delta = newCap - oldCap;
        capacity_changes.push(
          `${qid}: ${delta > 0 ? "+" : ""}${delta} MW (${oldCap} → ${newCap})`
        );
      }
    }
  }

  return { new_projects, withdrawn, capacity_changes };
}

/**
 * Store a Risk Radar report in Supabase.
 */
export async function storeReportInDb(params: {
  reportId: string;
  email: string;
  tier: string;
  projectId?: string;
  riskScore: string;
  riskScoreNumeric?: number;
  filesProcessed: number;
  dataCenterMode: boolean;
  reportJson: Record<string, unknown>;
  reportHtml: string;
  queueContextFound: boolean;
  elapsedMs: number;
  stripeSessionId?: string;
}): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.from("risk_radar_reports").insert({
    id: params.reportId,
    email: params.email || null,
    tier: params.tier,
    project_id: params.projectId || null,
    risk_score: params.riskScore,
    risk_score_numeric: params.riskScoreNumeric ?? null,
    files_processed: params.filesProcessed,
    data_center_mode: params.dataCenterMode,
    report_json: params.reportJson,
    report_html: params.reportHtml,
    queue_context_found: params.queueContextFound,
    elapsed_ms: params.elapsedMs,
    stripe_session_id: params.stripeSessionId ?? null,
  });

  if (error) {
    console.error("[sentinel-db] Failed to store report:", error.message);
    return false;
  }
  return true;
}

/**
 * Retrieve a stored report by ID.
 */
export async function getReportFromDb(
  reportId: string
): Promise<{ html: string; json: Record<string, unknown> } | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("risk_radar_reports")
    .select("report_html, report_json")
    .eq("id", reportId)
    .maybeSingle();

  if (error || !data) return null;
  return { html: data.report_html, json: data.report_json };
}

// ── Helpers ──────────────────────────────────────────────────

function supabaseRowToProject(row: Record<string, unknown>): QueueProject {
  return {
    queue_id: String(row.queue_id ?? row.id ?? ""),
    iso: String(row.iso ?? ""),
    project_name: String(row.project_name ?? "Unknown"),
    capacity_mw: Number(row.capacity_mw ?? 0),
    state: String(row.state ?? ""),
    county: String(row.county ?? ""),
    gen_type: String(row.gen_type ?? ""),
    status: String(row.status ?? ""),
    proposed_cod: String(row.proposed_cod ?? ""),
    lat: row.lat != null ? Number(row.lat) : null,
    lon: row.lon != null ? Number(row.lon) : null,
    raw: (row.raw_data as Record<string, unknown>) ?? {},
  };
}

function normalizeProject(
  qid: string,
  iso: string,
  raw: Record<string, unknown>
): QueueProject {
  return {
    queue_id: qid,
    iso,
    project_name: String(raw["Project Name"] ?? raw["project_name"] ?? "Unknown"),
    capacity_mw: Number(raw["Capacity (MW)"] ?? raw["capacity_mw"] ?? 0),
    state: String(raw["State"] ?? raw["state"] ?? ""),
    county: String(raw["County"] ?? raw["county"] ?? ""),
    gen_type: String(raw["Generation Type"] ?? raw["gen_type"] ?? ""),
    status: String(raw["Status"] ?? raw["status"] ?? ""),
    proposed_cod: String(raw["Proposed COD"] ?? raw["proposed_cod"] ?? ""),
    lat: raw["lat"] != null ? Number(raw["lat"]) : null,
    lon: raw["lon"] != null ? Number(raw["lon"]) : null,
    raw: raw as Record<string, unknown>,
  };
}
