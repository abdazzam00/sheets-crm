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
  return json as { created: number; updated: number; dedupCounts: Record<string, number>; records: RecordRow[] };
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
