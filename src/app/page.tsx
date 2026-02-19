'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCSV } from '@/lib/csv';
import { SHEET_COLUMNS, type RecordRow } from '@/lib/schema';
import type { Mapping } from '@/lib/importMapping';
import { guessMappingHeuristics, guessMappingAuto } from '@/lib/importMapping';
import { sha256Hex } from '@/lib/hash';
import {
  clean,
  extractDomainFromEmail,
  guessCompanyFromDomain,
  makeEmptyRow,
  normalizeLinkedIn,
  normalizeDomain,
  isValidDomainLike,
} from '@/lib/normalize';
import {
  deleteRecords,
  exportRecords,
  fetchRecords,
  importRecords,
  patchRecord,
  perplexityResearch,
  undoLatestImport,
  verifyExecSearch,
  fetchSnippets,
  aiImportMap,
  inferDomain,
  generateFirmNiche,
  draftEmailTemplate,
  perplexityCategorize,
  perplexityDeepNotes,
  perplexityFindExecutives,
} from '@/lib/api';
import { renderTemplate } from '@/lib/template';
import ExportModal from '@/app/_components/ExportModal';
import LongTextEditorModal from '@/app/_components/LongTextEditorModal';

// Mapping types + guessing live in src/lib/importMapping.ts

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
  // Treat the website/domain field as untrusted. If it doesn't look like a domain,
  // attempt to derive from email instead of failing imports.
  if (r.domain && !isValidDomainLike(r.domain)) {
    r.domain = '';
  }
  r.execSearchCategory = clean(getVal(row, mapping.execSearchCategory));
  const st = clean(getVal(row, mapping.execSearchStatus)).toLowerCase();
  r.execSearchStatus = st === 'yes' || st === 'no' || st === 'unknown' ? (st as 'yes' | 'no' | 'unknown') : 'unknown';
  r.perplexityResearchNotes = clean(getVal(row, mapping.perplexityResearchNotes));
  r.firmNiche = clean(getVal(row, mapping.firmNiche));

  const first = clean(getVal(row, mapping.executiveFirstName));
  const last = clean(getVal(row, mapping.executiveLastName));
  const full = clean(getVal(row, mapping.executiveName));
  r.executiveName = clean([first, last].filter(Boolean).join(' ')) || full;

  r.executiveRole = clean(getVal(row, mapping.executiveRole));
  r.executiveLinkedIn = normalizeLinkedIn(clean(getVal(row, mapping.executiveLinkedIn)));
  r.email = clean(getVal(row, mapping.email));
  r.emailTemplate = clean(getVal(row, mapping.emailTemplate));

  // Derive domain from email if needed
  if (!r.domain && r.email) {
    r.domain = normalizeDomain(extractDomainFromEmail(r.email));
  }

  // If the mapped "domain" column contains non-domain text (common with messy CSVs),
  // never fail the import — just drop and re-derive from email below.

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

// Long text editing is handled by LongTextEditorModal.

export default function Home() {
  const [sourceFile, setSourceFile] = useState('upload.csv');
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});

  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [importing, setImporting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [snippets, setSnippets] = useState<Record<string, string>>({});

  const [exportOpen, setExportOpen] = useState(false);
  const [exportQ, setExportQ] = useState('');
  const [exportHasEmail, setExportHasEmail] = useState(false);
  const [exportExecSearchStatus, setExportExecSearchStatus] = useState<'any' | 'unknown' | 'yes' | 'no'>('any');
  const [exportFormat, setExportFormat] = useState<'csv' | 'tsv'>('csv');
  const [exportLimit, setExportLimit] = useState(5000);

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

  async function refreshSnippets() {
    const res = await fetchSnippets();
    const map: Record<string, string> = {};
    for (const s of res.snippets) map[s.key] = s.value;
    setSnippets(map);
  }

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([refresh(), refreshSnippets()]);
      } finally {
        setLoadingDb(false);
      }
    })();
  }, []);

  function onParse() {
    const parsed = parseCSV(csvText);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(guessMappingHeuristics(parsed.headers));
  }

  async function onImport() {
    try {
      setImporting(true);
      const built = rows.map((r) => buildRow(r, mapping, sourceFile));
      const payload = built.map((r) => ({
        companyName: r.companyName,
        domain: r.domain,
        execSearchCategory: r.execSearchCategory,
        execSearchStatus: r.execSearchStatus,
        perplexityResearchNotes: r.perplexityResearchNotes,
        firmNiche: r.firmNiche,
        executiveName: r.executiveName,
        executiveRole: r.executiveRole,
        executiveLinkedIn: r.executiveLinkedIn,
        email: r.email,
        emailTemplate: r.emailTemplate,
        sourceFile,
        rawRowJson: r.rawRowJson,
      }));

      const res = await importRecords(payload);
      await refresh();
      alert(
        `Import complete. Created ${res.created}, updated ${res.updated}. Batch ${res.batchId}.`
      );
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
    // narrow string index signature to known keys

    if (key === 'domain') patch.domain = normalizeDomain(value);
    if (key === 'executiveLinkedIn') patch.executiveLinkedIn = normalizeLinkedIn(value);
    if (key === 'execSearchStatus') {
      const st = value.toLowerCase();
      (patch as Partial<RecordRow>).execSearchStatus =
        st === 'yes' || st === 'no' || st === 'unknown' ? (st as 'yes' | 'no' | 'unknown') : 'unknown';
    }
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
      <div className="mx-auto w-full max-w-none px-6 py-10">
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
                  // Heuristics immediately, then (best-effort) AI fallback with caching
                  setMapping(guessMappingHeuristics(parsed.headers));

                  // 1) Server-side AI mapping cached by file signature
                  try {
                    const sig = await sha256Hex(`${f.name}|${f.size}|${f.lastModified}|${parsed.headers.join('|')}`);
                    const res = await aiImportMap({ headers: parsed.headers, fileSignature: sig.slice(0, 32) });
                    setMapping((m) => ({ ...m, ...((res.mapping as unknown) as Mapping) }));
                  } catch {
                    // ignore
                  }

                  // 2) Client-side AI fallback (cached in localStorage by headers)
                  try {
                    const { mapping: auto } = await guessMappingAuto(parsed.headers);
                    setMapping((m) => ({ ...m, ...auto }));
                  } catch {
                    // ignore
                  }
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
                  ['Email Template', 'emailTemplate'],
                  ['Firm Niche', 'firmNiche'],
                  ['Exec Search Category', 'execSearchCategory'],
                  ['Exec Search? (unknown/yes/no)', 'execSearchStatus'],
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">3) CRM Table (editable)</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded border bg-white px-3 py-2 text-sm"
                onClick={() => setExportOpen(true)}
              >
                Export…
              </button>
              <button
                className="rounded border bg-white px-3 py-2 text-sm"
                onClick={async () => {
                  const ok = prompt(
                    'Type UNDO to delete all rows from the latest import batch.'
                  );
                  if (ok !== 'UNDO') return;
                  const res = await undoLatestImport();
                  await refresh();
                  alert(`Undid latest import. Deleted ${res.deleted} rows.`);
                }}
              >
                Undo latest import
              </button>
              <button
                disabled={selected.size === 0}
                className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-40"
                onClick={async () => {
                  if (selected.size === 0) return;
                  if (!confirm(`Delete ${selected.size} selected rows?`)) return;
                  const ids = Array.from(selected);
                  const res = await deleteRecords(ids);
                  setSelected(new Set());
                  await refresh();
                  alert(`Deleted ${res.deleted} rows.`);
                }}
              >
                Delete selected
              </button>
            </div>
          </div>

          {loadingDb ? (
            <p className="text-sm text-zinc-600">Loading…</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-zinc-600">No records yet. Import a CSV to get started.</p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white border-b px-2 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={records.length > 0 && selected.size === records.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelected(new Set(records.map((r) => r.id)));
                          else setSelected(new Set());
                        }}
                      />
                    </th>
                    <th className="bg-white border-b px-2 py-2 text-left">#</th>
                    {SHEET_COLUMNS.map((c) => (
                      <th key={c.key} className="border-b px-2 py-2 text-left whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                    <th className="border-b px-2 py-2 text-left whitespace-nowrap">Actions</th>
                    <th className="border-b px-2 py-2 text-left whitespace-nowrap">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, idx) => (
                    <tr key={r.id} className="odd:bg-zinc-50">
                      <td className="sticky left-0 bg-inherit border-b px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(r.id);
                              else n.delete(r.id);
                              return n;
                            });
                          }}
                        />
                      </td>
                      <td className="bg-inherit border-b px-2 py-2">{idx + 1}</td>

                      {SHEET_COLUMNS.map((c) => {
                        const val = String(r[c.key] ?? '');
                        const isLong = c.key === 'perplexityResearchNotes' || c.key === 'emailTemplate';
                        const isDomain = c.key === 'domain';
                        const isLinkedIn = c.key === 'executiveLinkedIn';

                        const linkHref = isDomain
                          ? asHrefDomain(val)
                          : isLinkedIn
                            ? normalizeLinkedIn(val)
                            : '';

                        const invalid = isDomain && domainInvalidIds.has(r.id);

                        return (
                          <td
                            key={String(c.key)}
                            className="border-b px-2 py-2 whitespace-nowrap min-w-[220px]"
                          >
                            {c.key === 'execSearchStatus' ? (
                              <select
                                value={val || 'unknown'}
                                onChange={(e) => setCell(r.id, 'execSearchStatus', e.target.value)}
                                className="w-full rounded border px-2 py-1 text-xs"
                              >
                                <option value="unknown">unknown</option>
                                <option value="yes">yes</option>
                                <option value="no">no</option>
                              </select>
                            ) : linkHref ? (
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

                      <td className="border-b px-2 py-2 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <details className="group">
                            <summary className="cursor-pointer select-none rounded border px-2 py-1 text-[10px]">
                              Enrich
                            </summary>
                            <div className="mt-1 flex flex-col gap-1">
                              <div className="text-[10px] text-zinc-600">OpenAI</div>
                              <button
                                className="rounded border px-2 py-1 text-[10px]"
                                onClick={async () => {
                                  try {
                                    const res = await inferDomain(r.id);
                                    setRecords((xs) => xs.map((x) => (x.id === r.id ? res.record : x)));
                                    if (res.ai?.domain) alert(`Inferred domain → ${res.ai.domain}\n${res.ai.reason}`);
                                  } catch (e) {
                                    alert(e instanceof Error ? e.message : String(e));
                                  }
                                }}
                              >
                                Infer domain
                              </button>
                              <button
                                className="rounded border px-2 py-1 text-[10px]"
                                onClick={async () => {
                                  try {
                                    const res = await verifyExecSearch(r.id);
                                    setRecords((xs) => xs.map((x) => (x.id === r.id ? res.record : x)));
                                    alert(`Exec Search? → ${res.ai.status}\n${res.ai.reason}`);
                                  } catch (e) {
                                    alert(e instanceof Error ? e.message : String(e));
                                  }
                                }}
                              >
                                Verify Exec Search?
                              </button>
                              <button
                                className="rounded border px-2 py-1 text-[10px]"
                                onClick={async () => {
                                  try {
                                    const res = await generateFirmNiche(r.id);
                                    setRecords((xs) => xs.map((x) => (x.id === r.id ? res.record : x)));
                                  } catch (e) {
                                    alert(e instanceof Error ? e.message : String(e));
                                  }
                                }}
                              >
                                Generate firm niche
                              </button>
                              <button
                                className="rounded border px-2 py-1 text-[10px]"
                                onClick={async () => {
                                  try {
                                    const res = await draftEmailTemplate(r.id);
                                    setRecords((xs) => xs.map((x) => (x.id === r.id ? res.record : x)));
                                  } catch (e) {
                                    alert(e instanceof Error ? e.message : String(e));
                                  }
                                }}
                              >
                                Draft email template
                              </button>

                              <div className="mt-1 text-[10px] text-zinc-600">Perplexity</div>
                              <button
                                className="rounded border px-2 py-1 text-[10px]"
                                onClick={async () => {
                                  try {
                                    const res = await perplexityCategorize(r.id);
                                    alert(`Category: ${res.category}\n\n${res.text}`);
                                  } catch (e) {
                                    alert(e instanceof Error ? e.message : String(e));
                                  }
                                }}
                              >
                                Categorize firm
                              </button>
                              <button
                                className="rounded border px-2 py-1 text-[10px]"
                                onClick={async () => {
                                  try {
                                    const res = await perplexityDeepNotes(r.id);
                                    setRecords((xs) => xs.map((x) => (x.id === r.id ? res.record : x)));
                                  } catch (e) {
                                    alert(e instanceof Error ? e.message : String(e));
                                  }
                                }}
                              >
                                Deep research notes
                              </button>
                              <button
                                className="rounded border px-2 py-1 text-[10px]"
                                onClick={async () => {
                                  try {
                                    const res = await perplexityFindExecutives(r.id);
                                    alert(res.executives);
                                  } catch (e) {
                                    alert(e instanceof Error ? e.message : String(e));
                                  }
                                }}
                              >
                                Find key executives
                              </button>

                              <div className="mt-1 text-[10px] text-zinc-600">Legacy</div>
                              <button
                                className="rounded border px-2 py-1 text-[10px]"
                                onClick={async () => {
                                  try {
                                    const res = await perplexityResearch(r.id);
                                    setRecords((xs) => xs.map((x) => (x.id === r.id ? res.record : x)));
                                  } catch (e) {
                                    alert(e instanceof Error ? e.message : String(e));
                                  }
                                }}
                              >
                                Perplexity research (append)
                              </button>
                            </div>
                          </details>
                        </div>
                      </td>

                      <td className="border-b px-2 py-2 min-w-[360px]">
                        <div className="rounded border bg-white p-2 text-[10px] whitespace-pre-wrap">
                          {renderTemplate(r.emailTemplate || '', { row: r, snippets })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <LongTextEditorModal
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
          placeholders={
            modalKey === 'emailTemplate'
              ? [
                  { label: 'Company Name → {{companyName}}', token: '{{companyName}}' },
                  { label: 'Domain → {{domain}}', token: '{{domain}}' },
                  { label: 'Executive Name → {{executiveName}}', token: '{{executiveName}}' },
                  { label: 'Executive Role → {{executiveRole}}', token: '{{executiveRole}}' },
                  { label: 'Email → {{email}}', token: '{{email}}' },
                  { label: 'Firm Niche → {{firmNiche}}', token: '{{firmNiche}}' },
                  { label: 'Snippet key → {{snippet:KEY}}', token: '{{snippet:KEY}}' },
                ]
              : undefined
          }
        />

        <ExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          q={exportQ}
          setQ={setExportQ}
          hasEmail={exportHasEmail}
          setHasEmail={setExportHasEmail}
          execSearchStatus={exportExecSearchStatus}
          setExecSearchStatus={setExportExecSearchStatus}
          format={exportFormat}
          setFormat={setExportFormat}
          limit={exportLimit}
          setLimit={setExportLimit}
          onExport={async () => {
            const text = await exportRecords({
              format: exportFormat,
              filter: {
                execSearchStatus: exportExecSearchStatus,
                hasEmail: exportHasEmail,
                q: exportQ,
                limit: exportLimit,
              },
            });
            return text;
          }}
        />
      </div>
    </div>
  );
}
