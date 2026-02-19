export default function JobStatusPill({ status }: { status?: string | null }) {
  const s = (status ?? '').toLowerCase();
  if (!s) return null;

  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] border';
  const styles: Record<string, string> = {
    queued: 'bg-zinc-50 text-zinc-700 border-zinc-200',
    running: 'bg-blue-50 text-blue-700 border-blue-200',
    succeeded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    rate_limited: 'bg-amber-50 text-amber-800 border-amber-200',
    cancelled: 'bg-zinc-50 text-zinc-500 border-zinc-200',
  };

  return <span className={`${base} ${styles[s] ?? styles.queued}`}>{s}</span>;
}
