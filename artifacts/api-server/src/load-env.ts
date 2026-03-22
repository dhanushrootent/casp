/**
 * Load `.env` before any other imports that read `process.env` (e.g. @workspace/db).
 * `pnpm dev` uses `tsx --env-file=.env`; `pm2` does not, so this keeps parity.
 *
 * Uses `path.dirname(process.argv[1])` so it works in the bundled `dist/index.cjs`
 * (esbuild CJS cannot rely on `import.meta.url`).
 */
import { config } from "dotenv";
import { existsSync } from "fs";
import path from "path";

const mainDir =
  typeof process.argv[1] === "string"
    ? path.dirname(path.resolve(process.argv[1]))
    : process.cwd();

const candidates = [
  path.resolve(mainDir, "../.env"), // dist/index.cjs or src/index.ts → package root
  path.resolve(process.cwd(), ".env"),
];

for (const envPath of candidates) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}
