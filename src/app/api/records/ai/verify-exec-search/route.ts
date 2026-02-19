import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, updateRecord } from '@/lib/recordsRepo';
import { getPool } from '@/lib/db';
import { openaiChatJson } from '@/lib/ai';

const Schema = z.object({ id: z.string().uuid() });

const OutSchema = z.object({
  status: z.enum(['unknown', 'yes', 'no']),
  reason: z.string().default(''),
});

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const json = await req.json();
    const body = Schema.parse(json);

    const pool = getPool();
    const res = await pool.query(`select * from records where id=$1`, [body.id]);
    const r = res.rows[0];
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const prompt = {
      companyName: String(r.company_name ?? ''),
      domain: String(r.domain ?? ''),
      execSearchCategory: String(r.exec_search_category ?? ''),
      firmNiche: String(r.firm_niche ?? ''),
      executiveName: String(r.executive_name ?? ''),
      executiveRole: String(r.executive_role ?? ''),
      executiveLinkedIn: String(r.executive_linkedin ?? ''),
      email: String(r.email ?? ''),
      notes: String(r.perplexity_research_notes ?? ''),
    };

    const out = await openaiChatJson({
      schema: OutSchema,
      messages: [
        {
          role: 'system',
          content:
            'Decide if this firm is likely currently running an executive search/leadership hiring effort based on the record context. Output JSON with {status: unknown|yes|no, reason: short}. Be conservative: use unknown unless evidence indicates yes/no.',
        },
        { role: 'user', content: JSON.stringify(prompt, null, 2) },
      ],
    });

    const updated = await updateRecord(body.id, { execSearchStatus: out.status });

    return NextResponse.json({ record: updated, ai: out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
