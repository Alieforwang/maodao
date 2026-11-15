import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("打包后的主进程可以在 ESM 下加载", () => {
  it("外部 CommonJS 依赖不用具名导入，并且 electron 能把构建结果跑起来", async () => {
    const outdir = fs.mkdtempSync(path.join(os.tmpdir(), "madao-main-"));
    const outfile = path.join(outdir, "main.js");
    await build({
      entryPoints: ["src/main/main.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile,
      external: ["electron"],
      packages: "external",
    });
    const built = path.join(process.cwd(), "dist/main/main.js");
    fs.mkdirSync(path.dirname(built), { recursive: true });
    fs.copyFileSync(outfile, built);
    const bundled = fs.readFileSync(built, "utf8");
    expect(bundled).not.toMatch(/import\s*\{[^}]*\bautoUpdater\b[^}]*\}\s*from\s*["']electron-updater["']/);
    expect(bundled).toMatch(/import \w+ from "electron-updater"/);
    const check = spawnSync(process.execPath, ["scripts/check-esm-imports.mjs", built], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(check.status, `${check.stderr || ""}\n${check.stdout || ""}`).toBe(0);

    const electron = path.join(process.cwd(), "node_modules/electron/dist/electron");
    const launched = spawnSync("xvfb-run", ["-a", electron, "--no-sandbox", "."], {
      cwd: process.cwd(),
      env: { ...process.env, MADAO_SMOKE: "1" },
      encoding: "utf8",
      timeout: 25_000,
    });
    const output = `${launched.stdout || ""}\n${launched.stderr || ""}`;
    expect(output).not.toContain("Named export");
    expect(launched.status, output).toBe(0);
  }, 40_000);
});
