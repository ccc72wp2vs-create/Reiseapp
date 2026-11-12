/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_ATTRIBUTION?: string;
  readonly VITE_MAP_MAX_ZOOM?: string;
}

declare const __APP_VERSION__: string;
