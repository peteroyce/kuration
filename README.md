# kuration

> Semantic bookmark manager that understands what you saved, not just what you titled it. Retrieves links by meaning using embeddings — so you never lose a link again.

## The Problem

You save 500 bookmarks. Six months later you search "that article about React performance" and find nothing — because you titled it "interesting read" and tagged it "web".

**kuration** embeds every bookmark at save time. Search by meaning, not by keywords.

## Features

- **Semantic search** — find bookmarks by what they mean, not what they're called
- **Cosine similarity ranking** — results ordered by relevance, not recency
- **Tag filtering** — combine semantic search with tag-based filtering
- **GitHub OAuth** — zero-friction sign-in
- **SQLite** — zero infrastructure, just a file

## Quick Start

```bash
git clone https://github.com/peteroyce/kuration
cd kuration
cp .env.example .env.local
# fill in ANTHROPIC_API_KEY, GITHUB_ID, GITHUB_SECRET, NEXTAUTH_SECRET

npm install
npm run db:push
npm run dev
```

## API

### Save a bookmark
```bash
curl -X POST /api/bookmarks \
  -H "Content-Type: application/json" \
  -d '{"url": "https://...", "title": "React Fiber architecture deep-dive", "tags": ["react", "perf"]}'
```

### Semantic search
```bash
curl "/api/search?q=how does React schedule rendering"
```

Returns bookmarks ranked by semantic similarity to your query — even if the exact words don't match.

## Tech Stack

Next.js 14 · Prisma · SQLite · NextAuth · Anthropic SDK · TypeScript
