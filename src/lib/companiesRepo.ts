import { getPool } from '@/lib/db';
import { normalizeCompanyName, normalizeDomain } from '@/lib/normalize';

export type CompanyRow = {
  id: string;
  companyName: string;
  domain: string;
  normalizedName: string;
};

export async function upsertCompany(input: { companyName?: string; domain?: string }) {
  const pool = getPool();

  const domain = normalizeDomain(input.domain ?? '');
  const normalizedName = normalizeCompanyName(input.companyName ?? '');

  // Prefer domain uniqueness when present; else use normalized name.
  if (domain) {
    const res = await pool.query(
      `insert into companies (id, company_name, domain, normalized_name, updated_at)
       values ($1,$2,$3,$4, now())
       on conflict (domain) do update set
         company_name=coalesce(nullif(excluded.company_name,''), companies.company_name),
         normalized_name=coalesce(nullif(excluded.normalized_name,''), companies.normalized_name),
         updated_at=now()
       returning *`,
      [crypto.randomUUID(), input.companyName ?? '', domain, normalizedName]
    );
    return {
      id: String(res.rows[0].id),
      companyName: String(res.rows[0].company_name ?? ''),
      domain: String(res.rows[0].domain ?? ''),
      normalizedName: String(res.rows[0].normalized_name ?? ''),
    } as CompanyRow;
  }

  if (!normalizedName) {
    // can't dedupe at company-level; create a record anyway
    const res = await pool.query(
      `insert into companies (id, company_name, domain, normalized_name, updated_at)
       values ($1,$2,$3,$4, now()) returning *`,
      [crypto.randomUUID(), input.companyName ?? '', '', '']
    );
    return {
      id: String(res.rows[0].id),
      companyName: String(res.rows[0].company_name ?? ''),
      domain: String(res.rows[0].domain ?? ''),
      normalizedName: String(res.rows[0].normalized_name ?? ''),
    } as CompanyRow;
  }

  const res = await pool.query(
    `insert into companies (id, company_name, domain, normalized_name, updated_at)
     values ($1,$2,$3,$4, now())
     on conflict (normalized_name) do update set
       company_name=coalesce(nullif(excluded.company_name,''), companies.company_name),
       domain=coalesce(nullif(excluded.domain,''), companies.domain),
       updated_at=now()
     returning *`,
    [crypto.randomUUID(), input.companyName ?? '', domain, normalizedName]
  );

  return {
    id: String(res.rows[0].id),
    companyName: String(res.rows[0].company_name ?? ''),
    domain: String(res.rows[0].domain ?? ''),
    normalizedName: String(res.rows[0].normalized_name ?? ''),
  } as CompanyRow;
}
