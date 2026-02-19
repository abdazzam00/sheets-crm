import { getPool } from '@/lib/db';

export type SnippetRow = { key: string; value: string; updatedAt: string };

export async function listSnippets(): Promise<SnippetRow[]> {
  const pool = getPool();
  const res = await pool.query(`select key, value, updated_at from snippets order by key asc`);
  return res.rows.map((r) => ({
    key: String(r.key),
    value: String(r.value ?? ''),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function upsertSnippet(key: string, value: string) {
  const pool = getPool();
  const res = await pool.query(
    `insert into snippets (key, value, updated_at)
     values ($1,$2, now())
     on conflict (key) do update set value=excluded.value, updated_at=now()
     returning key, value, updated_at`,
    [key, value]
  );
  return {
    key: String(res.rows[0].key),
    value: String(res.rows[0].value ?? ''),
    updatedAt: new Date(res.rows[0].updated_at).toISOString(),
  } as SnippetRow;
}

export async function deleteSnippet(key: string) {
  const pool = getPool();
  await pool.query(`delete from snippets where key=$1`, [key]);
}
