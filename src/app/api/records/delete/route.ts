import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/recordsRepo';
import { getPool } from '@/lib/db';

const Schema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const json = await req.json();
    const body = Schema.parse(json);
    const pool = getPool();
    const res = await pool.query(`delete from records where id = any($1::uuid[])`, [body.ids]);
    return NextResponse.json({ deleted: res.rowCount ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
