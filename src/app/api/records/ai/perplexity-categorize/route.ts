import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/recordsRepo';
import { getPool } from '@/lib/db';
import { perplexitySearch } from '@/lib/ai';
import { aiCacheGet, aiCacheSet, ensureAiCacheTable } from '@/lib/aiCache';

const Schema = z.object({ id: z.string().uuid() });

export async function POST(req: Request) {
  try {
    await ensureSchema();
    await ensureAiCacheTable();

    const json = await req.json();
    const body = Schema.parse(json);

    const pool = getPool();
    const res = await pool.query(`select * from records where id=$1`, [body.id]);
    const r = res.rows[0];
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cacheKey = `px:categorize:v1:${body.id}:${String(r.updated_at ?? '')}`;
    const cached = await aiCacheGet<{ category: string; text: string }>(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cached: true });

    const q = [
      `Categorize this firm in 1-3 words (e.g., staffing, executive search, recruiting, consultancy, SaaS, agency).`,
      `Company: ${String(r.company_name ?? '')}`,
      `Domain: ${String(r.domain ?? '')}`,
      `Provide: category on first line, then 3 bullets of evidence.`,
    ].join('\n');

    const pr = await perplexitySearch({ query: q });
    const firstLine = (pr.text.split('\n').find((l) => l.trim()) ?? '').trim();
    const payload = { category: firstLine, text: pr.text };
    await aiCacheSet(cacheKey, payload);

    return NextResponse.json({ ...payload, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
