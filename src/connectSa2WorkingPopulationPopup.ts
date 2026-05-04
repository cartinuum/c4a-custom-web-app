/**
 * Optional presenter for one Connect layer link: **"SA2 - Working Population"**.
 *
 * When the Connect `/community/query` response returns Census-style ABS fields
 * (`P_{age_lo}_{age_hi}_{EWFT|EWPT|EAFW|EHW_NS|Tot}` plus `POW_SA2_CODE_2021`),
 * this module folds them into an HTML table for the ArcGIS popup. Any other layer
 * link continues to use the generic definition-list renderer in `main.ts`.
 *
 * Styles live in `app-chrome.css` (`connect-sa2-*`, `connect-sa2-working-pop-table`).
 */

import type { LayerLink } from "./connectClient.js";

/** Must match the **name** of the layer link returned by Connect (trimmed). */
export const SA2_WORKING_POPULATION_LINK_NAME = "SA2 - Working Population";

/** Flat row keys like `P_15_19_EWFT` — see ABS working population tables. */
const WORKING_POP_BRACKET_KEY_RE = /^P_(\d+)_(\d+)_(EWFT|EWPT|EAFW|EHW_NS|Tot)$/;

type WorkingPopMetricKey = "EWFT" | "EWPT" | "EAFW" | "EHW_NS" | "Tot";

/** Whether this link should use the SA2 working-population table UI. */
export function isSa2WorkingPopulationConnectLink(link: LayerLink): boolean {
  return (link.name ?? "").trim() === SA2_WORKING_POPULATION_LINK_NAME;
}

function numericOrDash(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}

function extractWorkingPopulationTableData(row: Record<string, unknown>): {
  sa2Code: string | null;
  brackets: Map<string, Partial<Record<WorkingPopMetricKey, unknown>>>;
} {
  const brackets = new Map<string, Partial<Record<WorkingPopMetricKey, unknown>>>();
  let sa2Code: string | null = null;
  const code = row.POW_SA2_CODE_2021;
  if (code !== undefined && code !== null && String(code).trim() !== "") {
    sa2Code = String(code);
  }

  for (const [key, val] of Object.entries(row)) {
    if (key === "POW_SA2_CODE_2021") continue;
    const m = key.match(WORKING_POP_BRACKET_KEY_RE);
    if (!m) continue;
    const lo = m[1];
    const hi = m[2];
    const metric = m[3] as WorkingPopMetricKey;
    const bracketId = `${lo}_${hi}`;
    let cell = brackets.get(bracketId);
    if (!cell) {
      cell = {};
      brackets.set(bracketId, cell);
    }
    cell[metric] = val;
  }

  return { sa2Code, brackets };
}

function sortBracketIds(bracketIds: string[]): string[] {
  return [...bracketIds].sort((a, b) => {
    const sa = parseInt(a.split("_")[0] ?? "0", 10);
    const sb = parseInt(b.split("_")[0] ?? "0", 10);
    return sa - sb;
  });
}

function genericConnectDlBlock(row: Record<string, unknown>): HTMLElement | null {
  const entries = Object.entries(row).filter(([, v]) => v !== undefined);
  if (!entries.length) return null;
  const block = document.createElement("dl");
  block.style.margin = "0.35rem 0 0 0";
  for (const [k, v] of entries) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    dt.style.fontSize = "0.85em";
    const dd = document.createElement("dd");
    dd.style.marginInlineStart = "1rem";
    dd.textContent = v === null ? "" : String(v);
    block.appendChild(dt);
    block.appendChild(dd);
  }
  return block;
}

/**
 * Builds a `<details>` block: summary = layer link name, body = SA2 code line + table
 * (or a flat `<dl>` fallback if the row shape is unexpected).
 */
export function buildSa2WorkingPopulationPopupSection(
  link: LayerLink,
  rows: Record<string, unknown>[],
): HTMLElement {
  const root = document.createElement("details");
  root.style.marginBottom = "0.75rem";
  root.open = true;
  const summary = document.createElement("summary");
  summary.style.fontWeight = "600";
  summary.textContent = link.name ?? `Layer link ${link.id}`;
  root.appendChild(summary);
  const body = document.createElement("div");
  body.className = "connect-sa2-working-pop-wrap";
  root.appendChild(body);

  if (!rows.length) {
    const p = document.createElement("p");
    p.textContent = "No linked records returned.";
    body.appendChild(p);
    return root;
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? {};
    const { sa2Code, brackets } = extractWorkingPopulationTableData(row as Record<string, unknown>);

    if (brackets.size === 0) {
      const fallback = genericConnectDlBlock(row as Record<string, unknown>);
      if (fallback) body.appendChild(fallback);
      continue;
    }

    if (rows.length > 1) {
      const h = document.createElement("h4");
      h.className = "connect-sa2-record-heading";
      h.textContent = `Record ${r + 1}`;
      body.appendChild(h);
    }

    if (sa2Code !== null) {
      const meta = document.createElement("p");
      meta.className = "connect-sa2-meta";
      meta.textContent = `Place of work SA2 (2021): ${sa2Code}`;
      body.appendChild(meta);
    }

    const table = document.createElement("table");
    table.className = "connect-sa2-working-pop-table";
    const caption = document.createElement("caption");
    caption.textContent =
      "Employed people in this SA2 by age and employment type (EWFT, EWPT, EAFW, EHW_NS).";
    caption.style.captionSide = "top";
    caption.style.textAlign = "left";
    caption.style.fontSize = "0.8rem";
    caption.style.color = "var(--calcite-color-text-3, #6e6e6e)";
    caption.style.paddingBottom = "0.35rem";
    table.appendChild(caption);

    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const headers = [
      "Age (years)",
      "Full-time (EWFT)",
      "Part-time (EWPT)",
      "Away from work (EAFW)",
      "Hours not stated (EHW_NS)",
      "Total",
    ];
    for (const label of headers) {
      const th = document.createElement("th");
      th.textContent = label;
      th.scope = "col";
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const ordered = sortBracketIds([...brackets.keys()]);
    const metrics: WorkingPopMetricKey[] = ["EWFT", "EWPT", "EAFW", "EHW_NS", "Tot"];

    for (const bracketId of ordered) {
      const [lo, hi] = bracketId.split("_");
      const cells = brackets.get(bracketId) ?? {};
      const tr = document.createElement("tr");
      const thAge = document.createElement("th");
      thAge.scope = "row";
      thAge.textContent = `${lo}–${hi}`;
      tr.appendChild(thAge);
      for (const m of metrics) {
        const td = document.createElement("td");
        td.textContent = numericOrDash(cells[m]);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
  }

  return root;
}
