'use client';

import { useEffect, useMemo, useState } from 'react';

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function linkifyMarkdown(text: string) {
  // Very small helper: find markdown links [label](url)
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts: Array<{ kind: 'text' | 'link'; text: string; href?: string }> = [];
  let last = 0;
  for (;;) {
    const m = re.exec(text);
    if (!m) break;
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    parts.push({ kind: 'link', text: m[1] ?? m[2], href: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

export default function LongTextEditorModal({
  open,
  title,
  value,
  onClose,
  onSave,
  placeholders,
}: {
  open: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onSave: (v: string) => void;
  placeholders?: Array<{ label: string; token: string }>;
}) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [local, setLocal] = useState(value);

  // Keep local state in sync when opening.
  useEffect(() => {
    if (!open) return;
    // Delay one tick to avoid the setState-in-effect lint rule.
    const t = setTimeout(() => {
      setLocal(value);
      setTab('edit');
    }, 0);
    return () => clearTimeout(t);
  }, [open, value]);

  const preview = useMemo(() => linkifyMarkdown(local || ''), [local]);

  function insertToken(token: string) {
    setLocal((cur) => {
      // naive insertion at end (keeps implementation small); users can cut/paste as needed
      if (!cur) return token;
      const sep = cur.endsWith(' ') || cur.endsWith('\n') ? '' : ' ';
      return cur + sep + token;
    });
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-4xl rounded-xl bg-white p-4 shadow">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-medium text-sm">{title}</div>
          <button className="rounded border px-2 py-1 text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={classNames(
              'rounded border px-2 py-1 text-xs',
              tab === 'edit' && 'bg-black text-white'
            )}
            onClick={() => setTab('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            className={classNames(
              'rounded border px-2 py-1 text-xs',
              tab === 'preview' && 'bg-black text-white'
            )}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>

          {placeholders?.length ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="text-xs text-zinc-600">Insert placeholder:</div>
              <select
                className="rounded border px-2 py-1 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  insertToken(v);
                  e.target.value = '';
                }}
              >
                <option value="">(choose)</option>
                {placeholders.map((p) => (
                  <option key={p.token} value={p.token}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {tab === 'edit' ? (
          <textarea
            className="h-[420px] w-full rounded border p-3 text-xs font-mono"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Write markdown here. Use [text](https://example.com) for links."
          />
        ) : (
          <div className="h-[420px] w-full overflow-auto rounded border bg-white p-3 text-xs whitespace-pre-wrap">
            {preview.length === 0 ? (
              <div className="text-zinc-500">(empty)</div>
            ) : (
              preview.map((p, idx) =>
                p.kind === 'link' ? (
                  <a
                    key={idx}
                    href={p.href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-blue-700"
                  >
                    {p.text}
                  </a>
                ) : (
                  <span key={idx}>{p.text}</span>
                )
              )
            )}
          </div>
        )}

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
