module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/__tests__/**'],
  coverageDirectory: 'coverage',
  modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
  testTimeout: 10000,
  setupFiles: ['<rootDir>/jest.setup.js'],
};
