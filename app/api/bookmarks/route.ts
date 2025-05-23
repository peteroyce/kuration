import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { embed } from '@/lib/embeddings';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const tag = searchParams.get('tag');

  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId: user.id,
      ...(tag ? { tags: { contains: tag } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ bookmarks });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { url, title, description, tags = [] } = await req.json();
  if (!url || !title) return NextResponse.json({ error: 'url and title are required' }, { status: 400 });

  // Generate semantic embedding for search
  const embeddingText = `${title} ${description || ''} ${tags.join(' ')}`.trim();
  let embedding: number[] | null = null;
  try {
    embedding = await embed(embeddingText);
  } catch {
    // Non-fatal: bookmark saved without embedding, won't appear in semantic search
  }

  const bookmark = await prisma.bookmark.create({
    data: {
      url, title, description, userId: user.id,
      tags: JSON.stringify(tags),
      embedding: embedding ? JSON.stringify(embedding) : null,
    },
  });

  return NextResponse.json({ bookmark }, { status: 201 });
}
# graceful fallback when embedding generation fails
