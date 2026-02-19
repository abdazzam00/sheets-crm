import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db';
import { ensureJobsSchema, type JobStatus, type JobType } from '@/lib/jobs/jobsRepo';

const QuerySchema = z.object({
  max: z.coerce.number().int().min(1).max(50).optional().default(5),
});

const minDelayMs = Number(process.env.AI_JOBS_MIN_DELAY_MS ?? '1200');
let lastRunAt = 0;

async function throttle() {
  const now = Date.now();
  const waitMs = Math.max(0, lastRunAt + minDelayMs - now);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  lastRunAt = Date.now();
}

async function runVerifyJob(recordId: string) {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) throw new Error('Missing BASE_URL env var (server-only)');
  const res = await fetch(`${baseUrl}/api/records/ai/verify-exec-search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: recordId }),
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const json: unknown = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const fallbackText = isJson ? '' : await res.text().catch(() => '');
    const msg =
      (json && typeof json === 'object' && 'error' in json
        ? (json as { error?: unknown }).error
        : undefined) ??
      (fallbackText ? fallbackText.slice(0, 200) : undefined) ??
      res.statusText;
    const err = Object.assign(new Error(String(msg)), { status: res.status });
    throw err;
  }
  return json;
}

async function runEnrichJob(recordId: string) {
  // Existing enrich endpoints are per-feature; for queue we call the research endpoint (notes) as the durable piece.
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) throw new Error('Missing BASE_URL env var (server-only)');
  const res = await fetch(`${baseUrl}/api/records/ai/perplexity-research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: recordId }),
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const json: unknown = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const fallbackText = isJson ? '' : await res.text().catch(() => '');
    const msg =
      (json && typeof json === 'object' && 'error' in json
        ? (json as { error?: unknown }).error
        : undefined) ??
      (fallbackText ? fallbackText.slice(0, 200) : undefined) ??
      res.statusText;
    const err = Object.assign(new Error(String(msg)), { status: res.status });
    throw err;
  }
  return json;
}

export async function GET(req: Request) {
  try {
    await ensureJobsSchema();

    const url = new URL(req.url);
    const q = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const pool = getPool();

    const processed: Array<Record<string, unknown>> = [];

    for (let i = 0; i < q.max; i++) {
      // claim next job respecting run_after
      const claim = await pool.query(
        `
        with next as (
          select id from ai_jobs
          where status in ('queued','rate_limited')
            and (run_after is null or run_after <= now())
          order by run_after asc nulls first, created_at asc
          limit 1
          for update skip locked
        )
        update ai_jobs j
          set status='running', attempts=attempts+1, updated_at=now(), last_error=null
        from next
        where j.id = next.id
        returning j.*
        `
      );

      const job = claim.rows[0];
      if (!job) break;

      await throttle();

      try {
        const jobType = String(job.job_type) as JobType;
        const recordId = String(job.record_id);

        if (jobType === 'verify_record') {
          await runVerifyJob(recordId);
        } else {
          await runEnrichJob(recordId);
        }

        await pool.query(`update ai_jobs set status='succeeded', updated_at=now() where id=$1`, [
          job.id,
        ]);

        processed.push({ id: job.id, recordId, jobType, status: 'succeeded' as JobStatus });
      } catch (e: unknown) {
        const status = Number(
          e && typeof e === 'object' && 'status' in e ? (e as { status?: unknown }).status : 0
        );
        const msg = e instanceof Error ? e.message : String(e);
        if (status === 429) {
          await pool.query(
            `update ai_jobs set status='rate_limited', run_after=now() + interval '60 seconds', last_error=$2, updated_at=now() where id=$1`,
            [job.id, msg]
          );
          processed.push({
            id: job.id,
            recordId: String(job.record_id),
            jobType: String(job.job_type),
            status: 'rate_limited' as JobStatus,
          });
        } else {
          await pool.query(
            `update ai_jobs set status='failed', last_error=$2, updated_at=now() where id=$1`,
            [job.id, msg]
          );
          processed.push({
            id: job.id,
            recordId: String(job.record_id),
            jobType: String(job.job_type),
            status: 'failed' as JobStatus,
            error: msg,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, processed, minDelayMs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
