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

  // Fetch all bookmarks with embeddings for this user
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: user.id, embedding: { not: null } },
  });

  if (bookmarks.length === 0) {
    return NextResponse.json({ results: [], query });
  }

  // Embed the query
  const queryVec = await embed(query);

  // Score each bookmark by cosine similarity
  let scored = bookmarks
    .map(b => ({
      ...b,
      tags: JSON.parse(b.tags || '[]') as string[],
      score: cosineSimilarity(queryVec, JSON.parse(b.embedding!)),
    }))
    .filter(b => b.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  // Apply tag filter: keep only bookmarks that contain ALL required tags
  if (requiredTags.length > 0) {
    scored = scored.filter(b =>
      requiredTags.every(rt => b.tags.includes(rt))
    );
  }

  return NextResponse.json({ results: scored, query });
}
