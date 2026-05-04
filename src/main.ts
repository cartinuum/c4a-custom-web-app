import "./portal-config.js";
import "./app-chrome.css";
import "@esri/calcite-components/main.css";
import "@arcgis/map-components/main.css";
import Collection from "@arcgis/core/core/Collection.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import GroupLayer from "@arcgis/core/layers/GroupLayer.js";
import PopupTemplate from "@arcgis/core/PopupTemplate.js";
import CustomContent from "@arcgis/core/popup/content/CustomContent.js";
import WebMap from "@arcgis/core/WebMap.js";
import { whenOnce } from "@arcgis/core/core/reactiveUtils.js";
import type Layer from "@arcgis/core/layers/Layer.js";
import type { PopupTemplateCreatorEvent, PopupTemplateTitle } from "@arcgis/core/popup/types.js";
import { defineCustomElements as defineCalciteElements } from "@esri/calcite-components/loader";
import { defineCustomElements as defineArcgisElements } from "@arcgis/map-components/loader";
import type { LayerLink } from "./connectClient.js";
import {
  authenticateAnonymous,
  getLayerLinks,
  queryLayerLink,
  resolveConnectBaseUrl,
} from "./connectClient.js";
import {
  buildSa2WorkingPopulationPopupSection,
  isSa2WorkingPopulationConnectLink,
} from "./connectSa2WorkingPopulationPopup.js";
import { DEFAULT_WEBMAP_ITEM_ID, resolvePortalUrl } from "./portal-config.js";

type ArcgisMapElement = HTMLElement & {
  map: InstanceType<typeof WebMap>;
  itemId?: string | null;
  viewOnReady: (cb?: () => void, errback?: (error: Error) => void) => Promise<void>;
  popupComponentEnabled?: boolean;
  popupElement: {
    dockEnabled: boolean;
    dockOptions: {
      buttonEnabled?: boolean;
      breakpoint?: boolean | { width?: number; height?: number };
      position?: string;
    };
  } | null;
};

/** Read OBJECTID-style value from graphic using the owning layer's `objectIdField`. */
function objectIdFromEvent(event: PopupTemplateCreatorEvent): string | null {
  const layerLike = event.graphic?.layer;
  const oidName =
    layerLike instanceof FeatureLayer ? (layerLike.objectIdField ?? "OBJECTID").toString() : "OBJECTID";
  const attrs = event.graphic?.attributes as Record<string, unknown> | undefined;
  const v = attrs?.[oidName];
  if (v === null || v === undefined || String(v).trim() === "") {
    return null;
  }
  return String(v);
}

/**
 * When the WebMap has no usable popup title string, derive a neutral label:
 * **`displayField`** value if populated, otherwise `{layer title}: {OBJECTID}`, else OID alone or "Feature".
 */
function genericFeaturePopupFallbackTitle(event: PopupTemplateCreatorEvent): string {
  const layerLike = event.graphic?.layer;
  const attrs = event.graphic?.attributes as Record<string, unknown> | undefined;

  if (layerLike instanceof FeatureLayer) {
    const df = layerLike.displayField;
    if (
      df &&
      attrs?.[df] !== undefined &&
      attrs[df] !== null &&
      String(attrs[df]).trim() !== ""
    ) {
      return String(attrs[df]);
    }
    const oid = objectIdFromEvent(event);
    if (oid !== null && layerLike.title) {
      return `${layerLike.title}: ${oid}`;
    }
    if (oid !== null) {
      return `Feature (${oid})`;
    }
    if (layerLike.title) {
      return layerLike.title;
    }
  }

  const oid = objectIdFromEvent(event);
  return oid !== null ? `Feature (${oid})` : "Feature";
}

function authoredTitleHasContent(title: PopupTemplateTitle | undefined | null): boolean {
  if (title === undefined || title === null) return false;
  if (typeof title === "string") return title.trim().length > 0;
  return true;
}

/** Prefer the WebMap popup title; otherwise a generic label from display field / OID / layer title. */
function popupTitleFromAuthoredOrGeneric(authoredClone: PopupTemplate | null): PopupTemplateTitle {
  const t = authoredClone?.title;
  if (authoredTitleHasContent(t)) {
    return t as PopupTemplateTitle;
  }
  return genericFeaturePopupFallbackTitle;
}

function mergedTemplateOutFields(fl: FeatureLayer, authoredClone: PopupTemplate | null): string[] {
  const set = new Set(popupTemplateBaseOutFields(fl));
  const ofs = authoredClone?.outFields;
  if (ofs?.length) {
    for (const field of ofs) {
      if (typeof field === "string" && field) {
        set.add(field);
      }
    }
  }
  const list = [...set];
  return list.includes("*") ? ["*"] : list;
}

/** Fields the popup template promises to load; `*` keeps templates wide enough for varied maps. */
function popupTemplateBaseOutFields(fl: FeatureLayer): string[] {
  return ["*", fl.objectIdField || "OBJECTID"];
}

async function collectFeatureLayersFromCollection(
  layers: Collection<Layer>,
): Promise<FeatureLayer[]> {
  const out: FeatureLayer[] = [];
  const list = layers.toArray();
  for (const layer of list) {
    await layer.load().catch(() => undefined);
    if (layer.type === "group") {
      out.push(...(await collectFeatureLayersFromCollection((layer as GroupLayer).layers)));
    } else if (layer.type === "feature" && layer instanceof FeatureLayer) {
      out.push(layer);
    }
  }
  return out;
}

function orderedQueryKeys(objectIdField: string, layerLink: LayerLink): string[] {
  const oid = objectIdField || "OBJECTID";
  const extras = layerLink.queryParameters.filter((field) => field !== oid);
  return [oid, ...extras];
}

function rowAttributes(keys: string[], attributes: Record<string, unknown>): string[] {
  return keys.map((k) => {
    const raw = attributes[k];
    return raw === null || raw === undefined ? "" : String(raw);
  });
}

/** One `<details>` per layer link; SA2 working-population table lives in `connectSa2WorkingPopulationPopup.ts`. */
function connectSectionElement(
  link: LayerLink,
  rows: Record<string, unknown>[],
): HTMLElement {
  if (rows.length && isSa2WorkingPopulationConnectLink(link)) {
    return buildSa2WorkingPopulationPopupSection(link, rows);
  }
  const root = document.createElement("details");
  root.style.marginBottom = "0.5rem";
  root.open = true;
  const summary = document.createElement("summary");
  summary.style.fontWeight = "600";
  summary.textContent = link.name ?? `Layer link ${link.id}`;
  root.appendChild(summary);
  const body = document.createElement("div");
  root.appendChild(body);
  if (!rows.length) {
    const p = document.createElement("p");
    p.textContent = "No linked records returned.";
    body.appendChild(p);
    return root;
  }
  for (let i = 0; i < rows.length; i++) {
    const block = document.createElement("dl");
    block.style.margin = "0.35rem 0 0 0";
    const entries = Object.entries(rows[i] ?? {}).filter(([, v]) => v !== undefined);
    if (!entries.length) {
      continue;
    }
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
    body.appendChild(block);
  }
  return root;
}

function makeConnectCustomContent(
  bearerToken: string,
  portalLayerMatches: LayerLink[],
  layer: FeatureLayer,
): CustomContent | null {
  if (!portalLayerMatches.length) {
    return null;
  }
  const connectBaseUrl = resolveConnectBaseUrl();
  const oidField = layer.objectIdField || "OBJECTID";

  const connectOutFields = new Set<string>(["*", ...popupTemplateBaseOutFields(layer)]);
  for (const l of portalLayerMatches) {
    for (const a of l.queryResultAttrs) {
      connectOutFields.add(a.name);
    }
  }
  for (const l of portalLayerMatches) {
    for (const p of l.queryParameters) {
      connectOutFields.add(p);
    }
  }

  return new CustomContent({
    outFields: [...connectOutFields],
    creator: async (evt) => {
      const attributes = evt.graphic.attributes as Record<string, unknown>;
      const wrap = document.createElement("section");

      const relevant = portalLayerMatches.filter((l) => l.hasAccess !== false);
      if (!relevant.length) {
        const p = document.createElement("p");
        p.style.fontStyle = "italic";
        p.textContent = "No accessible layer links for this portal layer.";
        wrap.appendChild(p);
        return wrap;
      }

      try {
        const parts = await Promise.all(
          relevant.map(async (link) => {
            const keysOrdered = orderedQueryKeys(oidField, link);
            const body = {
              layerLinkId: link.id,
              queryParameters: keysOrdered,
              features: [rowAttributes(keysOrdered, attributes)],
              outFields: link.queryResultAttrs.map((x) => x.name),
            };
            try {
              const result = await queryLayerLink(bearerToken, body, { baseUrl: connectBaseUrl });
              const linkedRows = result?.results ?? [];
              return connectSectionElement(link, linkedRows);
            } catch (e) {
              const errWrap = document.createElement("details");
              errWrap.open = true;
              const s = document.createElement("summary");
              s.textContent = `${link.name ?? link.id} (error)`;
              errWrap.appendChild(s);
              const pre = document.createElement("pre");
              pre.textContent =
                e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
              pre.style.whiteSpace = "pre-wrap";
              errWrap.appendChild(pre);
              return errWrap;
            }
          }),
        );

        parts.forEach((el) => wrap.appendChild(el));
      } catch (e) {
        const err = document.createElement("pre");
        err.style.color = "#b00020";
        err.textContent =
          e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
        wrap.appendChild(err);
      }

      return wrap;
    },
  });
}

async function portalItemId(layer: FeatureLayer): Promise<string | null> {
  await layer.load();
  if (!layer.portalItem?.id) {
    return null;
  }
  try {
    await layer.portalItem.load();
  } catch {
    /* portalItem.id still valid */
  }
  return layer.portalItem.id ?? null;
}

async function augmentConnectPopups(
  webmap: WebMap,
  bearerToken: string,
  allLinks: LayerLink[],
): Promise<void> {
  await webmap.when();
  await webmap.loadAll();
  const fls = await collectFeatureLayersFromCollection(webmap.layers);

  const hasBearer = Boolean(bearerToken);

  for (const fl of fls) {
    const portalId = await portalItemId(fl);
    const matches =
      portalId !== null
        ? allLinks.filter(
            (l) =>
              l.featureLayerId === portalId && Number(l.subLayerId) === Number(fl.layerId),
          )
        : [];

    let bodyPieces: unknown[] = [];

    if (!matches.length) {
      bodyPieces = [
        {
          type: "text",
          text: "No Connect layer links are mapped to this map layer.",
        },
      ];
    } else if (!hasBearer) {
      bodyPieces = [
        {
          type: "text",
          text: "Connect anonymous sign-in failed — linked records cannot be loaded.",
        },
      ];
    } else {
      const connectBlock = makeConnectCustomContent(bearerToken, matches, fl);
      bodyPieces =
        connectBlock !== null ? [connectBlock] : [{ type: "text", text: "Unable to attach Connect enrichment." }];
    }

    const authoredClone = fl.popupTemplate?.clone() ?? null;

    const baseTemplate = new PopupTemplate({
      title: popupTitleFromAuthoredOrGeneric(authoredClone),
      outFields: mergedTemplateOutFields(fl, authoredClone),
      expressionInfos: authoredClone?.expressionInfos?.length
        ? authoredClone.expressionInfos.slice()
        : undefined,
      lastEditInfoEnabled: false,
      overwriteActions: false,
      content: bodyPieces as unknown as PopupTemplate["content"],
    });

    fl.popupTemplate = baseTemplate;
  }
}

void (async (): Promise<void> => {
  defineCalciteElements();
  defineArcgisElements();

  const portalUrl = resolvePortalUrl();
  let bearerToken = "";
  try {
    bearerToken = await authenticateAnonymous(portalUrl, resolveConnectBaseUrl());
  } catch {
    bearerToken = "";
  }

  const allLinks =
    bearerToken ? await getLayerLinks(bearerToken).catch(() => [] as LayerLink[]) : ([] as LayerLink[]);

  await customElements.whenDefined("arcgis-map");

  const mapEl = document.getElementById("view") as ArcgisMapElement | null;
  if (!mapEl) {
    return;
  }

  mapEl.itemId =
    typeof import.meta.env.VITE_WEBMAP_ITEM_ID === "string" &&
    import.meta.env.VITE_WEBMAP_ITEM_ID.trim()
      ? import.meta.env.VITE_WEBMAP_ITEM_ID.trim()
      : DEFAULT_WEBMAP_ITEM_ID;
  mapEl.popupComponentEnabled = true;

  await mapEl.viewOnReady();

  const popupEl = await whenOnce(() => mapEl.popupElement);
  popupEl.dockEnabled = true;
  popupEl.dockOptions = {
    buttonEnabled: true,
    breakpoint: false,
    position: "top-right",
  };

  const mapLike = mapEl.map;
  if (!(mapLike instanceof WebMap)) {
    return;
  }

  await augmentConnectPopups(mapLike, bearerToken, allLinks);
})();
