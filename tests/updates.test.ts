import { describe, expect, it } from "vitest";
import {
  canAutoCheck,
  canManualCheck,
  decideUpdatePrompt,
  formatUpdateError,
  reduceUpdateStatus,
  safeUpdateCheck,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_INITIAL_DELAY_MS,
} from "../src/shared/updates.js";
import fs from "node:fs";

describe("自动更新", () => {
  it("开发模式和未打包时不检查，自动检查默认才定时跑", () => {
    expect(canAutoCheck({ dev: true, packaged: true, auto: true })).toBe(false);
    expect(canManualCheck({ dev: true, packaged: true })).toBe(false);
    expect(canAutoCheck({ dev: false, packaged: false, auto: true })).toBe(false);
    expect(canAutoCheck({ dev: false, packaged: true, auto: false })).toBe(false);
    expect(canAutoCheck({ dev: false, packaged: true, auto: true })).toBe(true);
    expect(canManualCheck({ dev: false, packaged: true })).toBe(true);
    expect(UPDATE_INITIAL_DELAY_MS).toBeGreaterThan(0);
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("状态文案覆盖已是最新、发现新版、下载百分比和失败原因", () => {
    expect(reduceUpdateStatus({ type: "not-available" }).message).toBe("已是最新版本");
    expect(reduceUpdateStatus({ type: "available", version: "1.0.3" })).toMatchObject({
      phase: "available",
      message: "发现新版本 1.0.3",
    });
    expect(reduceUpdateStatus({ type: "progress", percent: 41.6 })).toMatchObject({
      phase: "downloading",
      message: "正在下载 42%",
      percent: 42,
    });
    expect(reduceUpdateStatus({ type: "error", message: "net::ERR_INTERNET_DISCONNECTED\nstack" }).message).toBe(
      "检查更新失败：net::ERR_INTERNET_DISCONNECTED",
    );
    expect(formatUpdateError("New version is not signed by the application owner")).toContain("not signed");
    expect(reduceUpdateStatus({ type: "skipped", reason: "dev" }).message).toBe("开发模式不检查更新");
  });

  it("立即重启才安装，稍后留到退出时", () => {
    expect(decideUpdatePrompt("now")).toEqual({ restartNow: true });
    expect(decideUpdatePrompt("later")).toEqual({ restartNow: false });
  });

  it("检查抛错时只返回失败状态，不向外抛", async () => {
    const event = await safeUpdateCheck(async () => {
      throw new Error("ENOTFOUND github.com");
    });
    expect(event?.type).toBe("error");
    await expect(safeUpdateCheck(async () => undefined)).resolves.toBeNull();
  });

  it("发布配置指向公开的 GitHub Releases，且没有 token", () => {
    const config = fs.readFileSync("electron-builder.yml", "utf8");
    expect(config).toMatch(/provider:\s*github/);
    expect(config).toMatch(/owner:\s*Alieforwang/);
    expect(config).toMatch(/repo:\s*maodao/);
    expect(config).toMatch(/artifactName:\s*MaoDao-Setup-\$\{version\}-x64\.\$\{ext\}/);
    expect(config).not.toMatch(/\btoken\s*:/i);
    expect(config).not.toMatch(/ghp_|github_pat_|privateKey/i);
  });
});
