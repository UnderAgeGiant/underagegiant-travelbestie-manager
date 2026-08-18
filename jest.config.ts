import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: { '^@src/(.*)$': '<rootDir>/src/$1' },
  clearMocks: true,
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
};

export default config;
