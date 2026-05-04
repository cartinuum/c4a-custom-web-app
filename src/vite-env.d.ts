/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARCGIS_PORTAL?: string;
  readonly VITE_WEBMAP_ITEM_ID?: string;
  readonly VITE_CONNECT_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
