import { dialog } from "electron";
import { autoUpdater } from "electron-updater";
import {
  canAutoCheck,
  canManualCheck,
  decideUpdatePrompt,
  reduceUpdateStatus,
  safeUpdateCheck,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_INITIAL_DELAY_MS,
  type UpdateEvent,
  type UpdateGate,
} from "../shared/updates.js";
import type { UpdateStatus } from "../shared/types.js";
import { logInfo } from "./log.js";

export class AppUpdater {
  private status: UpdateStatus = { phase: "idle", message: "尚未检查" };
  private delayTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;
  private checking = false;
  private promptedVersion = "";
  private readonly onChange: (status: UpdateStatus) => void;
  private readonly gate: () => UpdateGate;
  private readonly markQuitting: () => void;

  constructor(options: {
    onChange: (status: UpdateStatus) => void;
    gate: () => UpdateGate;
    markQuitting: () => void;
  }) {
    this.onChange = options.onChange;
    this.gate = options.gate;
    this.markQuitting = options.markQuitting;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };
    autoUpdater.on("checking-for-update", () => this.apply({ type: "checking" }));
    autoUpdater.on("update-available", (info) => this.apply({ type: "available", version: info.version }));
    autoUpdater.on("update-not-available", () => this.apply({ type: "not-available" }));
    autoUpdater.on("download-progress", (progress) => this.apply({ type: "progress", percent: progress.percent }));
    autoUpdater.on("update-downloaded", (info) => {
      this.apply({ type: "downloaded", version: info.version });
      void this.prompt(info.version);
    });
    autoUpdater.on("error", (error) => {
      this.apply({ type: "error", message: error instanceof Error ? error.message : String(error) });
    });
  }

  current(): UpdateStatus {
    return this.status;
  }

  start(): void {
    this.schedule();
  }

  schedule(): void {
    this.clearTimers();
    if (!canAutoCheck(this.gate())) {
      if (!this.gate().packaged || this.gate().dev) this.apply({ type: "skipped", reason: "dev" });
      return;
    }
    this.delayTimer = setTimeout(() => {
      void this.check();
      this.intervalTimer = setInterval(() => void this.check(), UPDATE_CHECK_INTERVAL_MS);
    }, UPDATE_INITIAL_DELAY_MS);
  }

  async check(): Promise<UpdateStatus> {
    const gate = this.gate();
    if (!canManualCheck(gate)) {
      this.apply({ type: "skipped", reason: "dev" });
      return this.status;
    }
    if (this.checking) return this.status;
    this.checking = true;
    const failure = await safeUpdateCheck(() => autoUpdater.checkForUpdates());
    this.checking = false;
    if (failure) this.apply(failure);
    return this.status;
  }

  installNow(): void {
    this.markQuitting();
    autoUpdater.quitAndInstall(false, true);
  }

  stop(): void {
    this.clearTimers();
  }

  private async prompt(version: string): Promise<void> {
    if (this.promptedVersion === version) return;
    this.promptedVersion = version;
    try {
      const choice = await dialog.showMessageBox({
        type: "info",
        buttons: ["立即重启更新", "稍后"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: "码到",
        message: `新版本 ${version} 已下载`,
        detail: "立即重启以完成更新，或稍后在退出码到时安装。",
      });
      if (decideUpdatePrompt(choice.response === 0 ? "now" : "later").restartNow) this.installNow();
    } catch (error) {
      logInfo("更新提示没有弹出", { message: error instanceof Error ? error.message : "error" });
    }
  }

  private apply(event: UpdateEvent): void {
    const next = reduceUpdateStatus(event);
    if (event.type === "progress" && this.status.version) next.version = this.status.version;
    this.status = next;
    this.onChange(this.status);
    if (event.type === "error") logInfo("检查更新失败", { message: next.message });
  }

  private clearTimers(): void {
    if (this.delayTimer) clearTimeout(this.delayTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.delayTimer = undefined;
    this.intervalTimer = undefined;
  }
}
