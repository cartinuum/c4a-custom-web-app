/**
 * Connect for ArcGIS — HTTP client (browser `fetch`)
 *
 * This file is written as a **small integration guide**: every public function maps to
 * documented REST operations. For the canonical request/response examples, keep
 * [`docs/CONNECT-FOR-ARCGIS-API.md`](../docs/CONNECT-FOR-ARCGIS-API.md) in sync with Cartinuum.
 *
 * ----------------------------------------------------------------------
 * Typical app flow (what this demo does in `main.ts`)
 * ----------------------------------------------------------------------
 *
 * 1. **Authenticate** (`authenticateAnonymous`) — obtain a short-lived JWT. Anonymous mode uses
 *    `{ portalUrl: "<your Portal or AGOL hostname>" }` (no ArcGIS user password in the body).
 * 2. **List layer links** (`getLayerLinks`) — discover which integrations exist and which portal
 *    feature-layer item + sublayer each link targets (`featureLayerId`, `subLayerId`).
 * 3. **Query** (`queryLayerLink`) — send the clicked map feature’s attribute values plus `outFields`,
 *    receive `results[]` dictionaries from the linked business / data system.
 *
 * All authenticated calls send:
 *
 * ```
 * Authorization: Bearer <jwt-from-step-1>
 * ```
 *
 * ----------------------------------------------------------------------
 * Base URL / environments
 * ----------------------------------------------------------------------
 *
 * The default AU tenant path below matches the doc examples. Override with env `VITE_CONNECT_BASE`
 * (no trailing slash) if you point at another region or staging stack.
 */

/** Default Connect API root (AU); override via `VITE_CONNECT_BASE` in `.env`. */
const DEFAULT_BASE = "https://app.cartinuum.com/connect/au/api";

/**
 * Resolves the Connect REST base URL, e.g. `https://app.cartinuum.com/connect/au/api`.
 * Strips trailing slashes so callers can safely append `/auth/...`, `/community/...`.
 */
export function resolveConnectBaseUrl(): string {
  const env =
    typeof import.meta.env.VITE_CONNECT_BASE === "string"
      ? import.meta.env.VITE_CONNECT_BASE.trim()
      : "";
  return (env || DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * One **layer link** row from `GET …/community/layer-links`.
 *
 * Aligns with Cartinuum’s definition: links a **hosted feature portal item id** + **sub-layer id**
 * to an external dataset. Your map app maps `FeatureLayer.portalItem.id` + `layerId` to pick the
 * right links for the layer the user clicked.
 */
export type LayerLink = {
  /** Connect primary key used in `POST …/community/query` as `layerLinkId`. */
  id: number;
  /** Human label (e.g. “SA2 - Working Population”); stable enough to branch UI on if needed. */
  name: string;
  /** Portal item id of the feature service this link applies to. */
  featureLayerId: string;
  /** Layer index inside that service (`0` for single-layer FeatureServer). */
  subLayerId: number;
  subLayerName?: string;
  /**
   * Input field names Connect expects alongside the feature’s OBJECTID when querying.
   * Build the JSON `queryParameters` array from: **[objectIdField, ...link.queryParameters]**
   * (dedupe if the OID field is already listed), in that order — see docs.
   */
  queryParameters: string[];
  /**
   * Declares which attributes the link *can* return. Use each `name` in `outFields` on the query
   * request (subset allowed).
   */
  queryResultAttrs: { name: string; type: string }[];
  /** If `false`, the current token cannot use this link (hide or show a message). */
  hasAccess?: boolean;
};

/** Wire format for `GET …/community/layer-links`. */
export type LayerLinksResponse = { layerLinks: LayerLink[]; totalItems?: number };

/**
 * **Step 1 — Authenticate (anonymous)**
 *
 * - **Method / path:** `POST {baseUrl}/auth/authenticate`
 * - **Body:** `{ "portalUrl": "https://your-org.maps.arcgis.com" }` (must match the portal you use
 *   to load WebMaps / layers; this demo sets the same value on `esriConfig.portalUrl`.)
 * - **Response:** JSON with `jwt` (and often `loggedInAs: "anonymous"`).
 *
 * Store the JWT in memory; treat it like a session secret (do not log in production).
 */
export async function authenticateAnonymous(
  portalUrl: string,
  baseUrl = resolveConnectBaseUrl(),
): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ portalUrl }),
  });
  if (!res.ok) {
    throw new Error(`Connect authenticate failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { jwt?: string };
  if (!data.jwt) {
    throw new Error("Connect authenticate: missing jwt");
  }
  return data.jwt;
}

/**
 * **Step 2 — List layer links**
 *
 * - **Method / path:** `GET {baseUrl}/community/layer-links`
 * - **Headers:** `Authorization: Bearer <jwt>`
 * - **Optional query:**
 *   - `featureLayerId` — narrow to links for one hosted feature portal item id (good for trimming
 *     payload once you know `FeatureLayer.portalItem.id`).
 *   - `fields` — comma-separated allow-list of attributes to return (this client requests everything
 *     needed to drive queries and labels).
 *
 * **Note:** the API may also document `dataSourceId`; extend `opts` the same way as
 * `featureLayerId` if you need server-side filtering by data source.
 */
export async function getLayerLinks(
  bearerToken: string,
  opts?: {
    baseUrl?: string;
    /** Optional — only links bound to this ArcGIS portal feature item id. */
    featureLayerId?: string;
    signal?: AbortSignal;
  },
): Promise<LayerLink[]> {
  const baseUrl = opts?.baseUrl ?? resolveConnectBaseUrl();
  const qs = new URLSearchParams();
  qs.set(
    "fields",
    ["featureLayerId", "subLayerId", "queryResultAttrs", "queryParameters", "subLayerName", "hasAccess"].join(
      ",",
    ),
  );
  if (opts?.featureLayerId) {
    qs.set("featureLayerId", opts.featureLayerId);
  }
  const url = `${baseUrl}/community/layer-links?${qs.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${bearerToken}`, Accept: "application/json" },
    signal: opts?.signal,
  });
  if (!res.ok) {
    throw new Error(`Connect layer-links failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as LayerLinksResponse;
  return data.layerLinks ?? [];
}

/**
 * **Step 3 — Query body** for `POST {baseUrl}/community/query`.
 *
 * - **`layerLinkId`** — taken from link listing (`LayerLink.id`).
 * - **`queryParameters`** — ordered list of ArcGIS attribute *names* you will send.
 *   Must include the layer’s object id field (e.g. `OBJECTID`) **and** every name in
 *   `LayerLink.queryParameters`, in a single consistent order; see project doc example.
 * - **`features`** — outer array = one row per geographic feature batch; inner array =
 *   string values in the **exact same order** as `queryParameters`.
 * - **`outFields`** — subset of `queryResultAttrs.name` keys you want in `results`.
 */
export type QueryFeaturesBody = {
  layerLinkId: number;
  queryParameters: string[];
  features: string[][];
  outFields: string[];
};

/**
 * One element of response `features[]` after a successful layer-link query.
 * The **business payload** lives in **`results`** (array of plain objects — often length 1).
 */
export type QueryFeaturesResponseFeature = {
  feature?: { attributes?: Record<string, string> };
  results?: Record<string, unknown>[];
};

/**
 * **Step 3 — Query one feature batch**
 *
 * - **Method / path:** `POST {baseUrl}/community/query`
 * - **Headers:** `Authorization: Bearer <jwt>`, `Content-Type: application/json`
 * - **Returns:** Parses `features[0]` only (matches the common “one clicked feature” case).
 *   If you POST multiple inner feature rows, read the full `json.features` array instead.
 *
 * Typical UI: iterate `matchedLayerLinks`, `Promise.all` queries, merge `results` into the popup.
 */
export async function queryLayerLink(
  bearerToken: string,
  body: QueryFeaturesBody,
  opts?: { baseUrl?: string; signal?: AbortSignal },
): Promise<QueryFeaturesResponseFeature | undefined> {
  const baseUrl = opts?.baseUrl ?? resolveConnectBaseUrl();
  const res = await fetch(`${baseUrl}/community/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
  if (!res.ok) {
    throw new Error(`Connect query failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { features?: QueryFeaturesResponseFeature[] };
  return json.features?.[0];
}
