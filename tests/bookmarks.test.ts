/**
 * Tests for bookmark API routes.
 * Prisma and next-auth are mocked so no database or auth server is needed.
 */

// ---- Mocks ----------------------------------------------------------------

// Mock next-auth session
const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(),
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

// Provide a dummy authOptions export so the import in the route doesn't crash
jest.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {},
}));

// Mock Prisma
const mockPrismaUser = { findUnique: jest.fn() };
const mockPrismaBookmark = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
};
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: mockPrismaUser,
    bookmark: mockPrismaBookmark,
  },
}));

// Mock embed (never hits the network)
jest.mock('@/lib/embeddings', () => ({
  embed: jest.fn().mockResolvedValue(new Array(128).fill(0.1)),
  cosineSimilarity: jest.fn().mockReturnValue(0.9),
}));

// Mock env validation so it doesn't throw in test env
jest.mock('@/lib/env', () => ({}));

// ---- Helpers ---------------------------------------------------------------

import { NextRequest } from 'next/server';

function makeRequest(
  method: string,
  url: string,
  body?: unknown
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Import routes AFTER mocks are registered
import { GET, POST } from '@/app/api/bookmarks/route';
import { DELETE, PATCH } from '@/app/api/bookmarks/[id]/route';

// ---- State resets ----------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Reset rate-limit store between tests to avoid leakage
  // We import the module directly; Jest re-uses the same module instance
  // within a test file, so clearing between tests requires re-importing or
  // flushing the internal Map.  We do this by advancing time instead — each
  // test runs in < 1 ms, so the window won't roll naturally, but we can
  // replace the Map by clearing the module registry when needed.
  // For simplicity here we rely on per-user IDs being unique per test block.
});

// ---- Tests -----------------------------------------------------------------

describe('POST /api/bookmarks', () => {
  const BASE = 'http://localhost:3000/api/bookmarks';

  it('creates a bookmark with a valid URL', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@example.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-create-1', email: 'test@example.com' });
    mockPrismaBookmark.create.mockResolvedValue({
      id: 'bm-1',
      url: 'https://example.com',
      title: 'Example',
      tags: '[]',
      embedding: null,
      userId: 'user-create-1',
    });

    const req = makeRequest('POST', BASE, {
      url: 'https://example.com',
      title: 'Example',
      tags: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.bookmark).toBeDefined();
    expect(json.bookmark.url).toBe('https://example.com');
  });

  it('returns 400 for an invalid URL', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@example.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-create-2', email: 'test@example.com' });

    const req = makeRequest('POST', BASE, {
      url: 'not-a-url',
      title: 'Bad URL',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/valid URL/i);
  });

  it('returns 401 for an unauthenticated request', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = makeRequest('POST', BASE, {
      url: 'https://example.com',
      title: 'Anon',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when tags array is oversized (> 20)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@example.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-create-3', email: 'test@example.com' });

    const bigTags = new Array(21).fill('tag');
    const req = makeRequest('POST', BASE, {
      url: 'https://example.com',
      title: 'Too Many Tags',
      tags: bigTags,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/20/);
  });

  it('returns 400 when a tag exceeds 50 characters', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'test@example.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-create-4', email: 'test@example.com' });

    const longTag = 'a'.repeat(51);
    const req = makeRequest('POST', BASE, {
      url: 'https://example.com',
      title: 'Long Tag',
      tags: [longTag],
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/50/);
  });
});

describe('DELETE /api/bookmarks/[id]', () => {
  const BASE = 'http://localhost:3000/api/bookmarks';

  it('deletes own bookmark and returns 200', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'owner@example.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-del-1', email: 'owner@example.com' });
    mockPrismaBookmark.findUnique.mockResolvedValue({ id: 'bm-del-1', userId: 'user-del-1' });
    mockPrismaBookmark.delete.mockResolvedValue({ id: 'bm-del-1' });

    const req = makeRequest('DELETE', `${BASE}/bm-del-1`);
    const res = await DELETE(req, { params: { id: 'bm-del-1' } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockPrismaBookmark.delete).toHaveBeenCalledWith({ where: { id: 'bm-del-1' } });
  });

  it('returns 403 when deleting another user\'s bookmark', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'attacker@example.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-del-attacker', email: 'attacker@example.com' });
    mockPrismaBookmark.findUnique.mockResolvedValue({ id: 'bm-del-2', userId: 'user-del-victim' });

    const req = makeRequest('DELETE', `${BASE}/bm-del-2`);
    const res = await DELETE(req, { params: { id: 'bm-del-2' } });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
    expect(mockPrismaBookmark.delete).not.toHaveBeenCalled();
  });

  it('returns 401 for unauthenticated DELETE', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = makeRequest('DELETE', `${BASE}/bm-xyz`);
    const res = await DELETE(req, { params: { id: 'bm-xyz' } });

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/bookmarks/[id]', () => {
  const BASE = 'http://localhost:3000/api/bookmarks';

  it('updates bookmark fields and returns 200', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'owner@example.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-patch-1', email: 'owner@example.com' });
    mockPrismaBookmark.findUnique.mockResolvedValue({
      id: 'bm-patch-1',
      userId: 'user-patch-1',
      url: 'https://old.com',
      title: 'Old',
      description: null,
      tags: '[]',
      embedding: null,
    });
    mockPrismaBookmark.update.mockResolvedValue({
      id: 'bm-patch-1',
      url: 'https://new.com',
      title: 'New',
      tags: '[]',
    });

    const req = makeRequest('PATCH', `${BASE}/bm-patch-1`, {
      url: 'https://new.com',
      title: 'New',
    });
    const res = await PATCH(req, { params: { id: 'bm-patch-1' } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bookmark).toBeDefined();
  });

  it('returns 400 for invalid URL in PATCH', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'owner@example.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-patch-2', email: 'owner@example.com' });
    mockPrismaBookmark.findUnique.mockResolvedValue({
      id: 'bm-patch-2',
      userId: 'user-patch-2',
      url: 'https://old.com',
      title: 'Old',
      description: null,
      tags: '[]',
      embedding: null,
    });

    const req = makeRequest('PATCH', `${BASE}/bm-patch-2`, { url: 'garbage' });
    const res = await PATCH(req, { params: { id: 'bm-patch-2' } });

    expect(res.status).toBe(400);
  });
});
