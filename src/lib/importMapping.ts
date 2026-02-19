import { z } from 'zod';
import { openaiChatJson } from '@/lib/ai';

export type MappingKeys =
  | 'companyName'
  | 'domain'
  | 'execSearchCategory'
  | 'execSearchStatus'
  | 'perplexityResearchNotes'
  | 'firmNiche'
  | 'executiveFirstName'
  | 'executiveLastName'
  | 'executiveName'
  | 'executiveRole'
  | 'executiveLinkedIn'
  | 'email'
  | 'emailTemplate';

export type Mapping = Partial<Record<MappingKeys, string>>;

function norm(s: string) {
  return (s ?? '').trim().toLowerCase();
}

function scoreHeader(header: string, patterns: Array<{ re: RegExp; score: number }>) {
  const h = norm(header);
  let score = 0;
  for (const p of patterns) {
    if (p.re.test(h)) score += p.score;
  }
  // Prefer shorter, more specific headers when tied.
  score -= Math.max(0, h.length - 25) * 0.05;
  return score;
}

function best(headers: string[], patterns: Array<{ re: RegExp; score: number }>, minScore = 1) {
  let bestH = '';
  let bestS = -Infinity;
  for (const h of headers) {
    const s = scoreHeader(h, patterns);
    if (s > bestS) {
      bestS = s;
      bestH = h;
    }
  }
  return bestS >= minScore ? bestH : '';
}

function uniq(headers: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of headers) {
    const k = norm(h);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

function fillIfEmpty(m: Mapping, key: MappingKeys, header: string) {
  if (!header) return;
  if (!m[key]) m[key] = header;
}

export function guessMappingHeuristics(headersIn: string[]): Mapping {
  const headers = uniq(headersIn).filter((h) => h.trim().length > 0);
  const m: Mapping = {};

  // Company
  fillIfEmpty(
    m,
    'companyName',
    best(headers, [
      { re: /^(company|company name|organization|organisation|account)$/, score: 8 },
      { re: /company.*name/, score: 7 },
      { re: /(account|organization).*name/, score: 5 },
      { re: /employer|business/, score: 2 },
    ])
  );

  // Website / domain
  fillIfEmpty(
    m,
    'domain',
    best(headers, [
      { re: /^(domain|website|website url|company website|site|url)$/, score: 8 },
      { re: /website.*url/, score: 7 },
      { re: /company.*website/, score: 7 },
      { re: /domain/, score: 6 },
      { re: /web.?site|homepage/, score: 3 },
      { re: /(linkedin).*company/, score: -5 },
    ])
  );

  // Executive name fields
  fillIfEmpty(m, 'executiveFirstName', best(headers, [{ re: /^(first name|firstname|given name)$/, score: 8 }]));
  fillIfEmpty(m, 'executiveLastName', best(headers, [{ re: /^(last name|lastname|surname|family name)$/, score: 8 }]));
  fillIfEmpty(
    m,
    'executiveName',
    best(headers, [
      { re: /^(full name|name)$/, score: 8 },
      { re: /contact.*name/, score: 6 },
      { re: /executive.*name/, score: 7 },
      { re: /person.*name/, score: 5 },
      { re: /prospect.*name/, score: 4 },
    ])
  );

  // Role / title
  fillIfEmpty(
    m,
    'executiveRole',
    best(headers, [
      { re: /^(title|job title|position|role)$/, score: 8 },
      { re: /executive.*title/, score: 6 },
      { re: /job.*title/, score: 6 },
    ])
  );

  // LinkedIn
  fillIfEmpty(
    m,
    'executiveLinkedIn',
    best(headers, [
      { re: /(person|contact|executive).*linkedin.*(url|profile)/, score: 9 },
      { re: /^person linkedin url$/, score: 10 },
      { re: /linkedin.*(url|profile)/, score: 7 },
      { re: /linkedin$/, score: 5 },
    ])
  );

  // Email
  fillIfEmpty(
    m,
    'email',
    best(headers, [
      { re: /^(email|email address|work email|business email)$/, score: 10 },
      { re: /email/, score: 7 },
      { re: /e-mail/, score: 7 },
      { re: /status/, score: -6 },
      { re: /verified/, score: -3 },
    ])
  );

  // Template / notes
  fillIfEmpty(
    m,
    'emailTemplate',
    best(headers, [
      { re: /^email template$/, score: 10 },
      { re: /email.*template/, score: 8 },
      { re: /template/, score: 4 },
    ])
  );

  fillIfEmpty(
    m,
    'perplexityResearchNotes',
    best(headers, [
      { re: /^(perplexity research notes|research notes|notes)$/, score: 10 },
      { re: /perplexity/, score: 8 },
      { re: /research/, score: 6 },
      { re: /notes?/, score: 5 },
    ])
  );

  fillIfEmpty(m, 'firmNiche', best(headers, [{ re: /^firm niche$/, score: 10 }, { re: /niche/, score: 6 }, { re: /tags?/, score: 3 }]));

  fillIfEmpty(
    m,
    'execSearchCategory',
    best(headers, [
      { re: /exec.*search.*category/, score: 10 },
      { re: /category/, score: 5 },
      { re: /segment/, score: 4 },
    ])
  );

  fillIfEmpty(
    m,
    'execSearchStatus',
    best(headers, [
      { re: /^exec search\?$/, score: 10 },
      { re: /exec.*search/, score: 7 },
      { re: /search\?/, score: 2 },
    ])
  );

  return m;
}

const AiSchema = z.object({
  mapping: z.record(z.string(), z.string()).default({}),
});

function stableCacheKey(headers: string[]) {
  const s = headers.map((h) => norm(h)).join('|');
  // simple djb2
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = (hash * 33) ^ s.charCodeAt(i);
  return `map:v1:${(hash >>> 0).toString(16)}`;
}

function headerLooksLikeEmail(h: string) {
  return /email|e-mail/.test(norm(h));
}

function headerLooksLikeDomain(h: string) {
  return /domain|website|site|url|web/.test(norm(h)) && !/linkedin/.test(norm(h));
}

function headerLooksLikeLinkedIn(h: string) {
  const n = norm(h);
  return n.includes('linkedin');
}

export async function guessMappingAuto(headers: string[]): Promise<{ mapping: Mapping; usedAi: boolean }> {
  const heur = guessMappingHeuristics(headers);

  // If heuristics already found the key fields, skip AI.
  const required: MappingKeys[] = ['companyName', 'domain', 'executiveName', 'executiveRole', 'email', 'executiveLinkedIn'];
  const missing = required.filter((k) => !heur[k]);

  const cacheKey = stableCacheKey(headers);
  try {
    const cached = globalThis.localStorage?.getItem(cacheKey);
    if (cached) return { mapping: { ...heur, ...(JSON.parse(cached) as Mapping) }, usedAi: true };
  } catch {
    // ignore
  }

  const allowAi = (process.env.NEXT_PUBLIC_ENABLE_AI_MAPPING ?? '1') !== '0';
  if (!allowAi || missing.length === 0) return { mapping: heur, usedAi: false };

  // AI fallback (best-effort). Never throw: if it fails, just return heuristics.
  try {
    const prompt = `You are mapping CSV headers to a CRM schema.\n\nGiven these headers:\n${headers
      .map((h) => `- ${h}`)
      .join('\n')}\n\nReturn JSON with shape { mapping: { <fieldKey>: <headerExactlyAsGiven> } }.\n\nValid fieldKeys:\ncompanyName, domain, executiveFirstName, executiveLastName, executiveName, executiveRole, executiveLinkedIn, email, emailTemplate, execSearchCategory, execSearchStatus, perplexityResearchNotes, firmNiche\n\nRules:\n- Only use header values exactly as given (case-sensitive).\n- Map Website URL / Domain fields to domain.\n- Map Company Name / Organization / Account name to companyName.\n- Map Executive names (including CEO/CFO/President names) to executiveName if no split columns exist.\n- Map Top Executive Email / Work Email to email.\n- If there are multiple candidate headers, pick the best single one for each fieldKey.\n- It's okay to omit fieldKeys you can't map confidently.`;

    const ai = await openaiChatJson({
      messages: [
        { role: 'system', content: 'Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      schema: AiSchema,
      temperature: 0,
    });

    const picked: Mapping = {};
    for (const [k, v] of Object.entries(ai.mapping ?? {})) {
      if (typeof v !== 'string') continue;
      if (!headers.includes(v)) continue;
      if (
        (
          [
            'companyName',
            'domain',
            'execSearchCategory',
            'execSearchStatus',
            'perplexityResearchNotes',
            'firmNiche',
            'executiveFirstName',
            'executiveLastName',
            'executiveName',
            'executiveRole',
            'executiveLinkedIn',
            'email',
            'emailTemplate',
          ] as string[]
        ).includes(k)
      ) {
        // guardrails
        if (k === 'email' && !headerLooksLikeEmail(v)) continue;
        if (k === 'domain' && !headerLooksLikeDomain(v)) continue;
        if (k === 'executiveLinkedIn' && !headerLooksLikeLinkedIn(v)) continue;
        (picked as Mapping)[k as MappingKeys] = v;
      }
    }

    try {
      globalThis.localStorage?.setItem(cacheKey, JSON.stringify(picked));
    } catch {
      // ignore
    }

    return { mapping: { ...heur, ...picked }, usedAi: true };
  } catch {
    return { mapping: heur, usedAi: false };
  }
}
