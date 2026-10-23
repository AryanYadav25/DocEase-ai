/**
 * Test setup. Tests run against a real MongoDB-compatible server given by
 * TEST_MONGODB_URI (default: a separate "docuease_test" database on the local
 * instance) with the mock AI provider, so no external services or keys are needed.
 */
process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'mock';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/docuease_test';
process.env.STORAGE_DIR = './storage-test';
process.env.TMP_DIR = './storage-test/tmp';
process.env.LOG_LEVEL = 'silent';
