import { z } from 'zod';
import { NextResponse } from 'next/server';
import { normalizeDomain } from '@/lib/normalize';
import { upsertCompany } from '@/lib/companiesRepo';
import { upsertMerged } from '@/lib/recordsRepo';
import { enqueueJobs } from '@/lib/jobs/jobsRepo';

const SuggestionSchema = z.object({
  companyName: z.string().default(''),
  domain: z.string().default(''),
  notes: z.string().default(''),
  sources: z.array(z.string()).default([]),
});

const BodySchema = z.object({
  command: z.string().default(''),
  suggestions: z.array(SuggestionSchema).default([]),
  domains: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const domainSet = new Set(body.domains.map((d) => normalizeDomain(d)).filter(Boolean));
    const picks = body.suggestions
      .map((s) => ({ ...s, domain: normalizeDomain(s.domain) }))
      .filter((s) => s.domain && domainSet.has(s.domain));

    let added = 0;
    let filteredExisting = 0;
    const addedDomains: string[] = [];

    for (const s of picks) {
      const d = normalizeDomain(s.domain);
      if (!d) continue;

      // Ensure company record exists (domain-unique enforced at DB).
      let companyId: string | null = null;
      try {
        const c = await upsertCompany({ companyName: s.companyName, domain: d });
        companyId = c.id;
      } catch {
        // If it conflicts (domain exists), skip.
        filteredExisting += 1;
        continue;
      }

      // Insert firm-only row (no exec fields) in records table.
      try {
        const ins = await upsertMerged({
          companyName: s.companyName,
          domain: d,
          perplexityResearchNotes: [s.notes, (s.sources ?? []).join('\n')].filter(Boolean).join('\n\nSources:\n'),
          executiveName: '',
          executiveRole: '',
          executiveLinkedIn: '',
          email: '',
          emailTemplate: '',
          execSearchStatus: 'unknown',
          execSearchCategory: '',
          firmNiche: '',
          sourceFile: body.command ? `research:${body.command}` : 'research',
          rawRowJson: JSON.stringify({ researchCommand: body.command, suggestion: s }),
        });

        // Link to companies table
        // We don't have a typed updater here; simplest: patch via recordsRepo updateRecord would require extra import.
        // Instead: enqueue job and rely on domain for joins; companyId field is optional in schema.
        // (If desired, we can add a small SQL update below.)
        if (companyId) {
          // best-effort link
          const { getPool } = await import('@/lib/db');
          const pool = getPool();
          await pool.query(`update records set company_id=$2 where id=$1`, [ins.record.id, companyId]);
        }

        // Enqueue enrich job for this new record.
        await enqueueJobs({ recordIds: [ins.record.id], jobType: 'enrich_record', inputHashByRecordId: new Map() });

        added += 1;
        addedDomains.push(d);
      } catch {
        // likely domain dedupe collision in records
        filteredExisting += 1;
        continue;
      }
    }

    return NextResponse.json({
      ok: true,
      addedDomains,
      telemetry: {
        suggested: body.suggestions.length,
        filteredExisting,
        added,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
