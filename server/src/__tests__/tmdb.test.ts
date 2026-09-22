import {
  searchMovie,
  getMovieDetails,
  getWatchProviders,
  getTmdbRecommendations,
  pickTrailerKey,
  findOrCreateMovie,
  isMovieStale,
  refreshIfStale,
} from '../services/tmdb';
import { resetTmdbClientState } from '../services/tmdbClient';
import { prisma } from '../app';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock prisma for findOrCreateMovie
jest.mock('../app', () => ({
  prisma: {
    movie: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('TMDb Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetTmdbClientState();
    process.env.TMDB_API_KEY = 'test-api-key';
  });

  describe('searchMovie', () => {
    it('should return the first search result', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [
            { id: 550, title: 'Fight Club', release_date: '1999-10-15', vote_average: 8.4 },
            { id: 551, title: 'Fight Club 2', release_date: '2020-01-01' },
          ],
        }),
      });

      const result = await searchMovie('Fight Club', 1999);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(550);
      expect(result!.title).toBe('Fight Club');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain('search/movie');
      expect(mockFetch.mock.calls[0][0]).toContain('query=Fight+Club');
    });

    it('should return null if no results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await searchMovie('Nonexistent Movie');
      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const result = await searchMovie('Fight Club');
      expect(result).toBeNull();
    });
  });

  describe('getMovieDetails', () => {
    it('should return movie details with credits', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 550,
          title: 'Fight Club',
          release_date: '1999-10-15',
          overview: 'An insomniac office worker...',
          genres: [{ id: 18, name: 'Drama' }],
          runtime: 139,
          vote_average: 8.4,
          credits: {
            crew: [{ job: 'Director', name: 'David Fincher' }],
            cast: [
              { name: 'Brad Pitt', order: 0 },
              { name: 'Edward Norton', order: 1 },
            ],
          },
        }),
      });

      const result = await getMovieDetails(550);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Fight Club');
      expect(result!.credits?.crew?.[0].name).toBe('David Fincher');
    });

    it('should return null on API error', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const result = await getMovieDetails(99999);
      expect(result).toBeNull();
    });
  });

  describe('getWatchProviders', () => {
    it('should return UK providers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: {
            GB: {
              flatrate: [
                { provider_name: 'Netflix', logo_path: '/netflix.png' },
              ],
              rent: [
                { provider_name: 'Amazon Video', logo_path: '/amazon.png' },
              ],
            },
            US: {
              flatrate: [{ provider_name: 'Hulu', logo_path: '/hulu.png' }],
            },
          },
        }),
      });

      const result = await getWatchProviders(550);

      expect(result).toBeDefined();
      expect(result!.GB).toBeDefined();
      expect(result!.GB!.flatrate).toHaveLength(1);
      expect(result!.GB!.flatrate![0].provider_name).toBe('Netflix');
    });

    it('should return empty object on API error', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const result = await getWatchProviders(99999);
      expect(result).toEqual({});
    });
  });

  describe('getMovieDetails request shape', () => {
    it('fetches credits, providers and videos in one request', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1, title: 'X' }) });
      await getMovieDetails(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(decodeURIComponent(mockFetch.mock.calls[0][0])).toContain('append_to_response=credits,watch/providers,videos');
    });
  });

  describe('transport', () => {
    it('retries a 429 and succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => '0' } })
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ results: [{ id: 7, title: 'Se7en' }] }) });
      const recs = await getTmdbRecommendations(807);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(recs[0].id).toBe(7);
    });

    it('retries a network error and succeeds', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ results: [{ id: 8, title: 'Heat' }] }) });
      const recs = await getTmdbRecommendations(949);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(recs[0].id).toBe(8);
    });

    it('does not retry a 404', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      expect(await getMovieDetails(424242)).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('serves repeat requests from cache', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ results: [{ id: 1, title: 'A' }] }) });
      await getTmdbRecommendations(603);
      await getTmdbRecommendations(603);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('collapses concurrent identical requests into one fetch', async () => {
      let resolve: (v: unknown) => void = () => {};
      mockFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
      const a = getTmdbRecommendations(155);
      const b = getTmdbRecommendations(155);
      resolve({ ok: true, json: () => Promise.resolve({ results: [{ id: 2, title: 'B' }] }) });
      const [ra, rb] = await Promise.all([a, b]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(ra).toEqual(rb);
    });

    it('caps the number of simultaneous requests', async () => {
      let inFlight = 0;
      let peak = 0;
      mockFetch.mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { ok: true, json: () => Promise.resolve({ results: [] }) };
      });
      await Promise.all(Array.from({ length: 30 }, (_, i) => getTmdbRecommendations(10_000 + i)));
      expect(mockFetch).toHaveBeenCalledTimes(30);
      expect(peak).toBeLessThanOrEqual(12);
    });
  });

  describe('searchMovie year fallback', () => {
    it('accepts a result one year off when the exact year finds nothing', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            results: [
              { id: 1, title: 'Parasite', release_date: '1982-01-01' },
              { id: 496243, title: 'Parasite', release_date: '2019-05-30' },
            ],
          }),
        });
      const result = await searchMovie('Parasite', 2020);
      expect(result?.id).toBe(496243);
    });

    it('rejects results far from the requested year', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [{ id: 1, title: 'Parasite', release_date: '1982-01-01' }] }),
        });
      expect(await searchMovie('Parasite', 2020)).toBeNull();
    });
  });

  describe('pickTrailerKey', () => {
    it('prefers official YouTube trailers over teasers and clips', () => {
      expect(pickTrailerKey([
        { key: 'clip', site: 'YouTube', type: 'Clip', official: true },
        { key: 'teaser', site: 'YouTube', type: 'Teaser', official: true },
        { key: 'fan', site: 'YouTube', type: 'Trailer', official: false },
        { key: 'vimeo', site: 'Vimeo', type: 'Trailer', official: true },
        { key: 'best', site: 'YouTube', type: 'Trailer', official: true },
      ])).toBe('best');
    });

    it('returns null when nothing usable exists', () => {
      expect(pickTrailerKey([{ key: 'c', site: 'YouTube', type: 'Featurette' }])).toBeNull();
      expect(pickTrailerKey(undefined)).toBeNull();
    });
  });

  describe('findOrCreateMovie', () => {
    it('uses an exact title+year match from the database without calling TMDB', async () => {
      const local = { id: 'm1', tmdbId: 550, title: 'Fight Club', year: 1999 };
      (prisma.movie.findFirst as jest.Mock).mockResolvedValue(local);
      const movie = await findOrCreateMovie('Fight Club', 1999);
      expect(movie).toBe(local);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('creates the movie with providers and trailer from one detail request', async () => {
      (prisma.movie.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.movie.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.movie.upsert as jest.Mock).mockImplementation(({ create }) => Promise.resolve({ id: 'new', ...create }));
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [{ id: 27205, title: 'Inception' }] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: 27205,
            title: 'Inception',
            release_date: '2010-07-15',
            credits: { crew: [{ job: 'Director', name: 'Christopher Nolan' }], cast: [] },
            'watch/providers': { results: { GB: { flatrate: [{ provider_name: 'Netflix', logo_path: '/n.png' }] } } },
            videos: { results: [{ key: 'YoHD9XEInc0', site: 'YouTube', type: 'Trailer', official: true }] },
          }),
        });

      const movie = await findOrCreateMovie('Inception', 2010);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(movie).toMatchObject({
        tmdbId: 27205,
        director: 'Christopher Nolan',
        trailerKey: 'YoHD9XEInc0',
        streamingProviders: [{ name: 'Netflix', type: 'stream', logoUrl: 'https://image.tmdb.org/t/p/w92/n.png' }],
      });
    });
  });

  describe('isMovieStale', () => {
    it('treats never-synced and week-old rows as stale', () => {
      expect(isMovieStale({ tmdbSyncedAt: null })).toBe(true);
      expect(isMovieStale({ tmdbSyncedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })).toBe(true);
      expect(isMovieStale({ tmdbSyncedAt: new Date() })).toBe(false);
    });
  });

  describe('refreshIfStale', () => {
    const stale = { id: 'm1', tmdbId: 1, title: 'Old', tmdbSyncedAt: null } as unknown as Parameters<typeof refreshIfStale>[0];

    it('returns fresh data when TMDB answers quickly', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1, title: 'Old', videos: { results: [{ key: 'k', site: 'YouTube', type: 'Trailer', official: true }] } }) });
      (prisma.movie.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...stale, ...data }));
      const movie = await refreshIfStale(stale);
      expect(movie.trailerKey).toBe('k');
    });

    it('falls back to the stored row when TMDB is slow', async () => {
      mockFetch.mockReturnValue(new Promise(() => {}));
      const t0 = Date.now();
      const movie = await refreshIfStale(stale, 50);
      expect(movie).toBe(stale);
      expect(Date.now() - t0).toBeLessThan(1000);
    });
  });
});
