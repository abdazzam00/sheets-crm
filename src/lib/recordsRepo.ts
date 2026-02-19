import { z } from 'zod';
import type { RecordRow } from '@/lib/schema';
import { nowIso } from '@/lib/normalize';
import { getPool } from '@/lib/db';

export async function ensureSchema() {
  const pool = getPool();

  // Base table (executive-level)
  await pool.query(`
    create table if not exists records (
      id uuid primary key,
      company_name text,
      domain text,
      exec_search_category text,
      exec_search_status text,
      perplexity_research_notes text,
      firm_niche text,
      executive_name text,
      executive_role text,
      executive_linkedin text,
      email text,
      email_template text,
      source_file text,
      raw_row_json text,
      import_batch_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  // Lightweight migration for existing deployments
  await pool.query(`alter table records add column if not exists exec_search_status text;`);
  await pool.query(`alter table records add column if not exists email_template text;`);
  await pool.query(`alter table records add column if not exists import_batch_id uuid;`);

  // Import batches (event log)
  await pool.query(`
    create table if not exists import_batches (
      id uuid primary key,
      source_file text,
      created_at timestamptz not null default now()
    );
  `);

  // Snippets (global key/value)
  await pool.query(`
    create table if not exists snippets (
      key text primary key,
      value text,
      updated_at timestamptz not null default now()
    );
  `);

  // Companies table (for firm-level uniqueness / dedupe)
  await pool.query(`
    create table if not exists companies (
      id uuid primary key,
      company_name text,
      domain text,
      normalized_name text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(domain),
      unique(normalized_name)
    );
  `);

  await pool.query(`create index if not exists records_email_idx on records (lower(email));`);
  await pool.query(
    `create index if not exists records_exec_linkedin_idx on records (lower(executive_linkedin));`
  );
  await pool.query(
    `create index if not exists records_domain_exec_idx on records (lower(domain), lower(executive_name));`
  );
  await pool.query(`create index if not exists records_import_batch_idx on records (import_batch_id);`);
}

function toRow(db: Record<string, unknown>): RecordRow {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const statusRaw = s(db.exec_search_status).toLowerCase();
  const execSearchStatus = (statusRaw === 'yes' || statusRaw === 'no' || statusRaw === 'unknown'
    ? statusRaw
    : 'unknown') as RecordRow['execSearchStatus'];

  return {
    id: s(db.id),
    companyName: s(db.company_name),
    domain: s(db.domain),
    execSearchCategory: s(db.exec_search_category),
    execSearchStatus,
    perplexityResearchNotes: s(db.perplexity_research_notes),
    firmNiche: s(db.firm_niche),
    executiveName: s(db.executive_name),
    executiveRole: s(db.executive_role),
    executiveLinkedIn: s(db.executive_linkedin),
    email: s(db.email),
    emailTemplate: s(db.email_template),
    sourceFile: s(db.source_file),
    rawRowJson: s(db.raw_row_json),
    importBatchId: s(db.import_batch_id),
    createdAt: db.created_at ? new Date(s(db.created_at)).toISOString() : nowIso(),
    updatedAt: db.updated_at ? new Date(s(db.updated_at)).toISOString() : nowIso(),
  };
}

export async function listRecords(limit = 2000): Promise<RecordRow[]> {
  const pool = getPool();
  await ensureSchema();
  const res = await pool.query(
    `select * from records order by updated_at desc nulls last, created_at desc limit $1`,
    [limit]
  );
  return res.rows.map(toRow);
}

function norm(s: string) {
  return (s ?? '').trim();
}

function hasVal(s?: string | null) {
  return !!(s && String(s).trim().length > 0);
}

function pickFirstNonEmpty(...vals: Array<string | null | undefined>) {
  for (const v of vals) {
    if (hasVal(v)) return String(v).trim();
  }
  return '';
}

export function computeDedupKey(r: Partial<RecordRow>) {
  const email = norm(r.email || '').toLowerCase();
  const li = norm(r.executiveLinkedIn || '').toLowerCase();
  const domain = norm(r.domain || '').toLowerCase();
  const exec = norm(r.executiveName || '').toLowerCase();
  if (email) return { kind: 'email' as const, key: email };
  if (li) return { kind: 'linkedin' as const, key: li };
  if (domain && exec) return { kind: 'domain_exec' as const, key: `${domain}::${exec}` };
  return { kind: 'none' as const, key: '' };
}

export async function findExistingFor(r: Partial<RecordRow>) {
  const pool = getPool();
  const email = norm(r.email || '').toLowerCase();
  if (email) {
    const res = await pool.query(`select * from records where lower(email)= $1 limit 1`, [email]);
    if (res.rows[0]) return toRow(res.rows[0]);
  }
  const li = norm(r.executiveLinkedIn || '').toLowerCase();
  if (li) {
    const res = await pool.query(
      `select * from records where lower(executive_linkedin)= $1 limit 1`,
      [li]
    );
    if (res.rows[0]) return toRow(res.rows[0]);
  }
  const domain = norm(r.domain || '').toLowerCase();
  const exec = norm(r.executiveName || '').toLowerCase();
  if (domain && exec) {
    const res = await pool.query(
      `select * from records where lower(domain)= $1 and lower(executive_name)= $2 limit 1`,
      [domain, exec]
    );
    if (res.rows[0]) return toRow(res.rows[0]);
  }
  return null;
}

export function mergeRecords(existing: RecordRow, incoming: Partial<RecordRow>): RecordRow {
  return {
    ...existing,
    companyName: pickFirstNonEmpty(existing.companyName, incoming.companyName),
    domain: pickFirstNonEmpty(existing.domain, incoming.domain),
    execSearchCategory: pickFirstNonEmpty(existing.execSearchCategory, incoming.execSearchCategory),
    execSearchStatus: (pickFirstNonEmpty(existing.execSearchStatus, incoming.execSearchStatus) ||
      'unknown') as RecordRow['execSearchStatus'],
    perplexityResearchNotes: pickFirstNonEmpty(
      existing.perplexityResearchNotes,
      incoming.perplexityResearchNotes
    ),
    firmNiche: pickFirstNonEmpty(existing.firmNiche, incoming.firmNiche),
    executiveName: pickFirstNonEmpty(existing.executiveName, incoming.executiveName),
    executiveRole: pickFirstNonEmpty(existing.executiveRole, incoming.executiveRole),
    executiveLinkedIn: pickFirstNonEmpty(existing.executiveLinkedIn, incoming.executiveLinkedIn),
    email: pickFirstNonEmpty(existing.email, incoming.email),
    emailTemplate: pickFirstNonEmpty(existing.emailTemplate, incoming.emailTemplate),
    sourceFile: pickFirstNonEmpty(existing.sourceFile, incoming.sourceFile),
    rawRowJson: pickFirstNonEmpty(existing.rawRowJson, incoming.rawRowJson),
    importBatchId: pickFirstNonEmpty(existing.importBatchId, incoming.importBatchId),
    updatedAt: nowIso(),
  };
}

export async function upsertMerged(
  incoming: Partial<RecordRow> & { importBatchId?: string }
): Promise<{ record: RecordRow; created: boolean; dedupKind: string }> {
  const pool = getPool();
  await ensureSchema();
  const existing = await findExistingFor(incoming);
  if (!existing) {
    const id = crypto.randomUUID();
    const res = await pool.query(
      `insert into records (
        id, company_name, domain, exec_search_category, exec_search_status,
        perplexity_research_notes, firm_niche,
        executive_name, executive_role, executive_linkedin, email,
        email_template,
        source_file, raw_row_json, import_batch_id, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
      returning *`,
      [
        id,
        incoming.companyName ?? '',
        incoming.domain ?? '',
        incoming.execSearchCategory ?? '',
        (incoming.execSearchStatus ?? 'unknown') as RecordRow['execSearchStatus'],
        incoming.perplexityResearchNotes ?? '',
        incoming.firmNiche ?? '',
        incoming.executiveName ?? '',
        incoming.executiveRole ?? '',
        incoming.executiveLinkedIn ?? '',
        incoming.email ?? '',
        incoming.emailTemplate ?? '',
        incoming.sourceFile ?? '',
        incoming.rawRowJson ?? '',
        incoming.importBatchId ?? null,
      ]
    );
    const rec = toRow(res.rows[0]);
    const dk = computeDedupKey(rec);
    return { record: rec, created: true, dedupKind: dk.kind };
  }

  const merged = mergeRecords(existing, incoming);
  const res = await pool.query(
    `update records set
      company_name=$2,
      domain=$3,
      exec_search_category=$4,
      exec_search_status=coalesce(nullif($5,''), exec_search_status),
      perplexity_research_notes=$6,
      firm_niche=$7,
      executive_name=$8,
      executive_role=$9,
      executive_linkedin=$10,
      email=$11,
      email_template=coalesce(nullif($12,''), email_template),
      source_file=$13,
      raw_row_json=$14,
      import_batch_id=coalesce($15, import_batch_id),
      updated_at=now()
     where id=$1
     returning *`,
    [
      existing.id,
      merged.companyName,
      merged.domain,
      merged.execSearchCategory,
      String((incoming.execSearchStatus ?? '') as RecordRow['execSearchStatus']),
      merged.perplexityResearchNotes,
      merged.firmNiche,
      merged.executiveName,
      merged.executiveRole,
      merged.executiveLinkedIn,
      merged.email,
      merged.emailTemplate ?? '',
      merged.sourceFile,
      merged.rawRowJson ?? '',
      incoming.importBatchId ?? null,
    ]
  );
  const rec = toRow(res.rows[0]);
  const dk = computeDedupKey(incoming);
  return { record: rec, created: false, dedupKind: dk.kind };
}

export async function updateRecord(id: string, patch: Partial<RecordRow>): Promise<RecordRow> {
  const pool = getPool();
  await ensureSchema();

  const schema = z.object({
    companyName: z.string().optional(),
    domain: z.string().optional(),
    execSearchCategory: z.string().optional(),
    execSearchStatus: z.enum(['unknown', 'yes', 'no']).optional(),
    perplexityResearchNotes: z.string().optional(),
    firmNiche: z.string().optional(),
    executiveName: z.string().optional(),
    executiveRole: z.string().optional(),
    executiveLinkedIn: z.string().optional(),
    email: z.string().optional(),
    emailTemplate: z.string().optional(),
    sourceFile: z.string().optional(),
  });
  const data = schema.parse(patch);

  const res = await pool.query(
    `update records set
      company_name=coalesce($2, company_name),
      domain=coalesce($3, domain),
      exec_search_category=coalesce($4, exec_search_category),
      exec_search_status=coalesce($5, exec_search_status),
      perplexity_research_notes=coalesce($6, perplexity_research_notes),
      firm_niche=coalesce($7, firm_niche),
      executive_name=coalesce($8, executive_name),
      executive_role=coalesce($9, executive_role),
      executive_linkedin=coalesce($10, executive_linkedin),
      email=coalesce($11, email),
      email_template=coalesce($12, email_template),
      source_file=coalesce($13, source_file),
      updated_at=now()
    where id=$1 returning *`,
    [
      id,
      data.companyName ?? null,
      data.domain ?? null,
      data.execSearchCategory ?? null,
      data.execSearchStatus ?? null,
      data.perplexityResearchNotes ?? null,
      data.firmNiche ?? null,
      data.executiveName ?? null,
      data.executiveRole ?? null,
      data.executiveLinkedIn ?? null,
      data.email ?? null,
      data.emailTemplate ?? null,
      data.sourceFile ?? null,
    ]
  );
  if (!res.rows[0]) throw new Error('Not found');
  return toRow(res.rows[0]);
}
