'use client';

import { useEffect, useMemo, useState } from 'react';

type Dup = {
  domain: string;
  companyIds: string[];
  recordIds: string[];
  companyCount: number;
  recordCount: number;
};

export default function DedupePage() {
  const [token, setToken] = useState('');
  const [limit, setLimit] = useState(200);
  const [dups, setDups] = useState<Dup[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>('');

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h['x-maintenance-token'] = token;
    return h;
  }, [token]);

  async function refresh() {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch(`/api/maintenance/dedupe?limit=${encodeURIComponent(String(limit))}`, {
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed');
      setDups(json.duplicates ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function act(domain: string, apply: boolean) {
    setMsg('');
    try {
      const res = await fetch('/api/maintenance/dedupe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ domain, apply }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed');
      setMsg(`${apply ? 'Merged' : 'Dry-run'}: ${domain} → canonical ${json.result?.canonicalCompanyId}`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    // no auto-refresh; requires token
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Maintenance: Firm dedupe (by domain)</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Requires <code>MAINTENANCE_TOKEN</code> on the server. Provide the same token here (sent in{' '}
        <code>x-maintenance-token</code>).
      </p>

      <div className="mt-4 grid gap-3 rounded border bg-white p-4">
        <label className="text-sm">Maintenance token</label>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
          placeholder="paste token"
        />

        <div className="flex items-center gap-2">
          <label className="text-sm">Limit</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-28 rounded border px-2 py-1 text-sm"
            min={1}
            max={1000}
          />
          <button
            onClick={refresh}
            disabled={!token || loading}
            className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Load duplicates'}
          </button>
        </div>

        {msg && <div className="text-sm text-zinc-700">{msg}</div>}
      </div>

      <div className="mt-6 overflow-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left">Domain</th>
              <th className="px-3 py-2 text-left">Companies</th>
              <th className="px-3 py-2 text-left">Records</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {dups.map((d) => (
              <tr key={d.domain} className="border-b">
                <td className="px-3 py-2 font-mono text-xs">{d.domain}</td>
                <td className="px-3 py-2">{d.companyCount}</td>
                <td className="px-3 py-2">{d.recordCount}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => act(d.domain, false)}
                      disabled={!token}
                    >
                      Dry-run
                    </button>
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => {
                        if (!confirm(`Merge duplicates for ${d.domain}?`)) return;
                        act(d.domain, true);
                      }}
                      disabled={!token}
                    >
                      Merge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {dups.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-sm text-zinc-600" colSpan={4}>
                  No duplicates loaded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
