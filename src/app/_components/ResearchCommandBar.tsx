'use client';

import { useMemo, useState } from 'react';

export type ResearchSuggestion = {
  companyName: string;
  domain: string;
  notes: string;
  sources: string[];
  existing?: boolean;
};

export default function ResearchCommandBar(props: {
  existingDomains: string[];
  onAdded?: (res: { added: number; skippedExisting: number }) => void;
}) {
  const existingSet = useMemo(() => new Set(props.existingDomains.map((d) => String(d || '').toLowerCase())), [props.existingDomains]);

  const [command, setCommand] = useState('find 25 exec search firms in healthcare');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<{ suggested: number; filteredExisting: number; added?: number } | null>(null);

  const [suggestions, setSuggestions] = useState<ResearchSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectedSuggestions = useMemo(() => {
    const sel = selected;
    return suggestions.filter((s) => sel.has(s.domain));
  }, [suggestions, selected]);

  function toggle(domain: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(domain)) n.delete(domain);
      else n.add(domain);
      return n;
    });
  }

  async function runSuggest() {
    try {
      setError(null);
      setLoading(true);
      setTelemetry(null);
      setSuggestions([]);
      setSelected(new Set());

      const res = await fetch('/api/research/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Suggest failed');

      const suggs = (json.suggestions ?? []) as ResearchSuggestion[];
      // Client-side safety mark for existing domains, but server also filters in add.
      for (const s of suggs) {
        s.existing = existingSet.has(String(s.domain || '').toLowerCase());
      }

      setSuggestions(suggs);
      setTelemetry(json.telemetry ?? null);

      // preselect non-existing
      setSelected(new Set(suggs.filter((s) => !s.existing).map((s) => s.domain)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function add(domains: string[] | 'allSelected') {
    try {
      setError(null);
      setAdding(true);

      const payload = {
        command,
        suggestions,
        domains: domains === 'allSelected' ? Array.from(selected) : domains,
      };

      const res = await fetch('/api/research/add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Add failed');

      setTelemetry(json.telemetry ?? null);
      props.onAdded?.({ added: json.telemetry?.added ?? 0, skippedExisting: json.telemetry?.filteredExisting ?? 0 });

      // Remove added from list
      const addedDomains = new Set((json.addedDomains ?? []) as string[]);
      setSuggestions((prev) => prev.filter((s) => !addedDomains.has(s.domain)));
      setSelected((prev) => {
        const n = new Set(prev);
        for (const d of addedDomains) n.delete(d);
        return n;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">Research Chat</h2>
          <p className="text-xs text-zinc-600">Perplexity-powered firm discovery → add firm-only rows (no exec) and auto-enqueue enrich jobs.</p>
        </div>
        {telemetry && (
          <div className="text-[11px] text-zinc-600">
            suggested: {telemetry.suggested} · filteredExisting: {telemetry.filteredExisting}
            {typeof telemetry.added === 'number' ? ` · added: ${telemetry.added}` : ''}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="find 25 exec search firms in healthcare"
        />
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
            onClick={runSuggest}
            disabled={loading || !command.trim()}
          >
            {loading ? 'Searching…' : 'Find firms'}
          </button>
          <button
            className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-40"
            disabled={adding || selectedSuggestions.length === 0}
            onClick={() => add('allSelected')}
          >
            {adding ? 'Adding…' : `Add Selected (${selectedSuggestions.length})`}
          </button>
          <button
            className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-40"
            disabled={adding || suggestions.filter((s) => !s.existing).length === 0}
            onClick={() => add(suggestions.filter((s) => !s.existing).map((s) => s.domain))}
          >
            {adding ? 'Adding…' : `Add All (${suggestions.filter((s) => !s.existing).length})`}
          </button>
        </div>

        {error && <div className="text-xs text-red-600">{error}</div>}

        {suggestions.length > 0 && (
          <div className="mt-2 overflow-auto rounded border">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-zinc-50">
                  <th className="px-2 py-2 text-left">Sel</th>
                  <th className="px-2 py-2 text-left">Company</th>
                  <th className="px-2 py-2 text-left">Domain</th>
                  <th className="px-2 py-2 text-left">Notes</th>
                  <th className="px-2 py-2 text-left">Sources</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => {
                  const isSel = selected.has(s.domain);
                  return (
                    <tr key={s.domain} className={s.existing ? 'opacity-50' : ''}>
                      <td className="border-t px-2 py-2">
                        <input
                          type="checkbox"
                          disabled={!!s.existing}
                          checked={isSel}
                          onChange={() => toggle(s.domain)}
                        />
                      </td>
                      <td className="border-t px-2 py-2 whitespace-nowrap">{s.companyName}</td>
                      <td className="border-t px-2 py-2 whitespace-nowrap">
                        <a className="underline" href={`https://${s.domain}`} target="_blank" rel="noreferrer">
                          {s.domain}
                        </a>
                        {s.existing && <span className="ml-2 text-[10px] text-zinc-500">(exists)</span>}
                      </td>
                      <td className="border-t px-2 py-2 min-w-[320px] whitespace-pre-wrap">{s.notes}</td>
                      <td className="border-t px-2 py-2 min-w-[280px]">
                        <ul className="list-disc pl-4">
                          {(s.sources ?? []).slice(0, 5).map((u) => (
                            <li key={u} className="truncate">
                              <a className="underline" href={u} target="_blank" rel="noreferrer">
                                {u}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
