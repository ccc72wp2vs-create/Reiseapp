/**
 * Minimal Cloudflare D1 API implemented on top of Node's built-in SQLite
 * (node:sqlite). Used to run the real worker API + migrations in fast
 * integration tests. Mirrors D1 semantics that the app relies on:
 * prepare/bind/first/all/run, batch() as an atomic transaction and
 * enforced foreign keys.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';

type Param = string | number | bigint | null | Uint8Array;

function norm(v: unknown): Param {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v as Param;
}

class Stmt {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private params: Param[] = [],
  ) {}

  bind(...args: unknown[]) {
    return new Stmt(this.db, this.sql, args.map(norm));
  }

  private stmt(): StatementSync {
    return this.db.prepare(this.sql);
  }

  async first<T = Record<string, unknown>>(col?: string): Promise<T | null> {
    const row = this.stmt().get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }

  async all<T = Record<string, unknown>>() {
    return this.exec<T>();
  }

  async run() {
    return this.exec();
  }

  exec<T = Record<string, unknown>>() {
    const s = this.stmt();
    if (s.columns().length > 0) {
      const results = (s.all(...this.params) as Record<string, unknown>[]).map((r) => ({ ...r })) as T[];
      return { success: true, results, meta: { changes: 0, last_row_id: 0 } };
    }
    const r = s.run(...this.params);
    return { success: true, results: [] as T[], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export class D1Shim {
  readonly sqlite: DatabaseSync;
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(sql: string) {
    return new Stmt(this.sqlite, sql);
  }

  async batch(stmts: Stmt[]) {
    this.sqlite.exec('BEGIN');
    try {
      const out = stmts.map((s) => s.exec());
      this.sqlite.exec('COMMIT');
      return out;
    } catch (e) {
      this.sqlite.exec('ROLLBACK');
      throw e;
    }
  }

  async exec(sql: string) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
}
