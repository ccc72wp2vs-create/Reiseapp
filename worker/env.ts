/** Cloudflare bindings & variables available to the worker. */
export interface Env {
  /** D1 database binding (see wrangler.jsonc). */
  DB: D1Database;
  /** Static assets binding provided by Workers Static Assets. */
  ASSETS?: Fetcher;
  /** "development" | "production" – non-secret variable. */
  APP_ENV?: string;
  /**
   * One-time secret that allows creating the very first owner account.
   * Configure via `wrangler secret put SETUP_TOKEN` (production) or .dev.vars.
   */
  SETUP_TOKEN?: string;
  /** Workers AI – reads uploaded receipts / confirmations. */
  AI?: Ai;
  /** "Frag TRAVIO": Workers AI model id (default: Llama 3.3 70B fp8-fast). */
  ASSISTANT_MODEL?: string;
  /** Model calls per user and day (default 80; 0 = answers without AI only). */
  ASSISTANT_DAILY_LIMIT?: string;
  /** Max generated tokens per answer (default 900). */
  ASSISTANT_MAX_TOKENS?: string;
  /** Google Maps Platform server key (secret; Places API New + Routes API only). */
  GOOGLE_MAPS_SERVER_KEY?: string;
  /** Google Maps browser key (secret; HTTP-referrer restricted; Maps JS + Places UI Kit). */
  GOOGLE_MAPS_BROWSER_KEY?: string;
  /** Internal monthly limits (defaults below Google's free caps). */
  GOOGLE_LIMIT_SEARCHES?: string;
  GOOGLE_LIMIT_ROUTE_ELEMENTS?: string;
  GOOGLE_LIMIT_ROUTES?: string;
  GOOGLE_LIMIT_UI_LOADS?: string;
  /** Future: private R2 bucket for booking documents. */
  DOCUMENTS?: R2Bucket;
}
