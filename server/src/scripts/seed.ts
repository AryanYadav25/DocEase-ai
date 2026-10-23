/**
 * Development seed: creates a demo account you can sign in with locally.
 * Refuses to run in production. Credentials are printed once; change them in .env
 * with DEMO_EMAIL / DEMO_PASSWORD if you want different values.
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { hashPassword } from '../services/auth/authService.js';

async function main() {
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to seed a demo account in production.');
    process.exit(1);
  }
  const email = (process.env.DEMO_EMAIL ?? 'demo@docuease.local').toLowerCase();
  const password = process.env.DEMO_PASSWORD ?? 'DemoPass123';
  await connectDatabase();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Demo account already exists: ${email}`);
  } else {
    await User.create({ email, passwordHash: await hashPassword(password), displayName: 'Demo User', emailVerified: true });
    console.log(`Created demo account\n  email:    ${email}\n  password: ${password}`);
  }
  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
