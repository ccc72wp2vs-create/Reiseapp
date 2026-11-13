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
  /** Future: private R2 bucket for booking documents. */
  DOCUMENTS?: R2Bucket;
}
