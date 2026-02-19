import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, updateRecord } from '@/lib/recordsRepo';
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

    const cacheKey = `px:deep-notes:v1:${body.id}:${String(r.updated_at ?? '')}`;
    const cached = await aiCacheGet<{ text: string }>(cacheKey);
    if (cached) {
      const updated = await updateRecord(body.id, {
        perplexityResearchNotes: [String(r.perplexity_research_notes ?? ''), cached.text].filter(Boolean).join('\n\n---\n\n'),
      });
      return NextResponse.json({ record: updated, research: cached.text, cached: true });
    }

    const q = [
      `Company: ${String(r.company_name ?? '')}`,
      `Domain: ${String(r.domain ?? '')}`,
      `Task: Write deep research notes (8-12 bullets) about what the firm does, customers, positioning, and hiring signals. Include any relevant leadership/executive search signals.`,
    ].join('\n');

    const pr = await perplexitySearch({ query: q });
    const payload = { text: pr.text };
    await aiCacheSet(cacheKey, payload);

    const updated = await updateRecord(body.id, {
      perplexityResearchNotes: [String(r.perplexity_research_notes ?? ''), pr.text].filter(Boolean).join('\n\n---\n\n'),
    });

    return NextResponse.json({ record: updated, research: pr.text, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
