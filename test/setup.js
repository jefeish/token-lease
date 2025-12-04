// Test setup file
process.env.NODE_ENV = 'test';

// Mock console.log to reduce noise during tests unless debugging
const originalLog = console.log;
const originalError = console.error;

beforeAll(() => {
  if (!process.env.DEBUG_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
});

// Global test timeout
jest.setTimeout(10000);