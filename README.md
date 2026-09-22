# MatchSticked

Pick a movie together. No more scrolling debates.

Everyone swipes through a shared deck built from their watchlists. Anything the whole group likes is a match, and if there's more than one, the roulette picks tonight's film. Also has solo swiping, a discover feed with themed decks, friends and invites, Letterboxd import, trailers, and UK streaming availability.

## Layout

| Path | What |
| --- | --- |
| `client/` | Next.js 16 (App Router) web app, Tailwind v4, framer-motion |
| `server/` | Express 5 API + Socket.IO, Prisma on PostgreSQL |
| `shared/` | `@matchsticked/shared`: types shared by client and server |
| `mobile/` | Expo app (gitignored, not in this repo yet) |

This is an npm workspace, so run `npm install` once at the root.

## Running locally

```bash
# 1. Postgres
docker compose up -d db

# 2. Env
cp server/.env.example server/.env     # add TMDB_API_KEY (free at themoviedb.org)
cp client/.env.example client/.env.local

# 3. Install, migrate, run
npm install
npm run db:migrate -w server
npm run dev:server     # http://localhost:3001
npm run dev:client     # http://localhost:3000
```

In dev, verification and password-reset emails are printed to the server log instead of sent, so you can click the link from there.

## Checks

```bash
npm run typecheck      # shared, client, server
npm run lint           # client + server
npm test -w server     # jest + supertest (Prisma is mocked)
npm test -w client
```

## Environment

**Server** (`server/.env`)

| Var | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | Must not be the example value in production |
| `TMDB_API_KEY` | yes | TMDB v3 API key |
| `CLIENT_URL` | | CORS origin and link base (default `http://localhost:3000`) |
| `PORT` | | Default `3001` |
| `RESEND_API_KEY`, `EMAIL_FROM` | | Real email delivery. Unset means emails are logged |
| `SCRAPINGANT_API_KEY` / `SCRAPER_API_KEY` | | Proxy for Letterboxd username import. Needed on datacenter hosts, which Letterboxd blocks |
| `ADMIN_USERNAMES` | | Comma-separated usernames allowed into `/admin/feedback` |
| `APPLE_BUNDLE_ID` | | Audience for Sign in with Apple tokens |
| `TMDB_API_BASE` | | Override the TMDB host, e.g. to point at a local stub |

**Client** (`client/.env.local`)

| Var | Notes |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | API base, e.g. `http://localhost:3001/api` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO origin, e.g. `http://localhost:3001` |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for share previews (default `https://matchsticked.com`) |

## How a few things work

- **TMDB traffic** all goes through `server/src/services/tmdbClient.ts`. It's one scheduler (12 concurrent, 40 req/s, retries on 429 and 5xx) with a TTL response cache and in-flight dedup. A movie's details, credits, UK providers and trailer come from a single request.
- **Streaming availability** is stored on each movie with a `tmdb_synced_at` stamp. Anything older than 7 days is re-synced when its detail view opens (the request waits at most 2.5s for this), and library loads and new sessions refresh stale movies in the background.
- **Group decks** (`server/src/lib/groupCuration.ts`) mix "shared picks" that are on everyone's watchlist with each person's own picks, ranked by how much the others' taste would like them.
- **Swiping** is optimistic. The next card shows immediately and requests go out through a serial queue (`client/src/lib/serialQueue.ts`), so swipes, undos and "done" always reach the server in order. If you're offline, swipes are queued in `localStorage` and synced when you reconnect.
- **Keyboard**: on the swipe screen, ← / → pass and like, ↑ opens details, Z undoes.

## Deploying

- Server: `server/Dockerfile` runs `prisma migrate deploy` then starts. Migrations live in `server/prisma/migrations`.
- Client: built for Vercel (`@vercel/analytics`). `output: 'standalone'` is set for container hosting.
