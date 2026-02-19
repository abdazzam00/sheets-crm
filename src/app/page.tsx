'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCSV } from '@/lib/csv';
import { SHEET_COLUMNS, type RecordRow } from '@/lib/schema';
import {
  clean,
  extractDomainFromEmail,
  guessCompanyFromDomain,
  makeEmptyRow,
  normalizeLinkedIn,
  normalizeDomain,
  isValidDomainLike,
} from '@/lib/normalize';
import { fetchRecords, importRecords, patchRecord } from '@/lib/api';

type Mapping = {
  companyName?: string;
  domain?: string;
  execSearchCategory?: string;
  perplexityResearchNotes?: string;
  firmNiche?: string;
  executiveFirstName?: string;
  executiveLastName?: string;
  executiveName?: string;
  executiveRole?: string;
  executiveLinkedIn?: string;
  email?: string;
};

function guessMapping(headers: string[]): Mapping {
  const h = headers.map((x) => x.toLowerCase());
  const pick = (pred: (s: string) => boolean) => headers[h.findIndex(pred)] ?? '';
  const pickExact = (name: string) => headers[h.findIndex((s) => s.trim() === name.toLowerCase())] ?? '';

  return {
    companyName:
      pickExact('Company Name') ||
      pick((s) => s.includes('company') && s.includes('name')) ||
      pick((s) => s === 'company') ||
      pick((s) => s === 'organization') ||
      '',
    domain:
      pickExact('Website') ||
      pickExact('Domain') ||
      pick((s) => s.includes('domain')) ||
      pick((s) => s.includes('website')) ||
      pick((s) => s.includes('company website')) ||
      '',
    executiveFirstName: pickExact('First Name') || '',
    executiveLastName: pickExact('Last Name') || '',
    executiveName:
      pickExact('Full Name') ||
      pick((s) => (s.includes('full') && s.includes('name')) || s === 'name') ||
      pick((s) => s.includes('contact') && s.includes('name')) ||
      pick((s) => s.includes('person') && s.includes('name')) ||
      '',
    executiveRole:
      pickExact('Title') ||
      pick((s) => s.includes('title')) ||
      pick((s) => s.includes('role')) ||
      pick((s) => s.includes('position')) ||
      '',
    executiveLinkedIn:
      pickExact('Person Linkedin Url') ||
      pick((s) => s.includes('linkedin') && (s.includes('profile') || s.includes('url'))) ||
      pick((s) => s === 'linkedin') ||
      '',
    email:
      pickExact('Email') ||
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

function getVal(row: Record<string, string>, header?: string) {
  if (!header) return '';
  const direct = row[header];
  if (direct !== undefined) return direct;
  const key = Object.keys(row).find((k) => k.trim().toLowerCase() === header.trim().toLowerCase());
  return key ? row[key] : '';
}

function buildRow(row: Record<string, string>, mapping: Mapping, sourceFile: string): RecordRow {
  const r = makeEmptyRow(sourceFile, row);
  r.companyName = clean(getVal(row, mapping.companyName));
  r.domain = normalizeDomain(getVal(row, mapping.domain));
  r.execSearchCategory = clean(getVal(row, mapping.execSearchCategory));
  r.perplexityResearchNotes = clean(getVal(row, mapping.perplexityResearchNotes));
  r.firmNiche = clean(getVal(row, mapping.firmNiche));

  const first = clean(getVal(row, mapping.executiveFirstName));
  const last = clean(getVal(row, mapping.executiveLastName));
  const full = clean(getVal(row, mapping.executiveName));
  r.executiveName = clean([first, last].filter(Boolean).join(' ')) || full;

  r.executiveRole = clean(getVal(row, mapping.executiveRole));
  r.executiveLinkedIn = normalizeLinkedIn(clean(getVal(row, mapping.executiveLinkedIn)));
  r.email = clean(getVal(row, mapping.email));

  // Derive domain from email if needed
  if (!r.domain && r.email) {
    r.domain = normalizeDomain(extractDomainFromEmail(r.email));
  }

  // If the mapped "domain" column contains non-domain text (common with messy CSVs),
  // don't fail the import; just drop it and rely on email/AI to fill later.
  if (r.domain && !isValidDomainLike(r.domain)) {
    const bad = r.domain;
    r.domain = '';
    r.perplexityResearchNotes = [
      r.perplexityResearchNotes,
      `Domain dropped (didn't look like a domain/url): ${bad}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  // If we have domain but not company name, make a weak guess (user can edit later)
  if (!r.companyName && r.domain) {
    r.companyName = guessCompanyFromDomain(r.domain);
  }

  return r;
}

function asHrefDomain(domain: string) {
  const d = normalizeDomain(domain);
  if (!d) return '';
  return `https://${d}`;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

type EditorProps = {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  linkHref?: string;
  onExpand?: () => void;
  invalid?: boolean;
};

function CellEditor({ value, onChange, multiline, linkHref, onExpand, invalid }: EditorProps) {
  if (linkHref) {
    return (
      <a
        href={linkHref}
        target="_blank"
        rel="noreferrer"
        className={classNames('underline', invalid && 'text-red-600')}
      >
        {value}
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={classNames(
          'w-full rounded border px-2 py-1 text-xs',
          invalid && 'border-red-500 bg-red-50'
        )}
      />
      {multiline && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="rounded border px-2 py-1 text-[10px]"
        >
          Expand
        </button>
      )}
    </div>
  );
}

function Modal({
  open,
  title,
  value,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-medium text-sm">{title}</div>
          <button className="rounded border px-2 py-1 text-xs" onClick={onClose}>
            Close
          </button>
        </div>
        <textarea
          className="h-64 w-full rounded border p-2 text-xs font-mono"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button className="rounded border px-3 py-2 text-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded bg-black px-3 py-2 text-xs text-white"
            onClick={() => {
              onSave(local);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [sourceFile, setSourceFile] = useState('upload.csv');
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});

  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [importing, setImporting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalRecordId, setModalRecordId] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState<keyof RecordRow>('perplexityResearchNotes');

  const canImport = headers.length > 0 && rows.length > 0;
  const headerOptions = useMemo(() => [''].concat(headers), [headers]);

  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  async function refresh() {
    const recs = await fetchRecords();
    setRecords(recs);
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } finally {
        setLoadingDb(false);
      }
    })();
  }, []);

  function onParse() {
    const parsed = parseCSV(csvText);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(guessMapping(parsed.headers));
  }

  async function onImport() {
    try {
      setImporting(true);
      const built = rows.map((r) => buildRow(r, mapping, sourceFile));
      const payload = built.map((r) => ({
        companyName: r.companyName,
        domain: r.domain,
        execSearchCategory: r.execSearchCategory,
        perplexityResearchNotes: r.perplexityResearchNotes,
        firmNiche: r.firmNiche,
        executiveName: r.executiveName,
        executiveRole: r.executiveRole,
        executiveLinkedIn: r.executiveLinkedIn,
        email: r.email,
        sourceFile,
        rawRowJson: r.rawRowJson,
      }));

      const res = await importRecords(payload);
      await refresh();
      alert(`Import complete. Created ${res.created}, updated ${res.updated}.`);
    } catch (e) {
      console.error(e);
      alert(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  function scheduleSave(id: string, patch: Partial<RecordRow>) {
    const prev = saveTimers.current.get(id);
    if (prev) clearTimeout(prev);
    const t = setTimeout(async () => {
      try {
        // domain validation
        if (patch.domain !== undefined && patch.domain && !isValidDomainLike(patch.domain)) {
          throw new Error('Domain must look like a domain or URL');
        }
        const updated = await patchRecord(id, patch);
        setRecords((rs) => rs.map((r) => (r.id === id ? updated : r)));
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : String(e));
      }
    }, 450);
    saveTimers.current.set(id, t);
  }

  function setCell(id: string, key: keyof RecordRow, value: string) {
    setRecords((rs) =>
      rs.map((r) => (r.id === id ? { ...r, [key]: value, updatedAt: new Date().toISOString() } : r))
    );

    const patch: Partial<RecordRow> & Record<string, string> = { [key]: value };
    if (key === 'domain') patch.domain = normalizeDomain(value);
    if (key === 'executiveLinkedIn') patch.executiveLinkedIn = normalizeLinkedIn(value);
    scheduleSave(id, patch);
  }

  const domainInvalidIds = useMemo(() => {
    const bad = new Set<string>();
    for (const r of records) {
      if (r.domain && !isValidDomainLike(r.domain)) bad.add(r.id);
    }
    return bad;
  }, [records]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Sheets CRM</h1>
          <p className="text-sm text-zinc-600">
            Postgres-backed CRM table. Import CSVs (append + dedupe/merge) and edit inline (autosaves).
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
              <button onClick={onParse} className="rounded-md bg-black px-3 py-2 text-sm text-white">
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
            <p className="mb-3 text-xs text-zinc-600">Auto-guessed mapping — adjust if needed.</p>

            <div className="grid grid-cols-1 gap-3 text-sm">
              {(
                [
                  ['Company Name', 'companyName'],
                  ['Website/Domain', 'domain'],
                  ['Executive First Name', 'executiveFirstName'],
                  ['Executive Last Name', 'executiveLastName'],
                  ['Executive Name (fallback)', 'executiveName'],
                  ['Title', 'executiveRole'],
                  ['Person Linkedin Url', 'executiveLinkedIn'],
                  ['Email', 'email'],
                  ['Firm Niche', 'firmNiche'],
                  ['Exec Search Category', 'execSearchCategory'],
                  ['Perplexity Research Notes', 'perplexityResearchNotes'],
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
                disabled={!canImport || importing}
                className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                {importing ? 'Importing…' : 'Import → Append + Merge into DB'}
              </button>
            </div>

            <p className="mt-3 text-xs text-zinc-600">
              Dedup/merge keys: Email, Executive LinkedIn, or Domain+Executive Name.
            </p>
          </section>
        </div>

        <section className="mt-6 rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-medium">3) CRM Table (editable)</h2>

          {loadingDb ? (
            <p className="text-sm text-zinc-600">Loading…</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-zinc-600">No records yet. Import a CSV to get started.</p>
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
                  {records.map((r, idx) => (
                    <tr key={r.id} className="odd:bg-zinc-50">
                      <td className="sticky left-0 bg-inherit border-b px-2 py-2">{idx + 1}</td>

                      {SHEET_COLUMNS.map((c) => {
                        const val = String(r[c.key] ?? '');
                        const isLong = c.key === 'perplexityResearchNotes';
                        const isDomain = c.key === 'domain';
                        const isLinkedIn = c.key === 'executiveLinkedIn';

                        const linkHref = isDomain
                          ? asHrefDomain(val)
                          : isLinkedIn
                            ? normalizeLinkedIn(val)
                            : '';

                        const invalid = isDomain && domainInvalidIds.has(r.id);

                        return (
                          <td key={String(c.key)} className="border-b px-2 py-2 whitespace-nowrap min-w-[220px]">
                            {linkHref ? (
                              <CellEditor value={val} onChange={() => {}} linkHref={linkHref} invalid={invalid} />
                            ) : (
                              <CellEditor
                                value={val}
                                onChange={(next) => setCell(r.id, c.key, next)}
                                multiline={isLong}
                                invalid={invalid}
                                onExpand={
                                  isLong
                                    ? () => {
                                        setModalRecordId(r.id);
                                        setModalKey(c.key);
                                        setModalTitle(c.label);
                                        setModalOpen(true);
                                      }
                                    : undefined
                                }
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Modal
          open={modalOpen}
          title={modalTitle}
          value={
            modalRecordId
              ? String(records.find((r) => r.id === modalRecordId)?.[modalKey] ?? '')
              : ''
          }
          onClose={() => setModalOpen(false)}
          onSave={(v) => {
            if (!modalRecordId) return;
            setCell(modalRecordId, modalKey, v);
          }}
        />
      </div>
    </div>
  );
}
