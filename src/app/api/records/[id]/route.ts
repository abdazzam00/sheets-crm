import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateRecord } from '@/lib/recordsRepo';

const PatchSchema = z.object({
  companyName: z.string().optional(),
  domain: z.string().optional(),
  execSearchCategory: z.string().optional(),
  execSearchStatus: z.enum(['unknown', 'yes', 'no']).optional(),
  perplexityResearchNotes: z.string().optional(),
  firmNiche: z.string().optional(),
  executiveName: z.string().optional(),
  executiveRole: z.string().optional(),
  executiveLinkedIn: z.string().optional(),
  email: z.string().optional(),
  emailTemplate: z.string().optional(),
  sourceFile: z.string().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const json = await req.json();
    const patch = PatchSchema.parse(json);
    const record = await updateRecord(id, patch);
    return NextResponse.json({ record });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
