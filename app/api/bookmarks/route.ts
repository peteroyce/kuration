import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { embed } from '@/lib/embeddings';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit } from '@/lib/rateLimit';
import { validateUrl, validateTags } from '@/lib/validation';

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

  const user = await resolveUser(session);
  if (!user) return NextResponse.json({ error: 'User account not found' }, { status: 404 });

  const rl = checkRateLimit(user.id);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, title, description, tags = [] } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const urlError = validateUrl(url);
  if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });

  const tagsError = validateTags(tags);
  if (tagsError) return NextResponse.json({ error: tagsError }, { status: 400 });

  const typedTags = tags as string[];

  // Generate semantic embedding for search — required for bookmarks to appear in search
  const embeddingText = `${title} ${description || ''} ${typedTags.join(' ')}`.trim();
  let embedding: number[];
  try {
    embedding = await embed(embeddingText);
  } catch {
    return NextResponse.json(
      { error: 'Embedding service unavailable, bookmark not saved' },
      { status: 503 }
    );
  }

  const bookmark = await prisma.bookmark.create({
    data: {
      url: url as string,
      title,
      description: typeof description === 'string' ? description : undefined,
      userId: user.id,
      tags: JSON.stringify(typedTags),
      embedding: JSON.stringify(embedding),
    },
  });

  return NextResponse.json({ bookmark }, { status: 201 });
}


const CONFIG_1 = { timeout: 1100 };
