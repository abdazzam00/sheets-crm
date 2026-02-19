import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, updateRecord } from '@/lib/recordsRepo';
import { getPool } from '@/lib/db';
import { perplexitySearch } from '@/lib/ai';

const Schema = z.object({ id: z.string().uuid() });

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const json = await req.json();
    const body = Schema.parse(json);

    const pool = getPool();
    const res = await pool.query(`select * from records where id=$1`, [body.id]);
    const r = res.rows[0];
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const q = [
      `Company: ${String(r.company_name ?? '')}`,
      `Domain: ${String(r.domain ?? '')}`,
      `Executive: ${String(r.executive_name ?? '')} (${String(r.executive_role ?? '')})`,
      `Need: summarize what this firm does, niche, and any relevant recent executive search/hiring signals.`,
    ]
      .filter(Boolean)
      .join('\n');

    const pr = await perplexitySearch({ query: q });

    const updated = await updateRecord(body.id, {
      perplexityResearchNotes: [String(r.perplexity_research_notes ?? ''), pr.text]
        .filter(Boolean)
        .join('\n\n---\n\n'),
    });

    return NextResponse.json({ record: updated, research: pr.text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
