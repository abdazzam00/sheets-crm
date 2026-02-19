import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { RecordRow } from '@/lib/schema';
import { nowIso } from '@/lib/normalize';
import { getPool } from '@/lib/db';

export async function ensureSchema() {
  const pool = getPool();
  await pool.query(`
    create table if not exists records (
      id uuid primary key,
      company_name text,
      domain text,
      exec_search_category text,
      perplexity_research_notes text,
      firm_niche text,
      executive_name text,
      executive_role text,
      executive_linkedin text,
      email text,
      source_file text,
      raw_row_json text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await pool.query(`create index if not exists records_email_idx on records (lower(email));`);
  await pool.query(
    `create index if not exists records_exec_linkedin_idx on records (lower(executive_linkedin));`
  );
  await pool.query(
    `create index if not exists records_domain_exec_idx on records (lower(domain), lower(executive_name));`
  );
}

function toRow(db: any): RecordRow {
  return {
    id: db.id,
    companyName: db.company_name ?? '',
    domain: db.domain ?? '',
    execSearchCategory: db.exec_search_category ?? '',
    perplexityResearchNotes: db.perplexity_research_notes ?? '',
    firmNiche: db.firm_niche ?? '',
    executiveName: db.executive_name ?? '',
    executiveRole: db.executive_role ?? '',
    executiveLinkedIn: db.executive_linkedin ?? '',
    email: db.email ?? '',
    sourceFile: db.source_file ?? '',
    rawRowJson: db.raw_row_json ?? '',
    createdAt: db.created_at ? new Date(db.created_at).toISOString() : nowIso(),
    updatedAt: db.updated_at ? new Date(db.updated_at).toISOString() : nowIso(),
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
    perplexityResearchNotes: pickFirstNonEmpty(
      existing.perplexityResearchNotes,
      incoming.perplexityResearchNotes
    ),
    firmNiche: pickFirstNonEmpty(existing.firmNiche, incoming.firmNiche),
    executiveName: pickFirstNonEmpty(existing.executiveName, incoming.executiveName),
    executiveRole: pickFirstNonEmpty(existing.executiveRole, incoming.executiveRole),
    executiveLinkedIn: pickFirstNonEmpty(existing.executiveLinkedIn, incoming.executiveLinkedIn),
    email: pickFirstNonEmpty(existing.email, incoming.email),
    sourceFile: pickFirstNonEmpty(existing.sourceFile, incoming.sourceFile),
    rawRowJson: pickFirstNonEmpty(existing.rawRowJson, incoming.rawRowJson),
    updatedAt: nowIso(),
  };
}

export async function upsertMerged(incoming: Partial<RecordRow>): Promise<{ record: RecordRow; created: boolean; dedupKind: string }> {
  const pool = getPool();
  await ensureSchema();
  const existing = await findExistingFor(incoming);
  if (!existing) {
    const id = randomUUID();
    const res = await pool.query(
      `insert into records (
        id, company_name, domain, exec_search_category, perplexity_research_notes, firm_niche,
        executive_name, executive_role, executive_linkedin, email, source_file, raw_row_json, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
      returning *`,
      [
        id,
        incoming.companyName ?? '',
        incoming.domain ?? '',
        incoming.execSearchCategory ?? '',
        incoming.perplexityResearchNotes ?? '',
        incoming.firmNiche ?? '',
        incoming.executiveName ?? '',
        incoming.executiveRole ?? '',
        incoming.executiveLinkedIn ?? '',
        incoming.email ?? '',
        incoming.sourceFile ?? '',
        incoming.rawRowJson ?? '',
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
      perplexity_research_notes=$5,
      firm_niche=$6,
      executive_name=$7,
      executive_role=$8,
      executive_linkedin=$9,
      email=$10,
      source_file=$11,
      raw_row_json=$12,
      updated_at=now()
     where id=$1
     returning *`,
    [
      existing.id,
      merged.companyName,
      merged.domain,
      merged.execSearchCategory,
      merged.perplexityResearchNotes,
      merged.firmNiche,
      merged.executiveName,
      merged.executiveRole,
      merged.executiveLinkedIn,
      merged.email,
      merged.sourceFile,
      merged.rawRowJson ?? '',
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
    perplexityResearchNotes: z.string().optional(),
    firmNiche: z.string().optional(),
    executiveName: z.string().optional(),
    executiveRole: z.string().optional(),
    executiveLinkedIn: z.string().optional(),
    email: z.string().optional(),
    sourceFile: z.string().optional(),
  });
  const data = schema.parse(patch);

  const res = await pool.query(
    `update records set
      company_name=coalesce($2, company_name),
      domain=coalesce($3, domain),
      exec_search_category=coalesce($4, exec_search_category),
      perplexity_research_notes=coalesce($5, perplexity_research_notes),
      firm_niche=coalesce($6, firm_niche),
      executive_name=coalesce($7, executive_name),
      executive_role=coalesce($8, executive_role),
      executive_linkedin=coalesce($9, executive_linkedin),
      email=coalesce($10, email),
      source_file=coalesce($11, source_file),
      updated_at=now()
    where id=$1 returning *`,
    [
      id,
      data.companyName ?? null,
      data.domain ?? null,
      data.execSearchCategory ?? null,
      data.perplexityResearchNotes ?? null,
      data.firmNiche ?? null,
      data.executiveName ?? null,
      data.executiveRole ?? null,
      data.executiveLinkedIn ?? null,
      data.email ?? null,
      data.sourceFile ?? null,
    ]
  );
  if (!res.rows[0]) throw new Error('Not found');
  return toRow(res.rows[0]);
}
