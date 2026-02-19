import { NextResponse } from 'next/server';

export function requireMaintenanceToken(req: Request): NextResponse | null {
  const token = process.env.MAINTENANCE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Missing MAINTENANCE_TOKEN env var (server-side). Refusing maintenance access.' },
      { status: 503 }
    );
  }

  const hdr = req.headers.get('x-maintenance-token') || '';
  const url = new URL(req.url);
  const qp = url.searchParams.get('token') || '';
  const provided = hdr || qp;

  if (!provided || provided !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
