// Подключение к Postgres.
//  • На Vercel: Neon (DATABASE_URL / POSTGRES_URL проставляет Marketplace-интеграция).
//  • Локально без DATABASE_URL: встроенный PGlite (настоящий Postgres в WASM), файлы в .data/.
// Схема создаётся автоматически при первом обращении — миграции вручную не нужны.

export type Row = Record<string, unknown>;

export type Db = {
  kind: "pg" | "pglite";
  query: <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>;
  /** Несколько операторов подряд (без параметров) — для создания схемы. */
  exec: (sql: string) => Promise<void>;
};

export class DbNotConfigured extends Error {
  constructor() {
    super("DATABASE_URL не задан: подключите базу Neon (Vercel → Storage) и сделайте redeploy.");
    this.name = "DbNotConfigured";
  }
}

const SCHEMA = `
create table if not exists leads (
  id serial primary key,
  created_at timestamptz not null default now(),
  source text not null default 'app',
  external_id text unique,
  is_demo boolean not null default false,
  company text not null,
  region text,
  activity text,
  activity_other text,
  waste_types jsonb not null default '[]',
  volume_raw text,
  volume_kg double precision,
  frequency text,
  handling text,
  cost_raw text,
  cost_som double precision,
  handover text,
  priority text,
  contact_raw text,
  contact_phone text,
  contact_email text,
  contact_ok boolean not null default false,
  score integer not null default 0,
  raw_score integer not null default 0,
  temperature text not null default 'COLD',
  breakdown jsonb not null default '[]',
  flags jsonb not null default '[]',
  needs_review boolean not null default false,
  status text not null default 'new',
  note text,
  ai_summary text,
  ai_why text,
  ai_next_step text,
  ai_questions jsonb,
  ai_model text,
  ai_at timestamptz,
  ai_error text,
  answers jsonb not null default '{}'
);
create index if not exists leads_score_idx on leads (score desc, created_at desc);
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
`;

const g = globalThis as unknown as { __ecoDb?: Promise<Db> };

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let db: Db;

  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 20_000 });
    db = {
      kind: "pg",
      query: async <T>(sql: string, params: unknown[] = []) =>
        (await pool.query(sql, params)).rows as T[],
      exec: async (sql: string) => {
        await pool.query(sql);
      },
    };
  } else if (process.env.VERCEL) {
    throw new DbNotConfigured();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    const dir = process.env.PGLITE_DIR || "./.data/pglite";
    mkdirSync(dir, { recursive: true });
    const pg = new PGlite(dir);
    await pg.waitReady;
    db = {
      kind: "pglite",
      query: async <T>(sql: string, params: unknown[] = []) =>
        (await pg.query(sql, params)).rows as T[],
      exec: async (sql: string) => {
        await pg.exec(sql);
      },
    };
  }

  try {
    await db.exec(SCHEMA);
  } catch {
    // гонка двух одновременных cold-start'ов: повторяем один раз
    await new Promise((r) => setTimeout(r, 300));
    await db.exec(SCHEMA);
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!g.__ecoDb) {
    g.__ecoDb = init().catch((e) => {
      g.__ecoDb = undefined;
      throw e;
    });
  }
  return g.__ecoDb;
}

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await getDb()).query<T>(sql, params);
}
