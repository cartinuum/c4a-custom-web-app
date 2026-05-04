import esriConfig from "@arcgis/core/config.js";

export const DEFAULT_WEBMAP_ITEM_ID =
  (import.meta.env.VITE_WEBMAP_ITEM_ID as string | undefined)?.trim() ||
  "9bcb26ab043a496f8c03fb0ae6f13c2b";

export function resolvePortalUrl(): string {
  try {
    const param = new URLSearchParams(window.location.search).get("portal");
    if (param?.trim()) {
      return param.trim().replace(/\/+$/, "");
    }
  } catch {
    /* ignore */
  }
  const env =
    typeof import.meta.env.VITE_ARCGIS_PORTAL === "string"
      ? import.meta.env.VITE_ARCGIS_PORTAL.trim()
      : "";
  return env || "https://esriau.maps.arcgis.com";
}

esriConfig.portalUrl = resolvePortalUrl();
