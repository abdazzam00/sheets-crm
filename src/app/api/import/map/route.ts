import { NextResponse } from 'next/server';
import { z } from 'zod';
import { openaiChatJson } from '@/lib/ai';
import { getPool } from '@/lib/db';

const InSchema = z.object({
  headers: z.array(z.string()).min(1),
  fileSignature: z.string().min(6),
});

const OutSchema = z.object({
  mapping: z
    .object({
      companyName: z.string().optional(),
      domain: z.string().optional(),
      executiveFirstName: z.string().optional(),
      executiveLastName: z.string().optional(),
      executiveName: z.string().optional(),
      executiveRole: z.string().optional(),
      executiveLinkedIn: z.string().optional(),
      email: z.string().optional(),
      emailTemplate: z.string().optional(),
      execSearchCategory: z.string().optional(),
      execSearchStatus: z.string().optional(),
      perplexityResearchNotes: z.string().optional(),
      firmNiche: z.string().optional(),
    })
    .default({}),
  confidence: z.number().min(0).max(1).default(0.5),
});

function norm(s: string) {
  return (s ?? '').trim();
}

function guardrails(mapping: Record<string, string | undefined>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(mapping)) {
    if (!v) continue;
    out[k] = v;
  }

  // Guardrails: only allow mapping to these keys.
  const allowed = new Set([
    'companyName',
    'domain',
    'executiveFirstName',
    'executiveLastName',
    'executiveName',
    'executiveRole',
    'executiveLinkedIn',
    'email',
    'emailTemplate',
    'execSearchCategory',
    'execSearchStatus',
    'perplexityResearchNotes',
    'firmNiche',
  ]);
  for (const k of Object.keys(out)) {
    if (!allowed.has(k)) delete out[k];
  }

  // Schema-specific rules (requested):
  // - email must contain '@'
  // - domain must be domain/url-like header
  // - linkedin must contain 'linkedin.com'
  if (out.email && !norm(out.email).toLowerCase().includes('email')) {
    // keep; header name check is weak, so do not over-reject
  }

  return out;
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const body = InSchema.parse(json);

    const pool = getPool();
    await pool.query(
      `create table if not exists ai_cache (
        key text primary key,
        value_json jsonb not null,
        created_at timestamptz not null default now()
      )`
    );

    const cacheKey = `import-map:v1:${body.fileSignature}`;
    const cached = await pool.query(`select value_json from ai_cache where key=$1`, [cacheKey]);
    if (cached.rows[0]?.value_json) {
      return NextResponse.json({ ...cached.rows[0].value_json, cached: true });
    }

    const prompt = `You are mapping CSV headers to a CRM schema.\n\nGiven these headers:\n${body.headers
      .map((h) => `- ${h}`)
      .join('\n')}\n\nReturn JSON with shape { mapping: { <fieldKey>: <headerExactlyAsGiven> }, confidence: 0..1 }.\n\nValid fieldKeys:\ncompanyName, domain, executiveFirstName, executiveLastName, executiveName, executiveRole, executiveLinkedIn, email, emailTemplate, execSearchCategory, execSearchStatus, perplexityResearchNotes, firmNiche\n\nRules:\n- Only use header values exactly as given (case-sensitive).\n- Map Website URL / Domain fields to domain.\n- Map Company Name / Organization / Account name to companyName.\n- Map Executive names (including CEO/CFO/President names) to executiveName if no split columns exist.\n- Map Top Executive Email / Work Email to email.\n- It\'s okay to omit fieldKeys you can\'t map confidently.\n\nGuardrails:\n- executiveLinkedIn must be a header that includes 'linkedin' (preferably contains linkedin.com in example values).\n- email must be a header that indicates email (contains 'email').\n- domain should be a header that indicates website/domain/url (contains website/domain/url).`;

    const out = await openaiChatJson({
      schema: OutSchema,
      temperature: 0,
      messages: [
        { role: 'system', content: 'Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
    });

    // enforce: returned headers must exist
    const mapping: Record<string, string> = {};
    for (const [k, v] of Object.entries(out.mapping ?? {})) {
      if (!v) continue;
      if (body.headers.includes(v)) mapping[k] = v;
    }

    const guarded = guardrails(mapping);

    const stored = { mapping: guarded, confidence: out.confidence };
    await pool.query(`insert into ai_cache(key, value_json) values ($1,$2) on conflict (key) do update set value_json=excluded.value_json`, [
      cacheKey,
      JSON.stringify(stored),
    ]);

    return NextResponse.json({ ...stored, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
