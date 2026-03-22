/**
 * PM2: loads `.env` via `load-env.ts` inside the bundle, but `cwd` must be this
 * directory so `process.cwd()/.env` resolves when the first candidate path differs.
 *
 * Usage (from this folder):
 *   pnpm run build
 *   pm2 start ecosystem.config.cjs
 */
const path = require("path");

module.exports = {
  apps: [
    {
      name: "api",
      script: path.join(__dirname, "dist", "index.cjs"),
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
