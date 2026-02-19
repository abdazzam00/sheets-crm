'use client';

import { useMemo, useState } from 'react';
import { parseCSV, toCSV } from '@/lib/csv';
import { SHEET_COLUMNS, type RecordRow } from '@/lib/schema';
import {
  clean,
  extractDomainFromEmail,
  guessCompanyFromDomain,
  makeEmptyRow,
  normalizeLinkedIn,
  nowIso,
} from '@/lib/normalize';

type Mapping = {
  companyName?: string;
  domain?: string;
  execSearchCategory?: string;
  perplexityResearchNotes?: string;
  firmNiche?: string;
  executiveName?: string;
  executiveRole?: string;
  executiveLinkedIn?: string;
  email?: string;
};

function guessMapping(headers: string[]): Mapping {
  const h = headers.map((x) => x.toLowerCase());
  const pick = (pred: (s: string) => boolean) => headers[h.findIndex(pred)] ?? '';

  return {
    companyName:
      pick((s) => s.includes('company') && s.includes('name')) ||
      pick((s) => s === 'company') ||
      pick((s) => s === 'organization') ||
      '',
    domain:
      pick((s) => s.includes('domain')) ||
      pick((s) => s.includes('website')) ||
      pick((s) => s.includes('company website')) ||
      '',
    executiveName:
      pick((s) => (s.includes('full') && s.includes('name')) || s === 'name') ||
      pick((s) => s.includes('contact') && s.includes('name')) ||
      pick((s) => s.includes('person') && s.includes('name')) ||
      '',
    executiveRole:
      pick((s) => s.includes('title')) ||
      pick((s) => s.includes('role')) ||
      pick((s) => s.includes('position')) ||
      '',
    executiveLinkedIn:
      pick((s) => s.includes('linkedin') && (s.includes('profile') || s.includes('url'))) ||
      pick((s) => s === 'linkedin') ||
      '',
    email:
      pick((s) => s === 'email' || (s.includes('email') && !s.includes('status'))) ||
      pick((s) => s.includes('work email')) ||
      '',
    firmNiche: pick((s) => s.includes('niche')) || pick((s) => s.includes('tags')) || '',
    execSearchCategory:
      pick((s) => s.includes('category')) || pick((s) => s.includes('segment')) || '',
    perplexityResearchNotes:
      pick((s) => s.includes('research')) || pick((s) => s.includes('notes')) || '',
  };
}

function buildRow(row: Record<string, string>, mapping: Mapping, sourceFile: string): RecordRow {
  const r = makeEmptyRow(sourceFile, row);
  r.companyName = clean(mapping.companyName ? row[mapping.companyName] : '');
  r.domain = clean(mapping.domain ? row[mapping.domain] : '');
  r.execSearchCategory = clean(mapping.execSearchCategory ? row[mapping.execSearchCategory] : '');
  r.perplexityResearchNotes = clean(
    mapping.perplexityResearchNotes ? row[mapping.perplexityResearchNotes] : ''
  );
  r.firmNiche = clean(mapping.firmNiche ? row[mapping.firmNiche] : '');
  r.executiveName = clean(mapping.executiveName ? row[mapping.executiveName] : '');
  r.executiveRole = clean(mapping.executiveRole ? row[mapping.executiveRole] : '');
  r.executiveLinkedIn = normalizeLinkedIn(
    clean(mapping.executiveLinkedIn ? row[mapping.executiveLinkedIn] : '')
  );
  r.email = clean(mapping.email ? row[mapping.email] : '');

  // Derive domain from email if needed
  if (!r.domain && r.email) {
    r.domain = extractDomainFromEmail(r.email);
  }

  // If we have domain but not company name, make a weak guess (user can edit later)
  if (!r.companyName && r.domain) {
    r.companyName = guessCompanyFromDomain(r.domain);
  }

  r.updatedAt = nowIso();
  return r;
}

export default function Home() {
  const [sourceFile, setSourceFile] = useState('upload.csv');
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [records, setRecords] = useState<RecordRow[]>([]);

  const canImport = headers.length > 0 && rows.length > 0;

  const headerOptions = useMemo(() => [''].concat(headers), [headers]);

  function onParse() {
    const parsed = parseCSV(csvText);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(guessMapping(parsed.headers));
  }

  function onImport() {
    const next = rows.map((r) => buildRow(r, mapping, sourceFile));
    setRecords(next);
  }

  function onExport() {
    const outHeaders = SHEET_COLUMNS.map((c) => c.label);
    const outRows = records.map((r) => {
      const o: Record<string, string> = {};
      for (const col of SHEET_COLUMNS) {
        o[col.label] = String(r[col.key] ?? '');
      }
      return o;
    });
    const out = toCSV(outHeaders, outRows);
    navigator.clipboard.writeText(out);
    alert('Export CSV copied to clipboard (paste into Google Sheets).');
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Sheets CRM</h1>
          <p className="text-sm text-zinc-600">
            Upload/paste any CSV → auto-map columns → normalize into a clean, Google-Sheets-friendly table.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-2 font-medium">1) Upload or paste CSV</h2>

            <div className="mb-3 grid grid-cols-1 gap-2">
              <label className="text-xs text-zinc-600">Upload CSV file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setSourceFile(f.name);
                  const text = await f.text();
                  setCsvText(text);
                  // auto-parse after upload
                  const parsed = parseCSV(text);
                  setHeaders(parsed.headers);
                  setRows(parsed.rows);
                  setMapping(guessMapping(parsed.headers));
                }}
              />
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2">
              <label className="text-xs text-zinc-600">Source file name (optional override)</label>
              <input
                value={sourceFile}
                onChange={(e) => setSourceFile(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="apollo_export.csv"
              />
            </div>

            <label className="text-xs text-zinc-600">Or paste CSV</label>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="mt-2 h-64 w-full rounded-md border p-3 font-mono text-xs"
              placeholder="Paste CSV here (including header row)"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={onParse}
                className="rounded-md bg-black px-3 py-2 text-sm text-white"
              >
                Parse Pasted CSV
              </button>
            </div>
            {headers.length > 0 && (
              <p className="mt-3 text-xs text-zinc-600">
                Detected {headers.length} columns, {rows.length} rows.
              </p>
            )}
          </section>

          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-2 font-medium">2) Map columns</h2>
            <p className="mb-3 text-xs text-zinc-600">
              Auto-guessed mapping — adjust if needed.
            </p>

            <div className="grid grid-cols-1 gap-3 text-sm">
              {(
                [
                  ['Company Name', 'companyName'],
                  ['Domain', 'domain'],
                  ['Exec Search Category', 'execSearchCategory'],
                  ['Perplexity Research Notes', 'perplexityResearchNotes'],
                  ['Firm Niche', 'firmNiche'],
                  ['Executive Name', 'executiveName'],
                  ['Executive Role', 'executiveRole'],
                  ['Executive LinkedIn', 'executiveLinkedIn'],
                  ['Email', 'email'],
                ] as const
              ).map(([label, key]) => (
                <div key={key} className="grid grid-cols-2 items-center gap-3">
                  <div className="text-xs text-zinc-700">{label}</div>
                  <select
                    value={(mapping as Record<string, string>)[key] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                    className="rounded-md border px-2 py-2 text-xs"
                    disabled={headers.length === 0}
                  >
                    {headerOptions.map((h) => (
                      <option key={h} value={h}>
                        {h || '(none)'}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={onImport}
                disabled={!canImport}
                className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                Import → Build CRM Table
              </button>
              <button
                onClick={onExport}
                disabled={records.length === 0}
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-40"
              >
                Export CSV (copy)
              </button>
            </div>

            <p className="mt-3 text-xs text-zinc-600">
              Import rules: derives Domain from Email when missing; guesses Company Name from Domain when missing.
              Dedup/merge + database storage coming next.
            </p>
          </section>
        </div>

        <section className="mt-6 rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-medium">3) CRM Table Preview</h2>
          {records.length === 0 ? (
            <p className="text-sm text-zinc-600">No records yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white border-b px-2 py-2 text-left">#</th>
                    {SHEET_COLUMNS.map((c) => (
                      <th key={c.key} className="border-b px-2 py-2 text-left whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 200).map((r, idx) => (
                    <tr key={r.id} className="odd:bg-zinc-50">
                      <td className="sticky left-0 bg-inherit border-b px-2 py-2">{idx + 1}</td>
                      {SHEET_COLUMNS.map((c) => (
                        <td key={String(c.key)} className="border-b px-2 py-2 whitespace-nowrap">
                          {String(r[c.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
