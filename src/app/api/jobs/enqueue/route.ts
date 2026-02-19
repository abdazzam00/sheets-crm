import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/recordsRepo';
import { getPool } from '@/lib/db';
import {
  EnqueueFilterSchema,
  enqueueJobs,
  getRecordIdsForFilter,
  stableHash,
  type JobType,
} from '@/lib/jobs/jobsRepo';

const BodySchema = z.object({
  action: z.enum(['enrich_all', 'verify_all']),
  filter: EnqueueFilterSchema.optional().default({}),
});

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const json = await req.json();
    const body = BodySchema.parse(json);

    const jobType: JobType = body.action === 'enrich_all' ? 'enrich_record' : 'verify_record';
    const recordIds = await getRecordIdsForFilter(body.filter ?? {});

    const pool = getPool();
    const inputHashByRecordId = new Map<string, string>();

    // compute input hashes based on the inputs used by each job type
    for (const id of recordIds) {
      const res = await pool.query(`select * from records where id=$1`, [id]);
      const r = res.rows[0];
      if (!r) continue;

      if (jobType === 'verify_record') {
        inputHashByRecordId.set(
          id,
          stableHash({
            company_name: r.company_name,
            domain: r.domain,
            exec_search_category: r.exec_search_category,
            firm_niche: r.firm_niche,
            executive_name: r.executive_name,
            executive_role: r.executive_role,
            executive_linkedin: r.executive_linkedin,
            email: r.email,
            perplexity_research_notes: r.perplexity_research_notes,
          })
        );
      } else {
        // enrich uses more external data; hash only record core identifiers
        inputHashByRecordId.set(
          id,
          stableHash({
            company_name: r.company_name,
            domain: r.domain,
            executive_name: r.executive_name,
            executive_linkedin: r.executive_linkedin,
          })
        );
      }
    }

    const result = await enqueueJobs({ recordIds, jobType, inputHashByRecordId });

    return NextResponse.json({
      ok: true,
      action: body.action,
      jobType,
      totalMatched: recordIds.length,
      ...result,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
