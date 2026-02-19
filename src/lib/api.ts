import type { RecordRow } from '@/lib/schema';

export async function fetchRecords(): Promise<RecordRow[]> {
  const res = await fetch('/api/records', { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.records as RecordRow[];
}

export async function importRecords(rows: Partial<RecordRow>[]) {
  const res = await fetch('/api/records/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Import failed');
  return json as {
    created: number;
    updated: number;
    dedupCounts: Record<string, number>;
    records: RecordRow[];
    batchId: string;
  };
}

export async function deleteRecords(ids: string[]) {
  const res = await fetch('/api/records/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Delete failed');
  return json as { deleted: number };
}

export async function undoLatestImport() {
  const res = await fetch('/api/records/undo-latest-import', { method: 'POST' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Undo failed');
  return json as { ok: true; deleted: number; batchId?: string };
}

export async function exportRecords(payload: {
  format: 'csv' | 'tsv';
  filter: { execSearchStatus: 'any' | 'unknown' | 'yes' | 'no'; hasEmail: boolean; q: string; limit: number };
}) {
  const res = await fetch('/api/records/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text;
}

export async function verifyExecSearch(id: string) {
  const res = await fetch('/api/records/ai/verify-exec-search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Verify failed');
  return json as { record: RecordRow; ai: { status: 'unknown' | 'yes' | 'no'; reason: string } };
}

export async function perplexityResearch(id: string) {
  const res = await fetch('/api/records/ai/perplexity-research', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Research failed');
  return json as { record: RecordRow; research: string };
}

export async function inferDomain(id: string) {
  const res = await fetch('/api/records/ai/infer-domain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Infer domain failed');
  return json as { record: RecordRow; ai: { domain: string; reason: string }; cached: boolean };
}

export async function generateFirmNiche(id: string) {
  const res = await fetch('/api/records/ai/generate-firm-niche', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Firm niche failed');
  return json as { record: RecordRow; ai: { firmNiche: string; reason: string }; cached: boolean };
}

export async function draftEmailTemplate(id: string) {
  const res = await fetch('/api/records/ai/draft-email-template', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Email template failed');
  return json as { record: RecordRow; ai: { emailTemplate: string }; cached: boolean };
}

export async function perplexityCategorize(id: string) {
  const res = await fetch('/api/records/ai/perplexity-categorize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Categorize failed');
  return json as { category: string; text: string; cached: boolean };
}

export async function perplexityDeepNotes(id: string) {
  const res = await fetch('/api/records/ai/perplexity-deep-notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Deep notes failed');
  return json as { record: RecordRow; research: string; cached: boolean };
}

export async function perplexityFindExecutives(id: string) {
  const res = await fetch('/api/records/ai/perplexity-executives', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Executives failed');
  return json as { executives: string; cached: boolean };
}

export async function fetchSnippets() {
  const res = await fetch('/api/snippets', { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Snippets fetch failed');
  return json as { snippets: Array<{ key: string; value: string; updatedAt: string }> };
}

export async function upsertSnippet(key: string, value: string) {
  const res = await fetch('/api/snippets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Snippet save failed');
  return json as { snippet: { key: string; value: string; updatedAt: string } };
}

export async function deleteSnippet(key: string) {
  const res = await fetch('/api/snippets', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Snippet delete failed');
  return json as { ok: true };
}

export async function patchRecord(id: string, patch: Partial<RecordRow>) {
  const res = await fetch(`/api/records/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Update failed');
  return json.record as RecordRow;
}

export async function aiImportMap(payload: { headers: string[]; fileSignature: string }) {
  const res = await fetch('/api/import/map', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'AI mapping failed');
  return json as { mapping: Record<string, string>; confidence: number; cached: boolean };
}
