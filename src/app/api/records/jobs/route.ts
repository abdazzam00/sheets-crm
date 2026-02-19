import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listRecords, ensureSchema } from '@/lib/recordsRepo';
import { listJobStatusByRecordIds } from '@/lib/jobs/jobsRepo';

const QuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(5000).optional() });

export async function GET(req: Request) {
  try {
    await ensureSchema();
    const url = new URL(req.url);
    const q = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const records = await listRecords(q.limit ?? 2000);
    const ids = records.map((r) => r.id);
    const map = await listJobStatusByRecordIds(ids);

    const statuses: Record<string, { status: string; updatedAt: string } | null> = {};
    for (const id of ids) statuses[id] = map.get(id) ?? null;

    return NextResponse.json({ ok: true, statuses });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
