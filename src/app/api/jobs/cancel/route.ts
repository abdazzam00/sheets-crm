import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureJobsSchema } from '@/lib/jobs/jobsRepo';
import { getPool } from '@/lib/db';

const BodySchema = z.object({
  all: z.boolean().optional().default(true),
  statuses: z.array(z.enum(['queued', 'rate_limited', 'running'])).optional().default(['queued', 'rate_limited']),
});

export async function POST(req: Request) {
  try {
    await ensureJobsSchema();
    const json = await req.json().catch(() => ({}));
    const body = BodySchema.parse(json);

    const pool = getPool();

    const res = await pool.query(
      `update ai_jobs
       set status='cancelled', updated_at=now()
       where status = any($1::text[])
       returning id`,
      [body.statuses]
    );

    return NextResponse.json({ ok: true, cancelled: res.rowCount ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
