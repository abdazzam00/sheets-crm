import { getPool } from '@/lib/db';

export async function ensureAiCacheTable() {
  const pool = getPool();
  await pool.query(
    `create table if not exists ai_cache (
      key text primary key,
      value_json jsonb not null,
      created_at timestamptz not null default now()
    )`
  );
}

export async function aiCacheGet<T = unknown>(key: string): Promise<T | null> {
  const pool = getPool();
  const res = await pool.query(`select value_json from ai_cache where key=$1`, [key]);
  return (res.rows[0]?.value_json as T) ?? null;
}

export async function aiCacheSet<T = unknown>(key: string, value: T): Promise<void> {
  const pool = getPool();
  await pool.query(
    `insert into ai_cache(key, value_json) values ($1,$2)
     on conflict (key) do update set value_json=excluded.value_json`,
    [key, JSON.stringify(value)]
  );
}
