import { NextResponse } from 'next/server';
import { listRecords, ensureSchema } from '@/lib/recordsRepo';

export async function GET() {
  try {
    await ensureSchema();
    const records = await listRecords();
    return NextResponse.json({ records });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
