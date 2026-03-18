import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { embed, cosineSimilarity } from '@/lib/embeddings';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit } from '@/lib/rateLimit';

async function resolveUser(session: { user?: { email?: string | null } | null } | null) {
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({ where: { email: session.user.email } });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await resolveUser(session);
  if (!user) return NextResponse.json({ error: 'User account not found' }, { status: 404 });

  const rl = checkRateLimit(user.id);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 });

  // Optional tag filter: comma-separated list of tags that results MUST all have
  const tagsParam = searchParams.get('tags');
  const requiredTags: string[] = tagsParam
    ? tagsParam.split(',').map(t => t.trim()).filter(Boolean)
    : [];

  // Pagination params: limit (default 20, max 100) and offset (default 0)
  const limitParam = parseInt(searchParams.get('limit') ?? '20', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, 100)
    : 20;
  const offsetParam = parseInt(searchParams.get('offset') ?? '0', 10);
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  // Score threshold: default 0.3, accepts optional override in range [0.0, 1.0]
  const thresholdParam = parseFloat(searchParams.get('threshold') ?? '0.3');
  const threshold = Number.isFinite(thresholdParam) && thresholdParam >= 0 && thresholdParam <= 1
    ? thresholdParam
    : 0.3;

  // Fetch all bookmarks with embeddings for this user
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: user.id, embedding: { not: null } },
  });

  if (bookmarks.length === 0) {
    return NextResponse.json({ results: [], query, total: 0, limit, offset });
  }

  // Embed the query
  const queryVec = await embed(query);

  // Score each bookmark by cosine similarity; skip any with corrupt embeddings
  type ScoredBookmark = ReturnType<typeof bookmarks[0] extends infer T ? () => T & { tags: string[]; score: number } : never>;
  const scored: Array<typeof bookmarks[0] & { tags: string[]; score: number }> = [];

  for (const b of bookmarks) {
    let embVec: number[];
    try {
      embVec = JSON.parse(b.embedding!) as number[];
    } catch {
      // Skip bookmarks with corrupt/invalid embedding data
      continue;
    }
    scored.push({
      ...b,
      tags: JSON.parse(b.tags || '[]') as string[],
      score: cosineSimilarity(queryVec, embVec),
    });
  }

  let filtered = scored
    .filter(b => b.score > threshold)
    .sort((a, b) => b.score - a.score);

  // Apply tag filter: keep only bookmarks that contain ALL required tags
  if (requiredTags.length > 0) {
    filtered = filtered.filter(b =>
      requiredTags.every(rt => b.tags.includes(rt))
    );
  }

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return NextResponse.json({ results: paginated, query, total, limit, offset });
}
