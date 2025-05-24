import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { embed } from '@/lib/embeddings';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit } from '@/lib/rateLimit';
import { validateUrl, validateTags } from '@/lib/validation';

interface RouteContext {
  params: { id: string };
}

async function resolveUser(session: { user?: { email?: string | null } | null } | null) {
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({ where: { email: session.user.email } });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
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

  const bookmark = await prisma.bookmark.findUnique({ where: { id: params.id } });
  if (!bookmark) {
    return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 });
  }
  if (bookmark.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.bookmark.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
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

  const bookmark = await prisma.bookmark.findUnique({ where: { id: params.id } });
  if (!bookmark) {
    return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 });
  }
  if (bookmark.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, title, description, tags } = body as Record<string, unknown>;

  // Validate only supplied fields
  if (url !== undefined) {
    const urlError = validateUrl(url);
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });
  }

  if (tags !== undefined) {
    const tagsError = validateTags(tags);
    if (tagsError) return NextResponse.json({ error: tagsError }, { status: 400 });
  }

  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 });
  }

  // Compute updated values, falling back to existing stored values
  const newUrl = typeof url === 'string' ? url : bookmark.url;
  const newTitle = typeof title === 'string' ? title : bookmark.title;
  const newDescription = typeof description === 'string' ? description : bookmark.description;
  const existingTags: string[] = JSON.parse(bookmark.tags || '[]');
  const newTags: string[] = Array.isArray(tags) ? (tags as string[]) : existingTags;

  // Re-embed if any content field changed
  const embeddingText = `${newTitle} ${newDescription || ''} ${newTags.join(' ')}`.trim();
  let newEmbedding: string | null = bookmark.embedding;
  try {
    const vec = await embed(embeddingText);
    newEmbedding = JSON.stringify(vec);
  } catch {
    // Keep existing embedding if re-embedding fails
  }

  const updated = await prisma.bookmark.update({
    where: { id: params.id },
    data: {
      url: newUrl,
      title: newTitle,
      description: newDescription,
      tags: JSON.stringify(newTags),
      embedding: newEmbedding,
    },
  });

  return NextResponse.json({ bookmark: updated });
}
