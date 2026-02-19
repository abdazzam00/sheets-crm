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
  // Enrich pipeline (OpenAI-first). Perplexity steps are optional and should not brick the queue if auth is missing.
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) throw new Error('Missing BASE_URL env var (server-only)');

  const callJson = async (path: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
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
        (fallbackText ? fallbackText.slice(0, 300) : undefined) ??
        res.statusText;
      const err = Object.assign(new Error(String(msg)), { status: res.status });
      throw err;
    }

    return json;
  };

  // Always run OpenAI-based steps first
  await callJson('/api/records/ai/infer-domain');
  await callJson('/api/records/ai/generate-firm-niche');
  await callJson('/api/records/ai/draft-email-template');

  // Perplexity-based research notes (optional)
  try {
    await callJson('/api/records/ai/perplexity-research');
  } catch (e: unknown) {
    const status = Number(
      e && typeof e === 'object' && 'status' in e ? (e as { status?: unknown }).status : 0
    );

    // If Perplexity is unauthorized/misconfigured, do not fail the whole enrich job.
    if (status === 401 || status === 403) {
      return { ok: true, skipped: 'perplexity_research', reason: 'unauthorized' };
    }

    // Otherwise propagate (rate limiting, timeouts, etc. will be handled by worker)
    throw e;
  }

  return { ok: true };
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
        } else if (status === 401 || status === 403) {
          // Auth errors (typically misconfigured provider key) — back off longer so we don't churn.
          await pool.query(
            `update ai_jobs set status='rate_limited', run_after=now() + interval '6 hours', last_error=$2, updated_at=now() where id=$1`,
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
