import type { UpdateStatus } from "./types.js";

/** Let the window appear before the first network check. */
export const UPDATE_INITIAL_DELAY_MS = 20_000;
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const INITIAL_UPDATE_STATUS: UpdateStatus = {
  phase: "idle",
  message: "尚未检查",
};

export interface UpdateGate {
  dev: boolean;
  packaged: boolean;
  auto: boolean;
}

export function canAutoCheck(gate: UpdateGate): boolean {
  return gate.packaged && !gate.dev && gate.auto;
}

export function canManualCheck(gate: Pick<UpdateGate, "dev" | "packaged">): boolean {
  return gate.packaged && !gate.dev;
}

export type UpdateEvent =
  | { type: "checking" }
  | { type: "not-available" }
  | { type: "available"; version: string }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string }
  | { type: "skipped"; reason: "dev" | "disabled" };

export function reduceUpdateStatus(event: UpdateEvent): UpdateStatus {
  switch (event.type) {
    case "checking":
      return { phase: "checking", message: "正在检查更新…" };
    case "not-available":
      return { phase: "latest", message: "已是最新版本" };
    case "available":
      return { phase: "available", message: `发现新版本 ${event.version}`, version: event.version };
    case "progress": {
      const percent = clampPercent(event.percent);
      return { phase: "downloading", message: `正在下载 ${percent}%`, percent, version: undefined };
    }
    case "downloaded":
      return { phase: "downloaded", message: `新版本 ${event.version} 已下载。可以选择立即重启，或退出时安装。`, version: event.version };
    case "error":
      return { phase: "error", message: formatUpdateError(event.message) };
    case "skipped":
      return {
        phase: "idle",
        message: event.reason === "dev" ? "开发模式不检查更新" : "已关闭自动检查",
      };
  }
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function formatUpdateError(message: string): string {
  const line = message.split(/\r?\n/).map((part) => part.trim()).find(Boolean) || "未知错误";
  return `检查更新失败：${line.slice(0, 180)}`;
}

export function decideUpdatePrompt(choice: "now" | "later"): { restartNow: boolean } {
  return { restartNow: choice === "now" };
}

/** A failed check must not escape into the rest of the app. */
export async function safeUpdateCheck(check: () => Promise<unknown>): Promise<UpdateEvent | null> {
  try {
    await check();
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { type: "error", message };
  }
}
