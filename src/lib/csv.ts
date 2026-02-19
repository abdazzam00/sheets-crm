// Minimal CSV parser + serializer (handles commas + quotes). Good enough for Apollo-like exports.

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  // normalize line endings
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into lines while respecting quoted newlines
  let cur = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      const next = src[i + 1];
      if (inQ && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQ = !inQ;
      continue;
    }
    if (ch === '\n' && !inQ) {
      lines.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) lines.push(cur);

  const cells = (line: string): string[] => {
    const out: string[] = [];
    let c = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        const next = line[i + 1];
        if (q && next === '"') {
          c += '"';
          i++;
          continue;
        }
        q = !q;
        continue;
      }
      if (ch === ',' && !q) {
        out.push(c.trim());
        c = '';
        continue;
      }
      c += ch;
    }
    out.push(c.trim());
    return out;
  };

  const headerLine = lines.find((l) => l.trim().length > 0);
  if (!headerLine) return { headers: [], rows: [] };
  const headerCells = cells(headerLine);
  const headers = headerCells.map((h) => h.trim());

  const startIdx = lines.indexOf(headerLine) + 1;
  const rows: Record<string, string>[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cs = cells(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cs[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

export function toCSV(headers: string[], rows: Record<string, string>[]) {
  const esc = (s: string) => {
    const needs = /[\n\r,\"]/g.test(s);
    const v = s.replace(/\"/g, '""');
    return needs ? `"${v}"` : v;
  };

  const out: string[] = [];
  out.push(headers.map((h) => esc(h)).join(','));
  for (const r of rows) {
    out.push(headers.map((h) => esc(r[h] ?? '')).join(','));
  }
  return out.join('\n');
}
