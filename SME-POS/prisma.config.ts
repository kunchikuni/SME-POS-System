import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // NOTE: this must live inside `migrations`, not as a top-level `seed`
    // key -- Prisma 7's PrismaConfig type doesn't have one (a documented
    // Prisma issue: a top-level `seed` throws TS2353 under `tsc --noEmit`,
    // which this project's own `build` script runs). package.json's
    // `"prisma": { "seed": ... }` is deprecated as of v7 and is not read
    // once a prisma.config.ts exists -- this is the only place seeding is
    // actually configured now.
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
