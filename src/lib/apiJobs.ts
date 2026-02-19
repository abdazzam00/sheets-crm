import { z } from 'zod';

export async function enqueueJobs(body: {
  action: 'enrich_all' | 'verify_all';
  filter?: {
    ids?: string[];
    importBatchId?: string;
    hasDomain?: boolean;
    missingResearchNotes?: boolean;
    missingExecSearchStatus?: boolean;
  };
}) {
  const res = await fetch('/api/jobs/enqueue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? 'Request failed');
  return z
    .object({ ok: z.boolean(), enqueued: z.number(), skippedCached: z.number(), totalMatched: z.number() })
    .passthrough()
    .parse(json);
}
