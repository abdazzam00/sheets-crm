import { z } from 'zod';
import { NextResponse } from 'next/server';
import { perplexitySearch, openaiChatJson } from '@/lib/ai';
import { getPool } from '@/lib/db';
import { normalizeDomain } from '@/lib/normalize';

const BodySchema = z.object({
  command: z.string().min(1),
});

const SuggestionSchema = z.object({
  companyName: z.string().default(''),
  domain: z.string().default(''),
  notes: z.string().default(''),
  sources: z.array(z.string()).default([]),
});

const OutputSchema = z.object({
  suggestions: z.array(SuggestionSchema),
});

function uniqByDomain(xs: Array<z.infer<typeof SuggestionSchema>>) {
  const seen = new Set<string>();
  const out: Array<z.infer<typeof SuggestionSchema>> = [];
  for (const x of xs) {
    const d = normalizeDomain(x.domain);
    if (!d) continue;
    const key = d.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...x, domain: d });
  }
  return out;
}

async function existingDomains(domains: string[]) {
  const pool = getPool();
  const ds = domains.map((d) => d.toLowerCase());
  if (ds.length === 0) return new Set<string>();

  const res = await pool.query(
    `select lower(domain) as domain from companies where deleted_at is null and lower(domain) = any($1)`,
    [ds]
  );
  return new Set<string>(res.rows.map((r) => String(r.domain)));
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    // 1) Use Perplexity for web-powered discovery.
    const prompt = `Return a list of firms for this query: ${body.command}\n\nFor each firm include: companyName, domain, notes, sources (URLs). Provide as compact JSON if possible.`;
    const pr = await perplexitySearch({ query: prompt });

    // 2) Convert to strict JSON via OpenAI (robust parsing).
    const json = await openaiChatJson({
      messages: [
        {
          role: 'system',
          content:
            'Extract structured firm suggestions from the given text. Output ONLY JSON with shape { suggestions: [{ companyName, domain, notes, sources }] }. Domains must be bare domains like "example.com".',
        },
        { role: 'user', content: pr.text },
      ],
      schema: OutputSchema,
      temperature: 0,
    });

    const suggestions = uniqByDomain(json.suggestions);

    const exists = await existingDomains(suggestions.map((s) => s.domain));
    let filteredExisting = 0;
    const withFlags = suggestions.map((s) => {
      const ex = exists.has(s.domain.toLowerCase());
      if (ex) filteredExisting += 1;
      return { ...s, existing: ex };
    });

    return NextResponse.json({
      suggestions: withFlags,
      telemetry: {
        suggested: withFlags.length,
        filteredExisting,
      },
      raw: undefined,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
