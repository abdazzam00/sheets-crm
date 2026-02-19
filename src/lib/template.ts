import type { RecordRow } from '@/lib/schema';

export function renderTemplate(tpl: string, ctx: {
  row: Partial<RecordRow>;
  snippets: Record<string, string>;
}) {
  const row = ctx.row;
  const builtins: Record<string, string> = {
    Executive_Name: row.executiveName ?? '',
    Executive_Role: row.executiveRole ?? '',
    Executive_LinkedIn: row.executiveLinkedIn ?? '',
    Email: row.email ?? '',
    Company_Name: row.companyName ?? '',
    Domain: row.domain ?? '',
    'Exec Category': row.execSearchCategory ?? '',
    Exec_Category: row.execSearchCategory ?? '',
  };

  return (tpl ?? '').replace(/\{([^}]+)\}/g, (_m, keyRaw) => {
    const key = String(keyRaw).trim();
    if (key in builtins) return builtins[key] ?? '';
    if (key in ctx.snippets) return ctx.snippets[key] ?? '';
    // allow {Claude_research_SaaS} but also tolerate spaces
    const normalized = key.replace(/\s+/g, '_');
    if (normalized in ctx.snippets) return ctx.snippets[normalized] ?? '';
    return '';
  });
}
