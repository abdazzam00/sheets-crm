import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, updateRecord } from '@/lib/recordsRepo';
import { getPool } from '@/lib/db';
import { openaiChatJson } from '@/lib/ai';
import { aiCacheGet, aiCacheSet, ensureAiCacheTable } from '@/lib/aiCache';

const Schema = z.object({ id: z.string().uuid() });

const OutSchema = z.object({
  emailTemplate: z.string().default(''),
});

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

    const ctx = {
      companyName: String(r.company_name ?? ''),
      domain: String(r.domain ?? ''),
      executiveName: String(r.executive_name ?? ''),
      executiveRole: String(r.executive_role ?? ''),
      firmNiche: String(r.firm_niche ?? ''),
      notes: String(r.perplexity_research_notes ?? ''),
    };

    const cacheKey = `ai:email-template:v1:${body.id}:${String(r.updated_at ?? '')}`;
    const cached = await aiCacheGet<{ emailTemplate: string }>(cacheKey);
    if (cached) {
      if (cached.emailTemplate) {
        const updated = await updateRecord(body.id, { emailTemplate: cached.emailTemplate });
        return NextResponse.json({ record: updated, ai: cached, cached: true });
      }
      return NextResponse.json({ record: r, ai: cached, cached: true });
    }

    const out = await openaiChatJson({
      schema: OutSchema,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'Draft a concise cold email template. Use these placeholders exactly: {{executiveName}}, {{companyName}}, {{domain}}, {{executiveRole}}, {{firmNiche}}. Keep under 120 words. Output JSON {emailTemplate}.',
        },
        { role: 'user', content: JSON.stringify(ctx, null, 2) },
      ],
    });

    await aiCacheSet(cacheKey, out);

    const updated = out.emailTemplate ? await updateRecord(body.id, { emailTemplate: out.emailTemplate }) : r;
    return NextResponse.json({ record: updated, ai: out, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
