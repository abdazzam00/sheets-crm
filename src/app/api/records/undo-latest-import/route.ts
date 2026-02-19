import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/recordsRepo';
import { getPool } from '@/lib/db';

export async function POST() {
  try {
    await ensureSchema();
    const pool = getPool();

    const latest = await pool.query(
      `select id from import_batches order by created_at desc limit 1`
    );
    const batchId = latest.rows[0]?.id as string | undefined;
    if (!batchId) return NextResponse.json({ ok: true, deleted: 0 });

    const del = await pool.query(`delete from records where import_batch_id = $1`, [batchId]);
    await pool.query(`delete from import_batches where id=$1`, [batchId]);

    return NextResponse.json({ ok: true, deleted: del.rowCount ?? 0, batchId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
