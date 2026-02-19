import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/recordsRepo';
import { listSnippets, upsertSnippet, deleteSnippet } from '@/lib/snippetsRepo';

export async function GET() {
  try {
    await ensureSchema();
    const snippets = await listSnippets();
    return NextResponse.json({ snippets });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

const UpsertSchema = z.object({ key: z.string().min(1), value: z.string().default('') });

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const json = await req.json();
    const body = UpsertSchema.parse(json);
    const snippet = await upsertSnippet(body.key, body.value);
    return NextResponse.json({ snippet });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

const DeleteSchema = z.object({ key: z.string().min(1) });

export async function DELETE(req: Request) {
  try {
    await ensureSchema();
    const json = await req.json();
    const body = DeleteSchema.parse(json);
    await deleteSnippet(body.key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
