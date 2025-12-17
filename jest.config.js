module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.js'
  ],
  collectCoverageFrom: [
    'token-lease.js',
    'index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/test/setup.js'
  ],
  testTimeout: 15000,
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};