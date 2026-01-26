const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  couple: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  movie: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  userMovie: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    create: jest.fn(),
  },
  swipeSession: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  sessionMovie: {
    findUnique: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
  match: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
};

export default mockPrisma;
