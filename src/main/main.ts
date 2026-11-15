import { app, BrowserWindow, clipboard, ipcMain, nativeTheme, screen, shell, Tray, Menu } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccountStore } from "./store.js";
import { createSecretBox } from "./secretBox.js";
import { MailMonitor, type NotifyEvent } from "./monitor.js";
import { OutlookLogin, type OAuthEvent } from "./oauth.js";
import { isCopyReason, type AccountStatus, type AppState, type HistoryItem, type ToastPayload } from "../shared/types.js";
import { logInfo } from "./log.js";
import { runHarness } from "./harness.js";
import { AppUpdater } from "./updater.js";
import { INITIAL_UPDATE_STATUS } from "../shared/updates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.MADAO_DEV === "1";
const e2e = process.env.MADAO_E2E === "1";
if (e2e) app.setPath("userData", process.env.MADAO_USER_DATA || path.join(os.tmpdir(), "madao-e2e"));

let mainWindow: BrowserWindow | null = null;
let toastWindow: BrowserWindow | null = null;
let trayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let paused = false;
let latestToast: ToastPayload | null = null;
const toastQueue: ToastPayload[] = [];
let toastOpen = false;
let login: OutlookLogin | null = null;
const statuses = new Map<string, AccountStatus>();

let store!: AccountStore;
let monitor!: MailMonitor;
let updater: AppUpdater | undefined;
let updateStatus = INITIAL_UPDATE_STATUS;
function createMonitor(): MailMonitor {
  return new MailMonitor({
  getAccounts: () => store.accounts,
  getSecret: (id) => store.getSecret(id),
  replaceSecret: (id, secret) => store.replaceSecret(id, secret),
  getSettings: () => store.settings,
  hasSeen: (id) => store.hasSeen(id),
  remember: (id) => store.remember(id),
  onStatus: (status) => {
    statuses.set(status.accountId, status);
    broadcast();
  },
  onNotify: (event) => deliver(event),
  });
}

function theme(): "light" | "dark" {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function snapshot(): AppState {
  return {
    theme: theme(),
    accounts: store.accounts,
    statuses: store.accounts.map((account) => statuses.get(account.id) || { accountId: account.id, state: account.enabled ? "connecting" : "disabled", detail: "" }),
    history: store.history,
    settings: store.settings,
    encryptionAvailable: store.encryptionAvailable,
    paused,
    version: app.getVersion(),
    e2e,
    update: updateStatus,
  };
}

function broadcast(): void {
  const state = snapshot();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("state", state);
  }
}

function load(win: BrowserWindow, hash: string): void {
  if (isDev) void win.loadURL(`http://127.0.0.1:45941/#/${hash}`);
  else void win.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: `/${hash}` });
}

function preloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function createMain(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 980,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: theme() === "dark" ? "#202020" : "#f3f3f3",
    title: "码到",
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  load(win, "main");
  return win;
}

function showToast(payload: ToastPayload): void {
  latestToast = payload;
  if (!toastWindow || toastWindow.isDestroyed()) {
    toastWindow = new BrowserWindow({
      width: 380,
      height: 268,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      show: false,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    toastWindow.setAlwaysOnTop(true, "screen-saver");
    load(toastWindow, "toast");
    toastWindow.once("ready-to-show", () => placeToast());
  }
  const reveal = () => {
    placeToast();
    toastWindow?.webContents.send("toast", payload);
    toastWindow?.showInactive();
    toastOpen = true;
  };
  if (toastWindow.webContents.isLoading()) toastWindow.webContents.once("did-finish-load", reveal);
  else reveal();
}

function placeToast(): void {
  if (!toastWindow) return;
  const area = screen.getPrimaryDisplay().workArea;
  const width = 380;
  const height = 268;
  toastWindow.setBounds({
    x: Math.round(area.x + area.width - width - 12),
    y: Math.round(area.y + area.height - height - 12),
    width,
    height,
  });
}

function dismissToast(): void {
  toastOpen = false;
  latestToast = null;
  if (toastWindow && !toastWindow.isDestroyed()) toastWindow.hide();
  const next = toastQueue.shift();
  if (next) showToast(next);
}

function deliver(event: NotifyEvent): void {
  if (event.code) {
    const item: HistoryItem = {
      id: event.messageId,
      accountId: event.accountId,
      email: event.email,
      code: event.code,
      service: event.service,
      subject: event.subject,
      from: event.from,
      messageId: event.messageId,
      receivedAt: event.receivedAt,
    };
    store.addHistory(item);
  }
  const payload: ToastPayload = {
    id: event.messageId,
    code: event.code,
    service: event.service,
    subject: event.subject,
    email: event.email,
    sound: store.settings.sound && !e2e,
    seconds: store.settings.notificationSeconds,
  };
  broadcast();
  refreshTrayMenu();
  if (toastOpen) toastQueue.push(payload);
  else showToast(payload);
}

function toggleTrayWindow(): void {
  if (!trayWindow || trayWindow.isDestroyed()) {
    trayWindow = new BrowserWindow({
      width: 376,
      height: 560,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    trayWindow.on("blur", () => trayWindow?.hide());
    load(trayWindow, "tray");
  }
  if (trayWindow.isVisible()) {
    trayWindow.hide();
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  const bounds = tray?.getBounds();
  const width = 376;
  const height = 560;
  const x = bounds ? Math.round(bounds.x + bounds.width - width) : area.x + area.width - width - 12;
  const y = bounds ? Math.round(bounds.y - height - 8) : area.y + area.height - height - 12;
  trayWindow.setBounds({
    x: Math.min(Math.max(area.x, x), area.x + area.width - width),
    y: Math.max(area.y, y),
    width,
    height,
  });
  trayWindow.show();
  trayWindow.focus();
}

function refreshTrayMenu(): void {
  if (!tray) return;
  const listening = [...statuses.values()].filter((status) => status.state === "listening" || status.state === "polling").length;
  tray.setToolTip(paused ? "码到 — 已暂停" : `码到 — ${listening} 个邮箱在监听`);
}

function iconFile(): string {
  const candidates = [
    path.join(process.resourcesPath, "icon.png"),
    path.join(app.getAppPath(), "resources", "icon.png"),
    path.join(__dirname, "../../resources/icon.png"),
  ];
  return candidates.find((item) => fs.existsSync(item)) || candidates[0];
}

function createTray(): void {
  const icon = iconFile();
  try {
    tray = new Tray(icon);
  } catch (error) {
    logInfo("托盘图标不可用", { message: error instanceof Error ? error.message : "error" });
    return;
  }
  tray.on("click", () => toggleTrayWindow());
  tray.on("right-click", () => toggleTrayWindow());
  refreshTrayMenu();
  Menu.setApplicationMenu(null);
}

function wireIpc(): void {
  ipcMain.handle("state", () => snapshot());
  ipcMain.handle("account-save", (_event, draft) => {
    try {
      store.saveAccount(draft);
      monitor.sync();
      broadcast();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "没能保存账号。" };
    }
  });
  ipcMain.handle("account-delete", (_event, id: string) => {
    store.deleteAccount(id);
    statuses.delete(id);
    monitor.sync();
    broadcast();
  });
  ipcMain.handle("account-enabled", (_event, id: string, enabled: boolean) => {
    store.setEnabled(id, enabled);
    monitor.sync();
    broadcast();
  });
  ipcMain.handle("settings", (_event, patch) => {
    const settings = store.updateSettings(patch);
    applyLogin(settings.openAtLogin);
    if ("autoCheckUpdates" in patch) updater?.schedule();
    broadcast();
    return settings;
  });
  ipcMain.handle("history-clear", () => {
    store.clearHistory();
    broadcast();
  });
  ipcMain.handle("paused", (_event, next: boolean) => {
    paused = next;
    monitor.setPaused(paused);
    refreshTrayMenu();
    broadcast();
  });
  ipcMain.handle("copy-code", (_event, code: unknown, reason: unknown) => {
    if (!isCopyReason(reason) || typeof code !== "string" || !/^[A-Za-z0-9]{4,8}$/.test(code)) return "";
    clipboard.writeText(code);
    logInfo("已按用户操作复制验证码", { reason, length: code.length });
    return clipboard.readText();
  });
  ipcMain.handle("copy-text", (_event, text: unknown) => {
    if (typeof text !== "string" || !text.trim() || text.length > 80) return "";
    clipboard.writeText(text.trim());
    return clipboard.readText();
  });
  ipcMain.handle("open-external", (_event, url: unknown) => {
    if (typeof url === "string" && /^https:\/\//i.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle("window", (_event, action: string) => {
    if (action === "quit") {
      quitting = true;
      app.quit();
      return;
    }
    if (action === "show") {
      mainWindow?.show();
      mainWindow?.focus();
      trayWindow?.hide();
      return;
    }
    if (!mainWindow) return;
    if (action === "minimize") mainWindow.minimize();
    if (action === "maximize") mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    if (action === "close") mainWindow.hide();
  });
  ipcMain.handle("update-check", () => updater?.check() ?? updateStatus);
  ipcMain.handle("update-install", () => updater?.installNow());
  ipcMain.handle("toast-current", () => latestToast);
  ipcMain.handle("toast-dismiss", () => dismissToast());
  ipcMain.handle("oauth-cancel", () => login?.cancel());
  ipcMain.handle("oauth-start", async (_event, mode: "pkce" | "device") => {
    login?.cancel();
    login = new OutlookLogin();
    const send = (event: OAuthEvent) => {
      mainWindow?.webContents.send("oauth", event);
      broadcast();
    };
    try {
      const tokens = mode === "device"
        ? await login.device(store.settings, send)
        : await login.pkce(store.settings, (url) => void shell.openExternal(url), send);
      if (!tokens.email) throw new Error("登录成功，但没有拿到邮箱地址。");
      const account = store.saveOAuthAccount({
        email: tokens.email || "",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      });
      monitor.sync();
      broadcast();
      send({ type: "success", email: account.email });
    } catch (error) {
      send({ type: "error", message: error instanceof Error ? error.message : "登录失败。" });
    }
  });
}

function applyLogin(openAtLogin: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin, openAsHidden: true, args: ["--hidden"] });
  } catch (error) {
    logInfo("开机自启设置失败", { message: error instanceof Error ? error.message : "error" });
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on("second-instance", () => {
  mainWindow?.show();
  mainWindow?.focus();
});

app.on("before-quit", () => {
  quitting = true;
  monitor?.stopAll();
});

if (gotLock) app.whenReady().then(async () => {
  app.setAppUserModelId("app.madao.desktop");
  store = new AccountStore(path.join(app.getPath("userData"), "madao"), createSecretBox());
  monitor = createMonitor();
  store.load();
  if (e2e) nativeTheme.themeSource = "light";
  wireIpc();
  nativeTheme.on("updated", broadcast);
  mainWindow = createMain();
  createTray();
  applyLogin(store.settings.openAtLogin);
  const hidden = process.argv.includes("--hidden") || (store.settings.startMinimized && !e2e);
  if (!hidden) mainWindow.show();
  monitor.sync();
  updater = new AppUpdater({
    onChange: (status) => {
      updateStatus = status;
      broadcast();
    },
    gate: () => ({
      dev: isDev || e2e,
      packaged: app.isPackaged,
      auto: store.settings.autoCheckUpdates,
    }),
    markQuitting: () => {
      quitting = true;
    },
  });
  updater.start();
  if (e2e) {
    try {
      await runHarness({
        store,
        monitor,
        clipboard,
        getMain: () => mainWindow!,
        waitToast: async () => {
          const started = Date.now();
          while (Date.now() - started < 40_000) {
            if (toastWindow && !toastWindow.isDestroyed() && toastOpen) return toastWindow;
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          throw new Error("通知窗口没有出现");
        },
        statuses: () => [...statuses.values()],
      });
      quitting = true;
      app.exit(0);
    } catch (error) {
      logInfo("端到端失败", { message: error instanceof Error ? error.message : "error" });
      quitting = true;
      app.exit(1);
    }
  }
}).catch((error) => {
  logInfo("启动失败", { message: error instanceof Error ? error.message : "error" });
  app.exit(1);
});
