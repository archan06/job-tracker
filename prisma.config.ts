import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads .env.local; load it here too so the Prisma CLI sees the same values.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Pooled URLs (Neon "-pooler") can't run migrations, so prefer the direct one.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
