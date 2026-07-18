const HISTORY_REMOTE = "https://raw.githubusercontent.com/jaredT27/solarsentinel/main/data/alert_history.json";
const STATUS_REMOTE = "https://raw.githubusercontent.com/jaredT27/solarsentinel/main/data/scan_status.json";
const SAVED_VIEWS_KEY = "solar-sentinel-saved-views-v1";

const elements = {
  rows: document.querySelector("[data-history-rows]"),
  region: document.querySelector("[data-history-region]"),
  resultCount: document.querySelector("[data-result-count]"),
  search: document.querySelector("[data-filter-search]"),
  change: document.querySelector("[data-filter-change]"),
  iso: document.querySelector("[data-filter-iso]"),
  state: document.querySelector("[data-filter-state]"),
  tech: document.querySelector("[data-filter-tech]"),
  minMw: document.querySelector("[data-filter-min-mw]"),
  reset: document.querySelector("[data-reset-filters]"),
  export: document.querySelector("[data-export]"),
  requestProfile: document.querySelector("[data-request-profile]"),
  savedView: document.querySelector("[data-saved-view]"),
  saveView: document.querySelector("[data-save-view]"),
  dialog: document.querySelector("[data-alert-dialog]"),
  detail: document.querySelector("[data-alert-detail]"),
  healthSummary: document.querySelector("[data-health-summary]"),
  healthLabel: document.querySelector("[data-health-label]"),
  healthTime: document.querySelector("[data-health-time]"),
  marketHealth: document.querySelector("[data-market-health]"),
};

const state = { alerts: [], filtered: [], views: loadViews() };

function loadViews() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveViews() {
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(state.views));
}

function getFilters() {
  return {
    search: elements.search.value.trim(),
    change: elements.change.value,
    iso: elements.iso.value,
    state: elements.state.value,
    tech: elements.tech.value,
    minMw: elements.minMw.value,
  };
}

function setFilters(filters = {}) {
  elements.search.value = filters.search || "";
  elements.change.value = filters.change || "";
  elements.iso.value = filters.iso || "";
  elements.state.value = filters.state || "";
  elements.tech.value = filters.tech || "";
  elements.minMw.value = filters.minMw || "";
}

function formatObserved(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatTimestamp(value) {
  if (!value) return "No completed scan yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `Last checked ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date)}`;
}

function formatCapacity(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString(undefined, { maximumFractionDigits: 1 })} MW` : "—";
}

function appendOption(select, value) {
  if (!value) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  select.append(option);
}

function uniqueSorted(field) {
  return [...new Set(state.alerts.map((alert) => alert[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function populateFilterOptions() {
  uniqueSorted("iso").forEach((value) => appendOption(elements.iso, value));
  uniqueSorted("state_code").forEach((value) => appendOption(elements.state, value));
  uniqueSorted("generation_type").forEach((value) => appendOption(elements.tech, value));
}

function matches(alert, filters) {
  if (filters.change && alert.change_type !== filters.change) return false;
  if (filters.iso && alert.iso !== filters.iso) return false;
  if (filters.state && alert.state_code !== filters.state) return false;
  if (filters.tech && alert.generation_type !== filters.tech) return false;
  if (filters.minMw && Number(alert.capacity_mw) < Number(filters.minMw)) return false;
  if (filters.search) {
    const search = filters.search.toLowerCase();
    const haystack = [alert.project_name, alert.interconnecting_entity, alert.county, alert.state, alert.queue_id, alert.iso, alert.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}

function badge(changeType) {
  const span = document.createElement("span");
  const normalized = String(changeType || "CHANGED").toLowerCase();
  span.className = `change-badge change-${normalized}`;
  span.textContent = changeType === "NEW" ? "New" : changeType === "WITHDRAWN" ? "Withdrawn" : "Changed";
  return span;
}

function createRow(alert) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "history-row";
  row.setAttribute("aria-label", `Open ${alert.change_type.toLowerCase()} alert for ${alert.project_name}`);

  const time = document.createElement("time");
  time.dateTime = alert.observed_at || "";
  time.textContent = formatObserved(alert.observed_at);

  const project = document.createElement("span");
  project.className = "project-cell";
  const projectName = document.createElement("strong");
  projectName.textContent = alert.project_name || "Unnamed project";
  const projectMeta = document.createElement("small");
  projectMeta.textContent = [alert.generation_type, alert.queue_id && `Queue ${alert.queue_id}`].filter(Boolean).join(" · ");
  project.append(projectName, projectMeta);

  const market = document.createElement("span");
  market.className = "market-code";
  market.textContent = alert.iso || "—";

  const location = document.createElement("span");
  location.className = "location";
  location.textContent = [alert.county, alert.state_code].filter(Boolean).join(", ") || "—";

  const capacity = document.createElement("span");
  capacity.className = "capacity";
  capacity.textContent = formatCapacity(alert.capacity_mw);

  const status = document.createElement("span");
  status.className = "status";
  status.textContent = alert.status || "—";

  row.append(time, badge(alert.change_type), project, market, location, capacity, status);
  row.addEventListener("click", () => openDetail(alert));
  return row;
}

function renderEmpty(title, message, className = "empty-state") {
  elements.rows.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.className = className;
  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  wrapper.append(heading, paragraph);
  elements.rows.append(wrapper);
}

function render() {
  const filters = getFilters();
  state.filtered = state.alerts.filter((alert) => matches(alert, filters));
  elements.rows.replaceChildren();
  elements.resultCount.textContent = state.filtered.length.toLocaleString();
  elements.export.disabled = state.filtered.length === 0;
  updateProfileLink(filters);

  if (state.alerts.length === 0) {
    renderEmpty(
      "History starts with the next validated change",
      "The reliability sprint is in place. New, changed, and withdrawn projects will appear here after a healthy scan records them."
    );
  } else if (state.filtered.length === 0) {
    renderEmpty("No alerts match this view", "Reset a filter or lower the minimum capacity to broaden the results.");
  } else {
    state.filtered.forEach((alert) => elements.rows.append(createRow(alert)));
  }
  elements.region.setAttribute("aria-busy", "false");
}

function updateProfileLink(filters) {
  const active = Object.entries(filters).filter(([, value]) => value);
  const body = active.length
    ? `Please configure this Solar Sentinel alert profile:\n\n${active.map(([key, value]) => `${key}: ${value}`).join("\n")}`
    : "Please help me configure a personalized Solar Sentinel alert profile.";
  elements.requestProfile.href = `mailto:Jared@Clauffice.com?subject=${encodeURIComponent("Solar Sentinel personalized alert profile")}&body=${encodeURIComponent(body)}`;
}

function addDetailValue(list, label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value || "—";
  wrapper.append(term, description);
  list.append(wrapper);
}

function safeLink(url, label) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function openDetail(alert) {
  elements.detail.replaceChildren();
  const wrapper = document.createElement("article");
  wrapper.className = "alert-detail";
  wrapper.append(badge(alert.change_type));
  const title = document.createElement("h2");
  title.id = "dialog-title";
  title.textContent = alert.project_name || "Unnamed project";
  const lede = document.createElement("p");
  lede.textContent = `${alert.iso || "Market"} · ${formatObserved(alert.observed_at)} · Queue ${alert.queue_id || "ID unavailable"}`;
  const details = document.createElement("dl");
  details.className = "detail-grid";
  addDetailValue(details, "Capacity", formatCapacity(alert.capacity_mw));
  addDetailValue(details, "Technology", alert.generation_type);
  addDetailValue(details, "Location", [alert.county, alert.state].filter(Boolean).join(", "));
  addDetailValue(details, "Status", alert.status);
  addDetailValue(details, "Queue date", formatObserved(alert.queue_date));
  addDetailValue(details, "Proposed completion", formatObserved(alert.proposed_completion_date));
  wrapper.append(title, lede, details);

  if (Array.isArray(alert.changes) && alert.changes.length) {
    const changeTitle = document.createElement("h3");
    changeTitle.textContent = "What changed";
    const list = document.createElement("ul");
    list.className = "change-list";
    alert.changes.forEach((change) => {
      const item = document.createElement("li");
      item.textContent = change;
      list.append(item);
    });
    wrapper.append(changeTitle, list);
  }

  const links = document.createElement("div");
  links.className = "detail-links";
  const source = safeLink(alert.source_url, `Open ${alert.iso} source`);
  const map = safeLink(alert.map_url, "Open map context");
  if (source) links.append(source);
  if (map) links.append(map);
  if (links.childElementCount) wrapper.append(links);
  elements.detail.append(wrapper);
  elements.dialog.showModal();
}

function resetFilters() {
  setFilters();
  elements.savedView.value = "";
  render();
}

function viewName(filters) {
  const parts = [filters.iso, filters.state, filters.change, filters.tech, filters.minMw && `${filters.minMw}+ MW`].filter(Boolean);
  return parts.length ? parts.join(" · ") : `All alerts · ${new Date().toLocaleDateString()}`;
}

function renderSavedViews() {
  const current = elements.savedView.value;
  elements.savedView.replaceChildren(new Option("Current filters", ""));
  state.views.forEach((view) => elements.savedView.append(new Option(view.name, view.id)));
  elements.savedView.value = state.views.some((view) => view.id === current) ? current : "";
}

function saveCurrentView() {
  const filters = getFilters();
  const id = globalThis.crypto?.randomUUID?.() || String(Date.now());
  state.views.push({ id, name: viewName(filters), filters });
  saveViews();
  renderSavedViews();
  elements.savedView.value = id;
  elements.saveView.textContent = "Saved";
  window.setTimeout(() => { elements.saveView.textContent = "Save view"; }, 1200);
}

function applySavedView() {
  const view = state.views.find((item) => item.id === elements.savedView.value);
  if (view) setFilters(view.filters);
  render();
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCsv() {
  const columns = ["observed_at", "change_type", "project_name", "queue_id", "iso", "state", "county", "generation_type", "capacity_mw", "status", "changes", "source_url"];
  const lines = [columns.join(",")];
  state.filtered.forEach((alert) => lines.push(columns.map((column) => csvCell(column === "changes" ? (alert.changes || []).join(" | ") : alert[column])).join(",")));
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `solar-sentinel-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function fetchJson(localUrl, remoteUrl) {
  let localPayload = null;
  try {
    const response = await fetch(localUrl, { cache: "no-store" });
    if (response.ok) localPayload = await response.json();
  } catch {
    localPayload = null;
  }
  if (localPayload?.generated_at) return localPayload;
  if (["127.0.0.1", "localhost"].includes(window.location.hostname)) return localPayload;
  try {
    const response = await fetch(`${remoteUrl}?v=${Date.now()}`, { cache: "no-store" });
    if (response.ok) return await response.json();
  } catch {
    // The local empty state remains useful while a deployment is disconnected.
  }
  return localPayload;
}

function renderHealth(status) {
  elements.healthSummary.classList.remove("healthy", "degraded");
  if (!status || status.status === "not_run") {
    elements.healthLabel.textContent = "Awaiting the first reliability scan";
    elements.healthTime.textContent = "No completed health artifact yet";
    elements.marketHealth.textContent = "0 / 0";
    return;
  }
  const healthy = status.status === "healthy";
  elements.healthSummary.classList.add(healthy ? "healthy" : "degraded");
  elements.healthLabel.textContent = healthy ? "All configured markets healthy" : "Coverage requires attention";
  elements.healthTime.textContent = formatTimestamp(status.generated_at);
  elements.marketHealth.textContent = `${status.healthy_markets} / ${status.total_markets}`;
}

async function initialize() {
  renderSavedViews();
  const [history, status] = await Promise.all([
    fetchJson("./data/alert_history.json", HISTORY_REMOTE),
    fetchJson("./data/scan_status.json", STATUS_REMOTE),
  ]);
  state.alerts = Array.isArray(history?.alerts) ? history.alerts : [];
  populateFilterOptions();
  renderHealth(status);
  render();
}

document.querySelectorAll("[data-filters] input, [data-filters] select").forEach((control) => {
  control.addEventListener(control.tagName === "INPUT" ? "input" : "change", render);
});
elements.reset.addEventListener("click", resetFilters);
elements.export.addEventListener("click", exportCsv);
elements.saveView.addEventListener("click", saveCurrentView);
elements.savedView.addEventListener("change", applySavedView);

initialize().catch(() => {
  elements.region.setAttribute("aria-busy", "false");
  renderEmpty("Alert history could not load", "Try refreshing the page. The scanner and Telegram delivery operate independently from this workspace.", "error-state");
  renderHealth(null);
});
