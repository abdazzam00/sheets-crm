'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { deleteSnippet, fetchSnippets, upsertSnippet } from '@/lib/api';

type Snip = { key: string; value: string; updatedAt: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

export default function SnippetsPage() {
  const [snippets, setSnippets] = useState<Snip[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  async function refresh() {
    const res = await fetchSnippets();
    setSnippets(res.snippets);
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Snippets</h1>
            <p className="text-sm text-zinc-600">
              Global key/value blocks you can reference in templates like {'{Claude_research_SaaS}'}.
            </p>
          </div>
          <Link href="/" className="rounded border bg-white px-3 py-2 text-sm">
            ← Back
          </Link>
        </header>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-medium">Add / update snippet</h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
              placeholder="Claude_research_SaaS"
            />
            <textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="h-20 rounded border px-3 py-2 text-sm"
              placeholder="Paste your research snippet here…"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded bg-black px-3 py-2 text-sm text-white"
              onClick={async () => {
                if (!newKey.trim()) return alert('Key required');
                await upsertSnippet(newKey.trim(), newValue);
                setNewKey('');
                setNewValue('');
                await refresh();
              }}
            >
              Save
            </button>
            <button className="rounded border px-3 py-2 text-sm" onClick={refresh}>
              Refresh
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-xl border bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">All snippets</h2>
            {loading ? <div className="text-xs text-zinc-500">Loading…</div> : null}
          </div>
          {snippets.length === 0 ? (
            <p className="text-sm text-zinc-600">No snippets yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {snippets.map((s) => (
                <div key={s.key} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-xs">{s.key}</div>
                    <button
                      className={classNames('rounded border px-2 py-1 text-xs', 'text-red-700')}
                      onClick={async () => {
                        if (!confirm(`Delete snippet ${s.key}?`)) return;
                        await deleteSnippet(s.key);
                        await refresh();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <textarea
                    className="mt-2 h-28 w-full rounded border p-2 text-xs font-mono"
                    value={s.value}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSnippets((xs) => xs.map((x) => (x.key === s.key ? { ...x, value: v } : x)));
                    }}
                    onBlur={async (e) => {
                      await upsertSnippet(s.key, e.target.value);
                      await refresh();
                    }}
                  />
                  <div className="mt-1 text-[10px] text-zinc-500">Updated: {s.updatedAt}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
