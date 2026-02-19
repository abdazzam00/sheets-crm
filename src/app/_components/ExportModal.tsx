'use client';

import { useState } from 'react';

export default function ExportModal({
  open,
  onClose,
  q,
  setQ,
  hasEmail,
  setHasEmail,
  execSearchStatus,
  setExecSearchStatus,
  format,
  setFormat,
  limit,
  setLimit,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  q: string;
  setQ: (v: string) => void;
  hasEmail: boolean;
  setHasEmail: (v: boolean) => void;
  execSearchStatus: 'any' | 'unknown' | 'yes' | 'no';
  setExecSearchStatus: (v: 'any' | 'unknown' | 'yes' | 'no') => void;
  format: 'csv' | 'tsv';
  setFormat: (v: 'csv' | 'tsv') => void;
  limit: number;
  setLimit: (n: number) => void;
  onExport: () => Promise<string>;
}) {
  const [out, setOut] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-medium text-sm">Export</div>
          <button className="rounded border px-2 py-1 text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 text-sm">
          <div>
            <div className="text-xs text-zinc-600">Search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              placeholder="filter by company/domain/executive/email"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasEmail} onChange={(e) => setHasEmail(e.target.checked)} />
            Only rows with email
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-zinc-600">Exec Search?</div>
              <select
                value={execSearchStatus}
                onChange={(e) => setExecSearchStatus(e.target.value as 'any' | 'unknown' | 'yes' | 'no')}
                className="mt-1 w-full rounded border px-2 py-2 text-sm"
              >
                <option value="any">any</option>
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-zinc-600">Format</div>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'csv' | 'tsv')}
                className="mt-1 w-full rounded border px-2 py-2 text-sm"
              >
                <option value="csv">CSV</option>
                <option value="tsv">TSV (Google Sheets friendly)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-600">Limit</div>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value || '5000', 10))}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              min={1}
              max={20000}
            />
          </div>
        </div>

        {out ? (
          <div className="mt-4">
            <div className="mb-1 text-xs text-zinc-600">Copy/paste into Google Sheets (or download)</div>
            <textarea
              className="h-40 w-full rounded border p-2 text-[11px] font-mono"
              value={out}
              readOnly
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="rounded border px-3 py-2 text-sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(out);
                  alert('Copied to clipboard');
                }}
              >
                Copy to clipboard
              </button>
              <button
                className="rounded border px-3 py-2 text-sm"
                onClick={() => {
                  const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `records.${format}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download file
              </button>
              <button className="rounded border px-3 py-2 text-sm" onClick={() => setOut('')}>
                Clear
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded border px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
            disabled={loading}
            onClick={async () => {
              try {
                setLoading(true);
                const text = await onExport();
                setOut(text);
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
