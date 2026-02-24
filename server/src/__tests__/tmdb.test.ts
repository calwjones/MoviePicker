import { searchMovie, getMovieDetails, getWatchProviders } from '../services/tmdb';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock prisma for findOrCreateMovie
jest.mock('../app', () => ({
  prisma: {
    movie: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe('TMDb Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
