import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['lms'],
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/tu_online' },
});
