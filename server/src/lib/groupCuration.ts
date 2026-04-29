import type { Movie } from '@prisma/client';
import { prisma } from '../app';
import { applyMovieFilters, MovieFilters } from './filterMovies';
import { getSeedTmdbIds } from '../services/recommendations';
import { getTmdbRecommendations } from '../services/tmdb';

const SEED_CAP_PER_PARTICIPANT = 8;
const TIER_2_RATIO = 0.25;

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface ParticipantPool {
  userId: string;
  watchlist: Movie[];
  seedTmdbIds: number[];
}

async function loadParticipantPools(
  userIds: string[],
  filters: MovieFilters,
  excludeMovieIds: Set<string>,
): Promise<ParticipantPool[]> {
  return Promise.all(
    userIds.map(async (userId) => {
      const [userMovies, allSeeds] = await Promise.all([
        prisma.userMovie.findMany({
          where: { userId, onWatchlist: true },
          include: { movie: true },
        }),
        getSeedTmdbIds(userId),
      ]);
      const watchlist = applyMovieFilters(
        userMovies.map((um) => um.movie).filter((m) => !excludeMovieIds.has(m.id)),
        filters,
      );
      const seedTmdbIds = shuffle([...allSeeds]).slice(0, SEED_CAP_PER_PARTICIPANT);
      return { userId, watchlist, seedTmdbIds };
    }),
  );
}

async function buildAffinityMap(
  seedTmdbIds: number[],
  recCache: Map<number, Promise<{ id: number; vote_average?: number; popularity?: number }[]>>,
): Promise<Map<number, number>> {
  const affinity = new Map<number, number>();
  if (seedTmdbIds.length === 0) return affinity;

  const recsBySeed = await Promise.all(
    seedTmdbIds.map((id) => {
      const cached = recCache.get(id);
      if (cached) return cached;
      const promise = getTmdbRecommendations(id);
      recCache.set(id, promise);
      return promise;
    }),
  );

  for (const recs of recsBySeed) {
    for (const r of recs) {
      const score = (r.vote_average ?? 0) * Math.log10((r.popularity ?? 0) + 1);
      affinity.set(r.id, (affinity.get(r.id) ?? 0) + score);
    }
  }
  return affinity;
}

function scoreCandidate(
  candidate: Movie,
  otherAffinityMaps: Map<number, number>[],
): number {
  if (candidate.tmdbId == null) return 0;
  const usable = otherAffinityMaps.filter((m) => m.size > 0);
  if (usable.length === 0) {
    return (candidate.tmdbRating ?? 0);
  }
  let sum = 0;
  for (const map of usable) sum += map.get(candidate.tmdbId) ?? 0;
  return sum / usable.length;
}

function roundRobinPick(
  perParticipantSorted: Movie[][],
  budget: number,
): Movie[] {
  if (budget <= 0) return [];
  const out: Movie[] = [];
  const cursors = new Array(perParticipantSorted.length).fill(0);
  let exhausted = 0;
  while (out.length < budget && exhausted < perParticipantSorted.length) {
    exhausted = 0;
    for (let i = 0; i < perParticipantSorted.length && out.length < budget; i++) {
      const c = cursors[i];
      const list = perParticipantSorted[i];
      if (c >= list.length) {
        exhausted++;
        continue;
      }
      out.push(list[c]);
      cursors[i] = c + 1;
    }
  }
  return out;
}

export async function buildGroupPool(
  sessionId: string,
  filters: MovieFilters,
  batchSize: number | null,
  excludeMovieIds: Set<string> = new Set(),
): Promise<Movie[]> {
  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId, leftAt: null },
    select: { userId: true },
  });
  const userIds = participants.map((p) => p.userId).filter((x): x is string => !!x);
  if (userIds.length === 0) return [];

  const pools = await loadParticipantPools(userIds, filters, excludeMovieIds);
  const cap = (arr: Movie[]) => (batchSize != null ? arr.slice(0, batchSize) : arr);

  if (pools.length === 1) {
    return cap(shuffle([...pools[0].watchlist]));
  }

  const idSets = pools.map((p) => new Set(p.watchlist.map((m) => m.id)));
  const intersection = pools[0].watchlist.filter((m) =>
    idSets.slice(1).every((s) => s.has(m.id)),
  );
  const intersectionIds = new Set(intersection.map((m) => m.id));

  const recCache = new Map<number, Promise<{ id: number; vote_average?: number; popularity?: number }[]>>();
  const affinityByUser = new Map<string, Map<number, number>>();
  await Promise.all(
    pools.map(async (p) => {
      const map = await buildAffinityMap(p.seedTmdbIds, recCache);
      affinityByUser.set(p.userId, map);
    }),
  );

  const sortedExclusivesPerOwner = pools.map((owner) => {
    const exclusive = owner.watchlist.filter((m) => !intersectionIds.has(m.id));
    const otherMaps = pools
      .filter((p) => p.userId !== owner.userId)
      .map((p) => affinityByUser.get(p.userId)!)
      .filter((m): m is Map<number, number> => m != null);
    return exclusive
      .map((m) => ({ m, score: scoreCandidate(m, otherMaps) }))
      .sort((a, b) => b.score - a.score)
      .map(({ m }) => m);
  });

  if (batchSize == null) {
    const tier2 = roundRobinPick(sortedExclusivesPerOwner, Number.MAX_SAFE_INTEGER);
    return shuffle([...intersection, ...tier2]);
  }

  const tier2Reserve = Math.max(1, Math.floor(batchSize * TIER_2_RATIO));
  const crossoverCap = Math.max(0, batchSize - tier2Reserve);
  const tier1 = intersection.slice(0, crossoverCap);
  const tier2Budget = batchSize - tier1.length;
  const tier2 = roundRobinPick(sortedExclusivesPerOwner, tier2Budget);

  return shuffle([...tier1, ...tier2]);
}
