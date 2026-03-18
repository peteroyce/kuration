/**
 * Tests for the search API route.
 */

// ---- Mocks ----------------------------------------------------------------

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(),
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {},
}));

const mockPrismaUser = { findUnique: jest.fn() };
const mockPrismaBookmark = { findMany: jest.fn() };
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: mockPrismaUser,
    bookmark: mockPrismaBookmark,
  },
}));

const mockEmbed = jest.fn();
const mockCosineSimilarity = jest.fn();
jest.mock('@/lib/embeddings', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  cosineSimilarity: (...args: unknown[]) => mockCosineSimilarity(...args),
}));

jest.mock('@/lib/env', () => ({}));

// ---- Helpers ---------------------------------------------------------------

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/search/route';

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

const QUERY_VEC = new Array(128).fill(0.5);

// Bookmark factory
function makeBookmark(
  id: string,
  tags: string[],
  score: number
) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Bookmark ${id}`,
    description: null,
    tags: JSON.stringify(tags),
    embedding: JSON.stringify(new Array(128).fill(score)),
    userId: 'user-search-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    _score: score, // stored for verification; not part of Prisma type
  };
}

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockEmbed.mockResolvedValue(QUERY_VEC);
});

describe('GET /api/search', () => {
  const BASE = 'http://localhost:3000/api/search';

  it('returns 401 for unauthenticated request', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest(`${BASE}?q=test`));
    expect(res.status).toBe(401);
  });

  it('returns 400 when q param is missing', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'a@b.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-s-1', email: 'a@b.com' });
    const res = await GET(makeRequest(BASE));
    expect(res.status).toBe(400);
  });

  it('returns results sorted by cosine similarity (highest first)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'a@b.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-s-sort', email: 'a@b.com' });

    // All scores above the default threshold of 0.3
    const bm1 = makeBookmark('low', [], 0.4);
    const bm2 = makeBookmark('high', [], 0.9);
    const bm3 = makeBookmark('mid', [], 0.6);

    mockPrismaBookmark.findMany.mockResolvedValue([bm1, bm2, bm3]);

    // Make cosineSimilarity return distinct scores per bookmark embedding
    mockCosineSimilarity.mockImplementation((_q: number[], emb: number[]) => {
      return emb[0]; // the first element IS the score we put in
    });

    const res = await GET(makeRequest(`${BASE}?q=hello`));
    expect(res.status).toBe(200);
    const json = await res.json();

    const scores = json.results.map((r: { score: number }) => r.score);
    // Must be in descending order
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
    // high (0.9) should be first, low (0.4) last
    expect(json.results[0].id).toBe('high');
    expect(json.results[json.results.length - 1].id).toBe('low');
  });

  it('tag filter reduces results to only bookmarks with ALL specified tags', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'a@b.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-s-tag', email: 'a@b.com' });

    const bmBoth = makeBookmark('both', ['react', 'typescript'], 0.9);
    const bmReactOnly = makeBookmark('reactonly', ['react'], 0.8);
    const bmNone = makeBookmark('none', ['css'], 0.7);

    mockPrismaBookmark.findMany.mockResolvedValue([bmBoth, bmReactOnly, bmNone]);
    mockCosineSimilarity.mockImplementation((_q: number[], emb: number[]) => emb[0]);

    const res = await GET(makeRequest(`${BASE}?q=frontend&tags=react,typescript`));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Only bmBoth has BOTH react AND typescript
    expect(json.results).toHaveLength(1);
    expect(json.results[0].id).toBe('both');
  });

  it('returns empty results when no bookmarks match the score threshold', async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: 'a@b.com' } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-s-empty', email: 'a@b.com' });

    const bmLow = makeBookmark('low', [], 0.05);
    mockPrismaBookmark.findMany.mockResolvedValue([bmLow]);
    mockCosineSimilarity.mockReturnValue(0.05); // below 0.1 threshold

    const res = await GET(makeRequest(`${BASE}?q=random`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toHaveLength(0);
  });
});
