import "dotenv/config";
import { defineConfig } from "prisma/config";

// Used only by the Prisma CLI (generate / migrate / seed).
// At runtime the Lambda builds its own connection string (see src/lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` doesn't connect, so a missing URL is fine there (e.g. in CI).
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/unset",
  },
});
