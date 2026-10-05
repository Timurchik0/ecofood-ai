import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // драйверы БД не бандлим: pg — нативный/CJS, PGlite — WASM (используется только локально)
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
};

export default nextConfig;
