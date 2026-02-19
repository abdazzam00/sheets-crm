import { z } from 'zod';
import { getPool } from '@/lib/db';
import { ensureSchema } from '@/lib/recordsRepo';

export type JobType = 'enrich_record' | 'verify_record';
export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'rate_limited'
  | 'cancelled';

export const EnqueueFilterSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  importBatchId: z.string().uuid().optional(),
  hasDomain: z.boolean().optional(),
  missingResearchNotes: z.boolean().optional(),
  missingExecSearchStatus: z.boolean().optional(),
});

export type EnqueueFilter = z.infer<typeof EnqueueFilterSchema>;

export async function ensureJobsSchema() {
  const pool = getPool();
  await ensureSchema();

  await pool.query(`
    create table if not exists ai_jobs (
      id uuid primary key,
      record_id uuid not null,
      job_type text not null,
      status text not null default 'queued',
      run_after timestamptz,
      attempts int not null default 0,
      last_error text,
      input_hash text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await pool.query(`create index if not exists ai_jobs_record_idx on ai_jobs (record_id);`);
  await pool.query(`create index if not exists ai_jobs_status_idx on ai_jobs (status, run_after);`);
  await pool.query(
    `create index if not exists ai_jobs_input_hash_idx on ai_jobs (record_id, job_type, input_hash);`
  );
}

export function stableHash(input: unknown): string {
  // stable JSON stringify (keys sorted)
  const seen = new WeakSet<object>();
  const norm = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map((x) => norm(x));
    const obj = v as Record<string, unknown>;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = norm(obj[k]);
    return out;
  };
  const s = JSON.stringify(norm(input));
  // simple non-crypto hash (sufficient for cache key)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a:${(h >>> 0).toString(16)}`;
}

export async function getRecordIdsForFilter(filter: EnqueueFilter): Promise<string[]> {
  const pool = getPool();
  await ensureSchema();

  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, val?: unknown) => {
    if (val === undefined) {
      clauses.push(sql);
      return;
    }
    params.push(val);
    clauses.push(sql.replace('$X', `$${params.length}`));
  };

  if (filter.ids?.length) {
    params.push(filter.ids);
    clauses.push(`id = any($${params.length}::uuid[])`);
  }
  if (filter.importBatchId) add(`import_batch_id = $X`, filter.importBatchId);
  if (filter.hasDomain === true) add(`coalesce(nullif(trim(domain),''),'') <> ''`);
  if (filter.missingResearchNotes === true)
    add(`coalesce(nullif(trim(perplexity_research_notes),''),'') = ''`);
  if (filter.missingExecSearchStatus === true)
    add(`coalesce(nullif(trim(exec_search_status),''),'unknown') = 'unknown'`);

  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const res = await pool.query(`select id from records ${where} order by updated_at desc`, params);
  return res.rows.map((r) => String(r.id));
}

export async function enqueueJobs(opts: {
  recordIds: string[];
  jobType: JobType;
  inputHashByRecordId: Map<string, string>;
}): Promise<{ enqueued: number; skippedCached: number }> {
  const pool = getPool();
  await ensureJobsSchema();

  let enqueued = 0;
  let skippedCached = 0;

  for (const recordId of opts.recordIds) {
    const inputHash = opts.inputHashByRecordId.get(recordId) ?? '';

    if (inputHash) {
      const cached = await pool.query(
        `select id from ai_jobs where record_id=$1 and job_type=$2 and status='succeeded' and input_hash=$3 limit 1`,
        [recordId, opts.jobType, inputHash]
      );
      if (cached.rows[0]) {
        skippedCached++;
        continue;
      }
    }

    const exists = await pool.query(
      `select id from ai_jobs where record_id=$1 and job_type=$2 and status in ('queued','running','rate_limited') limit 1`,
      [recordId, opts.jobType]
    );
    if (exists.rows[0]) continue;

    await pool.query(
      `insert into ai_jobs (id, record_id, job_type, status, run_after, attempts, last_error, input_hash, updated_at)
       values ($1,$2,$3,'queued', now(), 0, null, $4, now())`,
      [crypto.randomUUID(), recordId, opts.jobType, inputHash || null]
    );
    enqueued++;
  }

  return { enqueued, skippedCached };
}

export async function listJobStatusByRecordIds(recordIds: string[]) {
  const pool = getPool();
  await ensureJobsSchema();
  if (!recordIds.length) return new Map<string, { status: JobStatus; updatedAt: string }>();
  const res = await pool.query(
    `
    select distinct on (record_id)
      record_id, status, updated_at
    from ai_jobs
    where record_id = any($1::uuid[])
    order by record_id, updated_at desc
    `,
    [recordIds]
  );
  const map = new Map<string, { status: JobStatus; updatedAt: string }>();
  for (const r of res.rows) {
    map.set(String(r.record_id), {
      status: String(r.status) as JobStatus,
      updatedAt: new Date(String(r.updated_at)).toISOString(),
    });
  }
  return map;
}
