import { clean, extractDomainFromEmail, normalizeDomain, isValidDomainLike } from '@/lib/normalize';

export type ImportRow = {
  companyName?: string;
  domain?: string;
  website?: string;
  executiveName?: string;
  executiveRole?: string;
  executiveLinkedIn?: string;
  email?: string;
  perplexityResearchNotes?: string;
  firmNiche?: string;
  execSearchCategory?: string;
  execSearchStatus?: 'unknown' | 'yes' | 'no';
  emailTemplate?: string;
};

const BAD_HEADER_SYNONYMS: Array<[keyof ImportRow, RegExp[]]> = [
  ['companyName', [/^company name$/i, /^company$/i, /^organization$/i, /^account$/i]],
  ['website', [/^website url$/i, /^website$/i, /^site$/i, /^url$/i]],
  ['executiveName', [/^executive names?$/i, /^top executive$/i, /^contact name$/i, /^name$/i]],
  ['email', [/^top executive email$/i, /^work email$/i, /^email( address)?$/i]],
];

export function cleanupImportedRow(row: ImportRow): { cleaned: ImportRow; warnings: string[] } {
  const warnings: string[] = [];
  const r: ImportRow = { ...row };

  // Trim strings
  for (const k of Object.keys(r) as (keyof ImportRow)[]) {
    const v = r[k];
    if (typeof v === 'string') {
      if (k === 'execSearchStatus') {
        const vv = clean(v).toLowerCase();
        r.execSearchStatus = vv === 'yes' ? 'yes' : vv === 'no' ? 'no' : 'unknown';
      } else {
        r[k] = clean(v);
      }
    }
  }

  // Common misplacements:
  // - companyName accidentally contains a URL
  // - domain field contains company name text
  // - executiveName contains email
  // - email contains name
  const looksLikeUrl = (s: string) => /https?:\/\//i.test(s) || /\bwww\./i.test(s);
  const looksLikeEmail = (s: string) => /[^\s@]+@[^\s@]+\.[^\s@]+/.test(s);

  // If companyName is a URL, move to website
  if (r.companyName && looksLikeUrl(r.companyName) && !r.website) {
    r.website = r.companyName;
    r.companyName = '';
    warnings.push('Moved companyName (looked like URL) → website');
  }

  // If domain is not a valid domain but looks like a company name, keep as companyName if missing
  if (r.domain) {
    const nd = normalizeDomain(r.domain);
    if (nd && isValidDomainLike(nd)) {
      r.domain = nd;
    } else {
      // domain might be company name
      if (!r.companyName && !looksLikeUrl(r.domain) && !looksLikeEmail(r.domain) && r.domain.length > 2) {
        r.companyName = r.domain;
        warnings.push('Moved domain (not domain-like) → companyName');
      }
      r.domain = '';
    }
  }

  // If executiveName contains an email, move to email
  if (r.executiveName && looksLikeEmail(r.executiveName) && !r.email) {
    r.email = r.executiveName;
    r.executiveName = '';
    warnings.push('Moved executiveName (looked like email) → email');
  }

  // If email contains spaces and no @, it might be a name
  if (r.email && !looksLikeEmail(r.email) && !r.executiveName && r.email.split(/\s+/).length >= 2) {
    r.executiveName = r.email;
    r.email = '';
    warnings.push('Moved email (looked like name) → executiveName');
  }

  // Normalize email + derive domain if missing
  if (r.email) {
    r.email = clean(r.email).toLowerCase();
  }

  if (!r.domain) {
    const fromWebsite = normalizeDomain(r.website ?? '');
    if (fromWebsite && isValidDomainLike(fromWebsite)) r.domain = fromWebsite;
  }

  if (!r.domain && r.email) {
    const fromEmail = normalizeDomain(extractDomainFromEmail(r.email));
    if (fromEmail && isValidDomainLike(fromEmail)) r.domain = fromEmail;
  }

  // If website exists, normalize it to a domain-ish string too
  if (r.website) {
    const nd = normalizeDomain(r.website);
    r.website = nd;
  }

  return { cleaned: r, warnings };
}

export function guessFieldFromHeader(header: string): keyof ImportRow | null {
  const h = clean(header);
  if (!h) return null;
  for (const [key, res] of BAD_HEADER_SYNONYMS) {
    if (res.some((re) => re.test(h))) return key;
  }
  return null;
}
