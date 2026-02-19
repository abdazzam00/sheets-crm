import type { RecordRow } from './schema';

export function nowIso() {
  return new Date().toISOString();
}

export function clean(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).trim();
}

export function extractDomainFromEmail(email: string): string {
  const e = clean(email).toLowerCase();
  const at = e.lastIndexOf('@');
  if (at === -1) return '';
  const dom = e.slice(at + 1).replace(/^mailto:/, '').trim();
  return dom;
}

export function normalizeLinkedIn(url: string): string {
  let u = clean(url);
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

export function normalizeDomain(input: string): string {
  let s = clean(input).toLowerCase();
  if (!s) return '';
  s = s.replace(/^mailto:/, '');
  // Accept full URLs; strip protocol/path/query/hash
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.split(/[/?#]/)[0] ?? s;
  // remove trailing dots
  s = s.replace(/\.+$/, '');
  return s;
}

export function normalizeCompanyName(name: string) {
  const s = clean(name).toLowerCase();
  if (!s) return '';
  return s
    .replace(/\b(inc|inc\.|llc|l\.l\.c\.|ltd|ltd\.|corp|corp\.|corporation|company|co\.|co)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isValidDomainLike(input: string): boolean {
  const d = normalizeDomain(input);
  if (!d) return true; // empty is allowed
  // very light validation: host labels + TLD; no spaces
  if (/\s/.test(d)) return false;
  if (!/[.]/.test(d)) return false;
  if (!/^[a-z0-9.-]+$/.test(d)) return false;
  if (d.length > 253) return false;
  const parts = d.split('.');
  if (parts.some((p) => p.length === 0 || p.length > 63)) return false;
  const tld = parts[parts.length - 1];
  if (!tld || tld.length < 2) return false;
  return true;
}

export function guessCompanyFromDomain(domain: string): string {
  const d = clean(domain).replace(/^www\./i, '');
  if (!d) return '';
  const base = d.split('.')[0] || '';
  if (!base) return '';
  return base
    .split(/[-_]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function makeEmptyRow(sourceFile: string, rawRow: unknown): RecordRow {
  const ts = nowIso();
  return {
    id: (globalThis.crypto as Crypto).randomUUID(),
    companyName: '',
    domain: '',
    execSearchCategory: '',
    execSearchStatus: 'unknown',
    perplexityResearchNotes: '',
    firmNiche: '',
    executiveName: '',
    executiveRole: '',
    executiveLinkedIn: '',
    email: '',
    emailTemplate: '',
    sourceFile,
    rawRowJson: JSON.stringify(rawRow ?? {}),
    importBatchId: '',
    createdAt: ts,
    updatedAt: ts,
  };
}

// Dedup keys
export function executiveKey(r: RecordRow): string {
  if (r.email) return `email:${r.email.toLowerCase()}`;
  if (r.executiveLinkedIn) return `li:${r.executiveLinkedIn.toLowerCase()}`;
  if (r.executiveName && r.domain) return `name_domain:${r.executiveName.toLowerCase()}|${r.domain.toLowerCase()}`;
  return '';
}

export function companyKey(r: RecordRow): string {
  if (r.domain) return `domain:${r.domain.toLowerCase()}`;
  if (r.companyName) return `name:${r.companyName.toLowerCase()}`;
  return '';
}
