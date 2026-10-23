import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);
// NoSQL-injection defence: every request body/query/param is parsed with a typed Zod
// schema (see middleware/validate.ts), so an object like {"$gt": ""} can never reach a
// query in place of a string. Mongoose's global sanitizeFilter is intentionally not used
// because it would also neutralise the application's own $in/$ne filters.

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  logger.info({ db: conn.connection.name, host: conn.connection.host }, 'MongoDB connected');
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
