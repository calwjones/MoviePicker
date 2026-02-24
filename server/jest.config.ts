import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  transformIgnorePatterns: [
    'node_modules/(?!uuid)',
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': ['ts-jest', { useESM: false }],
  },
  moduleNameMapper: {
    '^uuid$': '<rootDir>/node_modules/uuid/dist-node/index.js',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
  ],
};

export default config;
