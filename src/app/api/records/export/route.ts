import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/recordsRepo';
import { getPool } from '@/lib/db';

const Schema = z.object({
  format: z.enum(['csv', 'tsv']).default('csv'),
  filter: z
    .object({
      execSearchStatus: z.enum(['any', 'unknown', 'yes', 'no']).default('any'),
      hasEmail: z.boolean().default(false),
      q: z.string().default(''),
      limit: z.number().int().min(1).max(20000).default(5000),
    })
    .default({ execSearchStatus: 'any', hasEmail: false, q: '', limit: 5000 }),
});

function escCsv(v: string) {
  const s = v ?? '';
  if (/[\t\n\r,"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const json = await req.json();
    const body = Schema.parse(json);
    const pool = getPool();

    const where: string[] = [];
    const params: unknown[] = [];
    if (body.filter.execSearchStatus !== 'any') {
      params.push(body.filter.execSearchStatus);
      where.push(`coalesce(exec_search_status,'unknown') = $${params.length}`);
    }
    if (body.filter.hasEmail) {
      where.push(`coalesce(email,'') <> ''`);
    }
    if (body.filter.q.trim()) {
      params.push(`%${body.filter.q.trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(
        `(
          lower(coalesce(company_name,'')) like ${p} or
          lower(coalesce(domain,'')) like ${p} or
          lower(coalesce(executive_name,'')) like ${p} or
          lower(coalesce(executive_role,'')) like ${p} or
          lower(coalesce(email,'')) like ${p}
        )`
      );
    }

    params.push(body.filter.limit);
    const sql = `select * from records ${where.length ? 'where ' + where.join(' and ') : ''}
      order by updated_at desc nulls last, created_at desc limit $${params.length}`;

    const res = await pool.query(sql, params);

    const cols = [
      'Company Name',
      'Domain',
      'Exec Search Category (Perplexity)',
      'Exec Search?',
      'Perplexity Research Notes',
      'Firm Niche',
      'Executive Name',
      'Executive Role',
      'Executive LinkedIn',
      'Email',
      'Email Template',
    ];

    const sep = body.format === 'tsv' ? '\t' : ',';
    const lines: string[] = [];
    lines.push(cols.join(sep));

    for (const r of res.rows) {
      const vals = [
        String(r.company_name ?? ''),
        String(r.domain ?? ''),
        String(r.exec_search_category ?? ''),
        String(r.exec_search_status ?? 'unknown'),
        String(r.perplexity_research_notes ?? ''),
        String(r.firm_niche ?? ''),
        String(r.executive_name ?? ''),
        String(r.executive_role ?? ''),
        String(r.executive_linkedin ?? ''),
        String(r.email ?? ''),
        String(r.email_template ?? ''),
      ];
      if (body.format === 'tsv') {
        lines.push(vals.map((v) => v.replace(/[\r\n\t]/g, ' ')).join(sep));
      } else {
        lines.push(vals.map(escCsv).join(sep));
      }
    }

    const out = lines.join('\n');
    return new NextResponse(out, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="records.${body.format}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
