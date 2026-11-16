import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, nativeImage, nativeTheme, screen, shell, Tray, Menu } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccountStore } from "./store.js";
import { createSecretBox } from "./secretBox.js";
import { MailMonitor, type NotifyEvent } from "./monitor.js";
import { OutlookLogin, readJwtClaims, type OAuthEvent, type OAuthStartOptions, type OAuthTokens } from "./oauth.js";
import { chooseSavedMailbox, findDuplicateOutlook, mapOutlookFailure, readIdentity } from "../shared/outlookMailbox.js";
import { PROVIDERS } from "../shared/presets.js";
import { verifyOutlookMailbox } from "./outlookVerify.js";
import { requestAiVerdict, statusLine } from "../shared/aiRecognize.js";
import { toRedactedFixture } from "../shared/fixtureExport.js";
import { isCopyReason, type AccountStatus, type AppState, type HistoryItem, type ToastPayload } from "../shared/types.js";
import { logInfo } from "./log.js";
import { runHarness } from "./harness.js";
import { AppUpdater } from "./updater.js";
import { openEmbeddedOutlookLogin } from "./outlookWindow.js";
import { INITIAL_UPDATE_STATUS } from "../shared/updates.js";
import { classifySpam } from "../shared/spam.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.MADAO_DEV === "1";
const e2e = process.env.MADAO_E2E === "1";
const smoke = process.env.MADAO_SMOKE === "1";
if (e2e) app.setPath("userData", process.env.MADAO_USER_DATA || path.join(os.tmpdir(), "madao-e2e"));

let mainWindow: BrowserWindow | null = null;
let toastWindow: BrowserWindow | null = null;
let trayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let paused = false;
let latestToast: ToastPayload | null = null;
const toastMail = new Map<string, { from: string; subject: string; text: string; html?: string; recipient?: string; expected: string | null; kind: "code" | "link" | "none" }>();
const toastQueue: ToastPayload[] = [];
let toastOpen = false;
let login: OutlookLogin | null = null;
let oauthGeneration = 0;
let mailboxWait: { resolve: (email: string) => void; reject: (error: Error) => void } | null = null;
const statuses = new Map<string, AccountStatus>();

let store!: AccountStore;
let monitor!: MailMonitor;
let updater: AppUpdater | undefined;
let updateStatus = INITIAL_UPDATE_STATUS;
let aiStatus = "未启用";
function createMonitor(): MailMonitor {
  return new MailMonitor({
  getAccounts: () => store.accounts,
  getSecret: (id) => store.getSecret(id),
  replaceSecret: (id, secret) => store.replaceSecret(id, secret),
  getSettings: () => store.settings,
  getAiKey: () => store.getAiKey(),
  hasSeen: (id) => store.hasSeen(id),
  remember: (id) => store.remember(id),
  onStatus: (status) => {
    const previous = statuses.get(status.accountId);
    statuses.set(status.accountId, status);
    broadcast();
    refreshTrayMenu();
    // 登录失效只在状态刚翻转的那一刻主动弹一次，之后靠托盘角标和主窗口总览持续提醒，不反复打扰。
    if (status.state === "auth_failed" && previous?.state !== "auth_failed" && !e2e) {
      const account = store.accounts.find((item) => item.id === status.accountId);
      if (account) sendAuthAlert(account.email, status.detail);
    }
  },
  onNotify: (event) => deliver(event),
  onMail: (mail) => {
    store.recordMail(mail);
    broadcast();
  },
  onAiStatus: (message) => {
    aiStatus = message;
    broadcast();
  },
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
    mails: store.mailIndex,
    settings: store.settings,
    encryptionAvailable: store.encryptionAvailable,
    paused,
    version: app.getVersion(),
    e2e,
    update: updateStatus,
    aiKeySaved: store.hasAiKey(),
    aiStatus,
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
    icon: windowIcon(),
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
  latestToast = { ...payload, queueLength: toastQueue.length };
  if (!toastWindow || toastWindow.isDestroyed()) {
    toastWindow = new BrowserWindow({
      width: 380,
      height: 420,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      show: false,
      backgroundColor: "#00000000",
      icon: windowIcon(),
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
    toastWindow?.webContents.send("toast", latestToast);
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
  const height = 420;
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
      expiresAt: event.expiresAt ?? null,
    };
    store.addHistory(item);
  }
  const payload: ToastPayload = {
    id: event.messageId,
    code: event.code,
    display: event.display,
    service: event.service,
    subject: event.subject,
    email: event.email,
    sound: store.settings.sound && !e2e,
    seconds: store.settings.notificationSeconds,
    kind: event.kind,
    candidates: event.candidates,
    displays: event.displays,
    selectedIndex: event.selectedIndex,
    verifyUrl: event.verifyUrl,
    domain: event.domain,
    receivedAt: event.receivedAt,
    expiresAt: event.expiresAt ?? null,
    fromJunk: Boolean(event.folder && event.folder !== "INBOX"),
  };
  toastMail.set(event.messageId, { from: event.from, subject: event.subject, text: event.text || "", html: event.html, recipient: event.email, expected: event.code, kind: event.kind === "link" ? "link" : event.code ? "code" : "none" });
  broadcast();
  refreshTrayMenu();
  // 静默模式：只记录，不弹窗不发声。暂停（断开）之外的第三种安静方式。
  if (Date.now() < store.settings.muteUntil) {
    logInfo("静默模式：新通知只记录未弹窗", { mutedUntil: store.settings.muteUntil });
    return;
  }
  if (toastOpen) {
    // 同一服务的新码顶掉排队中的旧码，旧码过期了也不该再弹出来。
    for (let i = toastQueue.length - 1; i >= 0; i -= 1) {
      if (payload.code && toastQueue[i].domain && toastQueue[i].domain === payload.domain) toastQueue.splice(i, 1);
    }
    toastQueue.push(payload);
  } else showToast(payload);
}

/** Synthetic notification so users can verify popup position, sound and copying without waiting for a real code. Never enters history. */
function sendTestToast(): void {
  const payload: ToastPayload = {
    id: `test-${Date.now()}`,
    code: "123456",
    display: "123456",
    service: "测试通知",
    subject: "这是一条测试通知，用来确认弹窗位置、提示音和复制都正常。",
    email: store.accounts[0]?.email || "尚未添加邮箱",
    sound: store.settings.sound && !e2e,
    seconds: store.settings.notificationSeconds,
    kind: "code",
    candidates: ["123456"],
    displays: ["123456"],
    selectedIndex: 0,
    verifyUrl: null,
    domain: "",
    receivedAt: Date.now(),
    test: true,
  };
  toastMail.set(payload.id, { from: "test@maodao.local", subject: payload.subject, text: payload.subject, recipient: payload.email, expected: payload.code, kind: "code" });
  if (toastOpen) toastQueue.push(payload);
  else showToast(payload);
}

const HOTKEY = "CommandOrControl+Shift+V";
let hotkeyRegistered = false;

function copyLatestCode(): void {
  const now = Date.now();
  const latest = store.history.find((item) => !item.expiresAt || item.expiresAt > now);
  if (!latest) {
    if (tray && store.history.length > 0) {
      tray.setToolTip("码到 — 最近的验证码都已过期");
      setTimeout(() => refreshTrayMenu(), 2600);
    }
    return;
  }
  clipboard.writeText(latest.code);
  scheduleClipboardClear(latest.code);
  store.markCopied(latest.code);
  broadcast();
  logInfo("已按全局快捷键复制最新验证码", { reason: "hotkey", length: latest.code.length });
  if (tray) {
    tray.setToolTip(`码到 — 已复制 ${latest.service} 的验证码`);
    setTimeout(() => refreshTrayMenu(), 2600);
  }
}

function applyHotkey(): void {
  try {
    if (store.settings.hotkeyCopyLatest && !hotkeyRegistered) {
      hotkeyRegistered = globalShortcut.register(HOTKEY, copyLatestCode);
      if (!hotkeyRegistered) logInfo("全局快捷键被占用，注册失败", { hotkey: HOTKEY });
    } else if (!store.settings.hotkeyCopyLatest && hotkeyRegistered) {
      globalShortcut.unregister(HOTKEY);
      hotkeyRegistered = false;
    }
  } catch (error) {
    logInfo("全局快捷键注册失败", { message: error instanceof Error ? error.message : "error" });
  }
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
      icon: windowIcon(),
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
  const broken = [...statuses.values()].filter((status) => status.state === "auth_failed").length;
  if (broken > 0) tray.setToolTip(`码到 — ⚠ ${broken} 个邮箱登录失效，验证码会漏检`);
  else tray.setToolTip(paused ? "码到 — 已暂停" : `码到 — ${listening} 个邮箱在监听`);
}

/** One-shot alert when an account flips into auth_failed: the failure used to sit silently in the main window. */
function sendAuthAlert(email: string, detail: string): void {
  const payload: ToastPayload = {
    id: `alert-auth-${email}`,
    code: null,
    display: null,
    service: "登录失效",
    subject: `${email} 的授权已失效${detail ? `（${detail}）` : ""}，这个邮箱的验证码会漏检。点「去重新登录」处理。`,
    email,
    sound: store.settings.sound && !e2e,
    seconds: store.settings.notificationSeconds,
    kind: "mail",
    candidates: [],
    displays: [],
    selectedIndex: 0,
    verifyUrl: null,
    domain: "",
    receivedAt: Date.now(),
    alert: "auth",
  };
  if (toastOpen) toastQueue.push(payload);
  else showToast(payload);
}

let clipboardClearTimer: ReturnType<typeof setTimeout> | null = null;

/** After a code copy, clear the clipboard later — only if it still holds exactly that code. */
function scheduleClipboardClear(code: string): void {
  if (clipboardClearTimer) clearTimeout(clipboardClearTimer);
  clipboardClearTimer = null;
  const minutes = store.settings.clipboardClearMinutes;
  if (!minutes) return;
  clipboardClearTimer = setTimeout(() => {
    clipboardClearTimer = null;
    if (clipboard.readText() === code) {
      clipboard.writeText("");
      logInfo("已按设置自动清空剪贴板中的验证码", { minutes });
    }
  }, minutes * 60_000);
}

function resourceFile(name: string): string {
  const candidates = [
    path.join(process.resourcesPath, name),
    path.join(app.getAppPath(), "resources", name),
    path.join(__dirname, "../../resources", name),
  ];
  return candidates.find((item) => fs.existsSync(item)) || candidates[0];
}

function windowIcon(): string {
  return resourceFile("icon.png");
}

function trayImage() {
  const small = nativeImage.createFromPath(resourceFile("tray-16.png"));
  const large = nativeImage.createFromPath(resourceFile("tray-32.png"));
  if (!small.isEmpty() && !large.isEmpty()) {
    small.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: large.toPNG() });
  }
  return small.isEmpty() ? large : small;
}

function createTray(): void {
  try {
    tray = new Tray(trayImage());
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
  ipcMain.handle("mail-get", (_event, id: unknown) => store.getMail(typeof id === "string" ? id : ""));
  ipcMain.handle("mail-correct", (_event, id: unknown, action: { kind?: "code" | "link" | "none"; code?: string }) => {
    const updated = store.correctMail(typeof id === "string" ? id : "", { kind: action?.kind || "none", code: action?.code });
    broadcast();
    return updated || null;
  });
  ipcMain.handle("mail-clear", () => {
    store.clearMails();
    broadcast();
  });
  ipcMain.handle("mail-export", (_event, id: unknown) => {
    const mail = store.getMail(typeof id === "string" ? id : "");
    if (!mail) return "";
    const fixture = toRedactedFixture({
      from: mail.from,
      subject: mail.subject,
      text: mail.text,
      expected: mail.classification === "code" ? mail.code : null,
      kind: mail.classification === "maybe" ? "code" : mail.classification === "link" ? "link" : "none",
      recipient: mail.email,
    });
    const json = `${JSON.stringify(fixture, null, 2)}\n`;
    clipboard.writeText(json);
    return json;
  });
  ipcMain.handle("mail-rerecognize", async (_event, id: unknown) => {
    const mail = store.getMail(typeof id === "string" ? id : "");
    if (!mail) return null;
    if (mail.source === "user") return mail;
    const found = await monitor.review(mail);
    const spam = classifySpam({
      from: mail.from,
      subject: mail.subject,
      text: mail.text,
      headers: mail.headers,
      classification: found.classification,
      userBlocked: Boolean(store.settings.senderPrefs?.[mail.domain]?.muted),
    });
    const updated = store.recordMail({
      ...mail,
      classification: found.classification,
      confidence: found.confidence,
      source: found.source,
      code: found.code,
      display: found.display,
      candidates: found.candidates,
      displays: found.displays,
      domain: found.domain,
      contentKind: spam.contentKind,
      spamScore: spam.spamScore,
      spamReasons: spam.spamReasons,
    }, true);
    broadcast();
    return updated;
  });
  ipcMain.handle("ai-key", (_event, key: unknown) => {
    const persisted = store.setAiKey(typeof key === "string" ? key : "");
    aiStatus = store.hasAiKey()
      ? (persisted ? "密钥已加密保存" : "这台系统不能加密保存密钥，密钥只留在本次运行的内存里")
      : "密钥已清除";
    broadcast();
    return { saved: store.hasAiKey(), persisted };
  });
  ipcMain.handle("ai-test", async () => {
    const settings = store.settings;
    if (!settings.aiBaseUrl.trim() || !settings.aiModel.trim()) {
      aiStatus = "请先填写接口地址和模型";
      broadcast();
      return aiStatus;
    }
    const result = await requestAiVerdict({
      baseUrl: settings.aiBaseUrl,
      apiKey: store.getAiKey(),
      model: settings.aiModel,
      subject: "测试",
      from: "test@example.com",
      text: "Your verification code is 482913",
    });
    aiStatus = result.verdict?.accepted && result.verdict.code === "482913"
      ? "测试通过"
      : (!result.failure && result.verdict && !result.verdict.accepted
        ? "测试未通过，模型结果里没有原文中的验证码"
        : statusLine(result.failure, result.detail));
    broadcast();
    return aiStatus;
  });
  ipcMain.handle("settings", (_event, patch) => {
    const settings = store.updateSettings(patch);
    applyLogin(settings.openAtLogin);
    if ("autoCheckUpdates" in patch) updater?.schedule();
    if ("hotkeyCopyLatest" in patch) applyHotkey();
    broadcast();
    return settings;
  });
  ipcMain.handle("test-toast", () => {
    sendTestToast();
    return true;
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
    scheduleClipboardClear(code);
    store.markCopied(code);
    broadcast();
    logInfo("已按用户操作复制验证码", { reason, length: code.length });
    return clipboard.readText();
  });
  ipcMain.handle("set-muted", (_event, minutes: unknown) => {
    const value = typeof minutes === "number" && Number.isFinite(minutes) ? Math.min(24 * 60, Math.max(0, Math.round(minutes))) : 0;
    const settings = store.updateSettings({ muteUntil: value > 0 ? Date.now() + value * 60_000 : 0 });
    broadcast();
    refreshTrayMenu();
    return settings.muteUntil;
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
  ipcMain.handle("toast-mute", () => {
    const domain = latestToast?.domain;
    if (!domain) return;
    const current = store.settings.senderPrefs || {};
    store.updateSettings({ senderPrefs: { ...current, [domain]: { ...current[domain], muted: true } } });
    dismissToast();
    broadcast();
  });
  ipcMain.handle("toast-other", () => {
    if (!latestToast?.candidates?.length || !latestToast.domain) return latestToast;
    const count = latestToast.candidates.length;
    const next = ((latestToast.selectedIndex || 0) + 1) % count;
    const current = store.settings.senderPrefs || {};
    store.updateSettings({ senderPrefs: { ...current, [latestToast.domain]: { ...current[latestToast.domain], preferIndex: next } } });
    latestToast = {
      ...latestToast,
      selectedIndex: next,
      code: latestToast.candidates[next],
      display: latestToast.displays?.[next] || latestToast.candidates[next],
    };
    const history = store.history.find((item) => item.id === latestToast?.id);
    if (history && latestToast.code) store.addHistory({ ...history, code: latestToast.code });
    toastWindow?.webContents.send("toast", latestToast);
    broadcast();
    return latestToast;
  });
  ipcMain.handle("toast-open-link", () => {
    const url = latestToast?.verifyUrl || "";
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle("toast-export", () => {
    const snap = latestToast ? toastMail.get(latestToast.id) : undefined;
    if (!snap) return "";
    const fixture = toRedactedFixture(snap);
    const json = `${JSON.stringify(fixture, null, 2)}\n`;
    clipboard.writeText(json);
    return json;
  });
  ipcMain.handle("oauth-cancel", () => {
    oauthGeneration += 1;
    const wait = mailboxWait;
    mailboxWait = null;
    wait?.reject(new Error("已取消登录。"));
    login?.cancel();
  });
  ipcMain.handle("oauth-mailbox", (_event, email: string) => {
    const wait = mailboxWait;
    mailboxWait = null;
    if (!wait) return { ok: false as const, message: "没有正在进行的登录。" };
    wait.resolve(String(email || ""));
    return { ok: true as const };
  });
  ipcMain.handle("account-alias", (_event, id: string, alias: string) => {
    store.setAlias(String(id || ""), String(alias || ""));
    broadcast();
  });
  ipcMain.handle("outlook-fix-mailbox", async (_event, id: string, email: string) => {
    const account = store.accounts.find((item) => item.id === id && item.provider === "outlook");
    if (!account) return { ok: false as const, message: "找不到这个账号。" };
    const mailbox = String(email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)) return { ok: false as const, message: "邮箱地址不正确。" };
    if (findDuplicateOutlook(store.accounts, mailbox, account.id, account.loginName)) return { ok: false as const, message: "该邮箱已添加" };
    const secret = store.getSecret(account.id);
    if (!secret?.accessToken) return { ok: false as const, message: "需要重新登录" };
    const result = await verifyOutlookMailbox({ user: mailbox, accessToken: secret.accessToken, host: account.host, port: account.port });
    if (!result.ok) return { ok: false as const, message: mapOutlookFailure(result.message, { stage: "imap", customClient: false }).title };
    const previous = account.email;
    store.saveOAuthAccount({
      email: mailbox,
      loginName: account.loginName || (previous.toLowerCase() !== mailbox.toLowerCase() ? previous : undefined),
      alias: account.alias,
      replaceId: account.id,
      host: account.host,
      port: account.port,
      accessToken: secret.accessToken,
      refreshToken: secret.refreshToken,
      expiresAt: secret.expiresAt,
    });
    monitor.sync();
    broadcast();
    return { ok: true as const, email: mailbox };
  });
  ipcMain.handle("oauth-start", async (_event, mode: "pkce" | "device", options?: OAuthStartOptions) => {
    const generation = ++oauthGeneration;
    const pending = mailboxWait;
    mailboxWait = null;
    pending?.reject(new Error("已取消登录。"));
    login?.cancel();
    login = new OutlookLogin();
    let stage: "login" | "device" | "imap" = mode === "device" ? "device" : "login";
    const send = (event: OAuthEvent) => {
      if (generation !== oauthGeneration) return;
      mainWindow?.webContents.send("oauth", event);
    };
    try {
      const tokens = mode === "device"
        ? await login.device(store.settings, send)
        : await login.pkce(store.settings, (url) => void shell.openExternal(url), send, openEmbeddedOutlookLogin);
      if (generation !== oauthGeneration) return;
      stage = "imap";
      await finishOutlookLogin(generation, tokens, options, send);
    } catch (error) {
      if (generation !== oauthGeneration) return;
      const raw = error instanceof Error ? error.message : "登录失败。";
      const failure = mapOutlookFailure(raw, { stage, customClient: Boolean(store.settings.outlookClientId.trim()) });
      send({ type: "error", message: failure.title, failure });
    }
  });
}

async function finishOutlookLogin(generation: number, tokens: OAuthTokens, options: OAuthStartOptions | undefined, send: (event: OAuthEvent) => void): Promise<void> {
  if (!tokens.accessToken) throw new Error("登录成功，但没有拿到令牌。");
  const claims = readJwtClaims(tokens.idToken);
  if (!claims.email && tokens.email) claims.email = tokens.email;
  const plan = readIdentity(claims);
  const host = options?.host?.trim() || PROVIDERS.outlook.host;
  const port = Number(options?.port) || PROVIDERS.outlook.port;
  send({ type: "progress", message: "正在连接邮箱…" });
  let worked: string | null = null;
  let lastRaw = "";
  for (const user of plan.tryOrder) {
    if (generation !== oauthGeneration) return;
    const result = await verifyOutlookMailbox({ user, accessToken: tokens.accessToken, host, port });
    if (result.ok) {
      worked = user;
      break;
    }
    lastRaw = result.message;
  }
  let explicit = false;
  let asked = false;
  while (!worked) {
    if (generation !== oauthGeneration) return;
    if (!asked && !plan.mailboxFromClaims) {
      send({ type: "need-mailbox", loginName: plan.loginName, suggestion: plan.loginName });
    } else {
      const failure = mapOutlookFailure(lastRaw || "AUTHENTICATIONFAILED", { stage: "imap", customClient: false });
      send({ type: "error", message: failure.title, failure, loginName: plan.loginName, suggestion: plan.mailboxFromClaims || "" });
    }
    asked = true;
    const entered = (await new Promise<string>((resolve, reject) => {
      mailboxWait = { resolve, reject };
    })).trim();
    if (generation !== oauthGeneration) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entered)) {
      lastRaw = "邮箱地址不正确";
      continue;
    }
    send({ type: "progress", message: "正在连接邮箱…" });
    const result = await verifyOutlookMailbox({ user: entered, accessToken: tokens.accessToken, host, port });
    if (result.ok) {
      worked = entered;
      explicit = true;
    } else lastRaw = result.message;
  }
  if (generation !== oauthGeneration) return;
  const saved = chooseSavedMailbox(plan, worked, explicit);
  const duplicate = findDuplicateOutlook(store.accounts, saved.email, options?.replaceId, saved.loginName);
  if (duplicate) {
    send({ type: "duplicate", email: duplicate.email, loginName: duplicate.loginName, attemptedEmail: saved.email, accountId: duplicate.id });
    return;
  }
  const account = store.saveOAuthAccount({
    ...saved,
    replaceId: options?.replaceId,
    host,
    port,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
  monitor.sync();
  broadcast();
  send({ type: "success", email: account.email, loginName: account.loginName, accountId: account.id });
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
  globalShortcut.unregisterAll();
  monitor?.stopAll();
});

if (smoke) {
  app.whenReady().then(() => app.exit(0));
} else if (gotLock) app.whenReady().then(async () => {
  app.setAppUserModelId("app.madao.desktop");
  store = new AccountStore(path.join(app.getPath("userData"), "madao"), createSecretBox());
  monitor = createMonitor();
  store.load();
  if (e2e) nativeTheme.themeSource = "light";
  wireIpc();
  applyHotkey();
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
