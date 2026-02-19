import { getPool } from '@/lib/db';
import { ensureSchema } from '@/lib/recordsRepo';
import { clean, normalizeDomain, normalizeCompanyName, isValidDomainLike } from '@/lib/normalize';

export type CompanyRow = {
  id: string;
  companyName: string;
  domain: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
};

function s(v: unknown) {
  return v === null || v === undefined ? '' : String(v);
}

function toCompanyRow(db: Record<string, unknown>): CompanyRow {
  return {
    id: s(db.id),
    companyName: s(db.company_name),
    domain: s(db.domain),
    normalizedName: s(db.normalized_name),
    createdAt: db.created_at ? new Date(s(db.created_at)).toISOString() : '',
    updatedAt: db.updated_at ? new Date(s(db.updated_at)).toISOString() : '',
    deletedAt: db.deleted_at ? new Date(s(db.deleted_at)).toISOString() : '',
  };
}

export async function ensureCompanyForDomain(input: {
  companyName?: string;
  domain?: string;
}): Promise<{ companyId: string | null; domain: string }> {
  const pool = getPool();
  await ensureSchema();

  const domain = normalizeDomain(input.domain ?? '');
  if (!domain || !isValidDomainLike(domain)) return { companyId: null, domain: '' };

  const companyName = clean(input.companyName ?? '');
  const normalizedName = companyName ? normalizeCompanyName(companyName) : '';

  // Upsert by domain (primary firm key). Ignore normalized_name uniqueness in favor of domain.
  const res = await pool.query(
    `insert into companies (id, company_name, domain, normalized_name, updated_at)
     values ($1,$2,$3,$4, now())
     on conflict (domain) do update set
       company_name = coalesce(nullif(excluded.company_name,''), companies.company_name),
       normalized_name = coalesce(nullif(excluded.normalized_name,''), companies.normalized_name),
       updated_at = now(),
       deleted_at = null
     returning *`,
    [crypto.randomUUID(), companyName, domain, normalizedName]
  );

  return { companyId: s(res.rows[0]?.id) || null, domain };
}

export async function findDuplicateDomains(limit = 200): Promise<
  Array<{ domain: string; companyIds: string[]; recordIds: string[]; companyCount: number; recordCount: number }>
> {
  const pool = getPool();
  await ensureSchema();

  // duplicates among companies
  const comp = await pool.query(
    `select lower(domain) as domain, array_agg(id::text) as company_ids, count(*)::int as company_count
     from companies
     where deleted_at is null and domain is not null and domain <> ''
     group by lower(domain)
     having count(*) > 1
     order by count(*) desc
     limit $1`,
    [limit]
  );

  // duplicates among records by domain
  const rec = await pool.query(
    `select lower(domain) as domain, array_agg(id::text) as record_ids, count(*)::int as record_count
     from records
     where deleted_at is null and domain is not null and domain <> ''
     group by lower(domain)
     having count(*) > 1
     order by count(*) desc
     limit $1`,
    [limit]
  );

  const byDomain = new Map<
    string,
    {
      domain: string;
      companyIds: string[];
      recordIds: string[];
      companyCount: number;
      recordCount: number;
    }
  >();
  for (const r of comp.rows) {
    byDomain.set(String(r.domain), {
      domain: String(r.domain),
      companyIds: (r.company_ids ?? []) as string[],
      recordIds: [],
      companyCount: Number(r.company_count ?? 0),
      recordCount: 0,
    });
  }
  for (const r of rec.rows) {
    const d = String(r.domain);
    const cur = byDomain.get(d) || {
      domain: d,
      companyIds: [],
      recordIds: [],
      companyCount: 0,
      recordCount: 0,
    };
    cur.recordIds = (r.record_ids ?? []) as string[];
    cur.recordCount = Number(r.record_count ?? 0);
    byDomain.set(d, cur);
  }

  return Array.from(byDomain.values()).sort((a, b) => (b.companyCount + b.recordCount) - (a.companyCount + a.recordCount));
}

export async function mergeCompaniesByDomain(opts: {
  domain: string;
  dryRun?: boolean;
}): Promise<{
  domain: string;
  canonicalCompanyId: string | null;
  mergedCompanyIds: string[];
  movedRecordIds: string[];
  deletedCompanyIds: string[];
}> {
  const pool = getPool();
  await ensureSchema();

  const domain = normalizeDomain(opts.domain);
  if (!domain || !isValidDomainLike(domain)) throw new Error('Invalid domain');

  const dryRun = !!opts.dryRun;

  const companiesRes = await pool.query(
    `select * from companies where deleted_at is null and lower(domain)=lower($1) order by updated_at desc nulls last, created_at desc`,
    [domain]
  );
  const companies = companiesRes.rows.map(toCompanyRow);
  if (companies.length <= 1) {
    return {
      domain,
      canonicalCompanyId: companies[0]?.id ?? null,
      mergedCompanyIds: companies.map((c) => c.id),
      movedRecordIds: [],
      deletedCompanyIds: [],
    };
  }

  const canonical = companies[0];
  const dupes = companies.slice(1);

  // Merge fields into canonical (prefer non-empty, keep latest updated_at)
  const mergedCompanyName = canonical.companyName || dupes.find((d) => d.companyName)?.companyName || '';
  const mergedNormalized = canonical.normalizedName || normalizeCompanyName(mergedCompanyName);

  const before = { canonical: canonical, dupes: dupes };
  const after = { ...canonical, companyName: mergedCompanyName, normalizedName: mergedNormalized };

  // Records associated by company_id (future) or by domain fallback
  const recordsRes = await pool.query(
    `select id::text from records where deleted_at is null and (company_id = any($1::uuid[]) or lower(domain)=lower($2))`,
    [companies.map((c) => c.id), domain]
  );
  const movedRecordIds = recordsRes.rows.map((r) => String(r.id));

  if (!dryRun) {
    await pool.query('begin');
    try {
      await pool.query(
        `update companies set company_name=$2, normalized_name=$3, updated_at=now(), deleted_at=null where id=$1`,
        [canonical.id, mergedCompanyName, mergedNormalized]
      );

      await pool.query(
        `update records set company_id=$2 where deleted_at is null and (company_id = any($1::uuid[]) or lower(domain)=lower($3))`,
        [dupes.map((d) => d.id), canonical.id, domain]
      );

      await pool.query(
        `update companies set deleted_at=now(), updated_at=now() where id = any($1::uuid[])`,
        [dupes.map((d) => d.id)]
      );

      await pool.query(
        `insert into company_merge_log (id, domain, canonical_company_id, merged_company_ids, before, after, dry_run)
         values ($1,$2,$3,$4,$5,$6,false)`,
        [
          crypto.randomUUID(),
          domain,
          canonical.id,
          JSON.stringify(companies.map((c) => c.id)),
          JSON.stringify(before),
          JSON.stringify(after),
        ]
      );

      await pool.query('commit');
    } catch (e) {
      await pool.query('rollback');
      throw e;
    }
  } else {
    await pool.query(
      `insert into company_merge_log (id, domain, canonical_company_id, merged_company_ids, before, after, dry_run)
       values ($1,$2,$3,$4,$5,$6,true)`,
      [
        crypto.randomUUID(),
        domain,
        canonical.id,
        JSON.stringify(companies.map((c) => c.id)),
        JSON.stringify(before),
        JSON.stringify(after),
      ]
    );
  }

  return {
    domain,
    canonicalCompanyId: canonical.id,
    mergedCompanyIds: companies.map((c) => c.id),
    movedRecordIds,
    deletedCompanyIds: dupes.map((d) => d.id),
  };
}
