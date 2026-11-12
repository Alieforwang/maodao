import { build } from "esbuild";
import { build as viteBuild } from "vite";

await viteBuild({ configFile: "vite.config.ts" });
await build({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/main/main.js",
  external: ["electron"],
  packages: "external",
  sourcemap: true,
});
await build({
  entryPoints: ["src/main/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/main/preload.cjs",
  external: ["electron"],
});
