import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { embed, cosineSimilarity } from '@/lib/embeddings';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 });

  // Fetch all bookmarks with embeddings
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: user.id, embedding: { not: null } },
  });

  if (bookmarks.length === 0) {
    return NextResponse.json({ results: [], query });
  }

  // Embed the query
  const queryVec = await embed(query);

  // Score each bookmark by cosine similarity
  const scored = bookmarks
    .map(b => ({
      ...b,
      tags: JSON.parse(b.tags || '[]'),
      score: cosineSimilarity(queryVec, JSON.parse(b.embedding!)),
    }))
    .filter(b => b.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return NextResponse.json({ results: scored, query });
}
