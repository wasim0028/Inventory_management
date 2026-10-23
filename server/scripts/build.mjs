// Bundles the Lambda into dist/index.mjs (one file, no node_modules needed).
import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/lambda.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: true,
  sourcemap: true,
  // The AWS SDK v3 ships with the Lambda Node.js runtime.
  external: ["@aws-sdk/*"],
  // Lets bundled CommonJS dependencies call require() inside an ES module.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});
