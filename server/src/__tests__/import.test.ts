import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import mockPrisma from '../__mocks__/prisma';
import { findOrCreateMovie } from '../services/tmdb';

jest.mock('../app', () => {
  const actual = jest.requireActual('../app');
  return {
    __esModule: true,
    default: actual.default,
    prisma: require('../__mocks__/prisma').default,
  };
});

jest.mock('../services/tmdb', () => ({
  ...jest.requireActual('../services/tmdb'),
  findOrCreateMovie: jest.fn(),
}));

const mockFind = findOrCreateMovie as jest.Mock;
const token = jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET as string);

function csv(rows: string[]): Buffer {
  // Letterboxd exports carry a UTF-8 BOM, which used to hide the "Date" header.
  return Buffer.from(`\uFEFFDate,Name,Year,Letterboxd URI\n${rows.join('\n')}\n`, 'utf-8');
}

describe('POST /api/import/watchlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.userMovie.upsert.mockResolvedValue({ onWatchlist: true, watched: false });
  });

  it('imports new titles, skips ones already on the watchlist, and counts misses', async () => {
    mockPrisma.userMovie.findMany.mockResolvedValue([
      { movieId: 'm-known', onWatchlist: true, watched: false },
    ]);
    mockFind.mockImplementation(async (title: string) => {
      if (title === 'Heat') return { id: 'm-heat' };
      if (title === 'Alien') return { id: 'm-known' };
      return null;
    });

    const res = await request(app)
      .post('/api/import/watchlist')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', csv([
        '2024-01-01,Heat,1995,https://boxd.it/a',
        '2024-01-02,Alien,1979,https://boxd.it/b',
        '2024-01-03,Nope Not Real,2099,https://boxd.it/c',
        '2024-01-04,Heat,1995,https://boxd.it/a',
      ]), 'watchlist.csv');

    expect(res.status).toBe(200);
    expect(res.body.results).toMatchObject({ total: 4, imported: 1, skipped: 2, failed: 1 });
    expect(res.body.results.errors[0]).toContain('Nope Not Real');
    expect(mockFind).toHaveBeenCalledWith('Heat', 1995);
    // Existing library rows are loaded once, not per row.
    expect(mockPrisma.userMovie.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.userMovie.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects files that are not Letterboxd exports', async () => {
    const res = await request(app)
      .post('/api/import/watchlist')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('foo,bar\n1,2\n'), 'other.csv');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing expected columns/i);
  });
});
