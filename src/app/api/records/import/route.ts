import { NextResponse } from 'next/server';
import { z } from 'zod';
import { upsertMerged } from '@/lib/recordsRepo';

const ImportSchema = z.object({
  rows: z.array(
    z.object({
      companyName: z.string().optional(),
      domain: z.string().optional(),
      execSearchCategory: z.string().optional(),
      perplexityResearchNotes: z.string().optional(),
      firmNiche: z.string().optional(),
      executiveName: z.string().optional(),
      executiveRole: z.string().optional(),
      executiveLinkedIn: z.string().optional(),
      email: z.string().optional(),
      sourceFile: z.string().optional(),
      rawRowJson: z.string().optional(),
    })
  ),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = ImportSchema.parse(json);

    let created = 0;
    let updated = 0;
    const dedupCounts: Record<string, number> = {};

    const results = [];
    for (const row of body.rows) {
      const r = await upsertMerged(row);
      if (r.created) created++;
      else updated++;
      dedupCounts[r.dedupKind] = (dedupCounts[r.dedupKind] ?? 0) + 1;
      results.push(r.record);
    }

    return NextResponse.json({ created, updated, dedupCounts, records: results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes('Missing DATABASE_URL') ? 500 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
