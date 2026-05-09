module.exports = {
  testEnvironment: 'node',
  // 只匹配 backend/src/__tests__ 下的测试文件
  testMatch: ['<rootDir>/src/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/__tests__/**'],
  coverageDirectory: 'coverage',
  modulePathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/../frontend/'],
  testTimeout: 10000,
  setupFiles: ['<rootDir>/jest.setup.js'],
};
