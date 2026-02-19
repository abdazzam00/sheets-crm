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

    const cacheKey = `px:executives:v1:${body.id}:${String(r.updated_at ?? '')}`;
    const cached = await aiCacheGet<{ text: string }>(cacheKey);
    if (cached) return NextResponse.json({ executives: cached.text, cached: true });

    const q = [
      `Find key executives for this firm and provide names + roles + any LinkedIn/website citations if available.`,
      `Company: ${String(r.company_name ?? '')}`,
      `Domain: ${String(r.domain ?? '')}`,
      `Output: 5-10 bullets, each: Name — Role — Source URL (if found).`,
    ].join('\n');

    const pr = await perplexitySearch({ query: q });
    const payload = { text: pr.text };
    await aiCacheSet(cacheKey, payload);

    return NextResponse.json({ executives: pr.text, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
