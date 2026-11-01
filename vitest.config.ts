import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd (the real Workers runtime) with a local D1 database.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    resolve: {
      alias: { "@shared": path.resolve(import.meta.dirname, "./shared") },
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Tests set auth explicitly; never inherit a developer's .dev.vars.
            DEV_AUTH_EMAIL: "",
            ACCESS_TEAM_DOMAIN: "",
            ACCESS_AUD: "",
            ALLOWED_EMAILS: "",
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
