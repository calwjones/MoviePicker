import request from 'supertest';
import app from '../app';

jest.mock('../app', () => {
  const actual = jest.requireActual('../app');
  return {
    __esModule: true,
    default: actual.default,
    prisma: require('../__mocks__/prisma').default,
  };
});

describe('Health Check', () => {
  it('GET /api/health should return ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});
