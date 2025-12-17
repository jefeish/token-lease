// Test setup file
process.env.NODE_ENV = 'test';

// Ensure global test timeout
jest.setTimeout(15000);

// Mock console output to reduce noise during tests unless debugging
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  if (!process.env.DEBUG_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  }
});

afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
});