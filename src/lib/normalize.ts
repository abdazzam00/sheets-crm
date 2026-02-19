import { randomUUID } from 'crypto';
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
    id: randomUUID(),
    companyName: '',
    domain: '',
    execSearchCategory: '',
    perplexityResearchNotes: '',
    firmNiche: '',
    executiveName: '',
    executiveRole: '',
    executiveLinkedIn: '',
    email: '',
    sourceFile,
    rawRowJson: JSON.stringify(rawRow ?? {}),
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
