import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireMaintenanceToken } from '@/lib/maintenanceAuth';
import { findDuplicateDomains, mergeCompaniesByDomain } from '@/lib/companyDedupe';

export const dynamic = 'force-dynamic';

const GetSchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(200),
});

export async function GET(req: Request) {
  const auth = requireMaintenanceToken(req);
  if (auth) return auth;

  const url = new URL(req.url);
  const parsed = GetSchema.safeParse({ limit: url.searchParams.get('limit') ?? undefined });
  const limit = parsed.success ? parsed.data.limit : 200;

  const duplicates = await findDuplicateDomains(limit);
  return NextResponse.json({ duplicates });
}

const PostSchema = z.object({
  domain: z.string().min(1),
  apply: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = requireMaintenanceToken(req);
  if (auth) return auth;

  const body = PostSchema.parse(await req.json());
  const res = await mergeCompaniesByDomain({ domain: body.domain, dryRun: !body.apply });
  return NextResponse.json({ result: res, applied: !!body.apply });
}
