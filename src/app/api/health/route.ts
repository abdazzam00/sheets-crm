import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/recordsRepo';

export async function GET() {
  try {
    await ensureSchema();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
