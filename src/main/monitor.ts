import { ImapFlow } from "imapflow";
import { decideNotification } from "../shared/decide.js";
import { explainImapError, isAuthFailure } from "../shared/redact.js";
import { parseRawMail } from "../shared/mail.js";
import { needsImapId, normalizePassword } from "../shared/presets.js";
import type { Account, AccountStatus, SecretPayload, Settings } from "../shared/types.js";
import { refreshOutlookToken } from "./oauth.js";
import { logInfo } from "./log.js";

const POLL_MS = 25_000;
const STARTUP_LIMIT = 3;

export interface NotifyEvent {
  accountId: string;
  email: string;
  code: string | null;
  service: string;
  subject: string;
  from: string;
  messageId: string;
  receivedAt: number;
}

export interface MonitorDeps {
  getAccounts(): Account[];
  getSecret(id: string): SecretPayload | undefined;
  replaceSecret(id: string, secret: SecretPayload): void;
  getSettings(): Settings;
  hasSeen(messageId: string): boolean;
  remember(messageId: string): void;
  onStatus(status: AccountStatus): void;
  onNotify(event: NotifyEvent): void;
}

type IdleClient = ImapFlow & { capabilities: Map<string, unknown> };

export function buildImapOptions(account: Account, secret: SecretPayload) {
  return {
    host: account.host,
    port: account.port,
    secure: account.secure,
    doSTARTTLS: account.secure ? undefined : false,
    auth: secret.accessToken
      ? { user: account.email, accessToken: secret.accessToken }
      : { user: account.email, pass: normalizePassword(account.provider, secret.password || "") },
    clientInfo: {
      name: "Madao",
      version: "1.0.0",
      vendor: "Madao",
      "support-email": "support@madao.local",
    },
    logger: false as const,
    emitLogs: false,
    logRaw: false,
    disableAutoIdle: true,
    maxIdleTime: POLL_MS,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 180_000,
    tls: { minVersion: "TLSv1.2" as const },
  };
}

export function forceImapId(client: { capabilities: Map<string, unknown> }): void {
  let stored = client.capabilities;
  const wrap = (map: Map<string, unknown>) => {
    if (!map || (map as Map<string, unknown> & { __madao?: boolean }).__madao) return map;
    const original = map.has.bind(map);
    map.has = ((key: string) => String(key).toUpperCase() === "ID" || original(key)) as Map<string, unknown>["has"];
    Object.defineProperty(map, "__madao", { value: true });
    return map;
  };
  Object.defineProperty(client, "capabilities", {
    configurable: true,
    enumerable: true,
    get: () => stored,
    set: (value: Map<string, unknown>) => {
      stored = wrap(value);
    },
  });
  stored = wrap(stored);
}

export class MailMonitor {
  private tasks = new Map<string, { stop: () => void; fingerprint: string }>();
  private paused = false;

  constructor(private readonly deps: MonitorDeps) {}

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.sync();
  }

  sync(): void {
    const accounts = this.deps.getAccounts();
    const live = new Set(accounts.map((account) => account.id));
    for (const [id, task] of this.tasks) {
      const account = accounts.find((item) => item.id === id);
      const fingerprint = account ? this.fingerprint(account) : "";
      if (!account || !account.enabled || this.paused || task.fingerprint !== fingerprint) {
        task.stop();
        this.tasks.delete(id);
      }
    }
    for (const account of accounts) {
      if (!live.has(account.id)) continue;
      if (!account.enabled || this.paused) {
        this.deps.onStatus({
          accountId: account.id,
          state: "disabled",
          detail: this.paused ? "监听已暂停" : "已暂停",
        });
        continue;
      }
      if (!this.tasks.has(account.id)) this.start(account);
    }
  }

  stopAll(): void {
    for (const task of this.tasks.values()) task.stop();
    this.tasks.clear();
  }

  private start(account: Account): void {
    const controller = new AbortController();
    this.tasks.set(account.id, { stop: () => controller.abort(), fingerprint: this.fingerprint(account) });
    void this.session(account, controller.signal, 0);
  }

  private fingerprint(account: Account): string {
    return JSON.stringify({
      email: account.email,
      host: account.host,
      port: account.port,
      secure: account.secure,
      enabled: account.enabled,
      secretUpdatedAt: account.secretUpdatedAt,
    });
  }

  private async session(account: Account, signal: AbortSignal, attempt: number): Promise<void> {
    if (signal.aborted) return;
    let secret = this.deps.getSecret(account.id);
    if (!secret?.password && !secret?.accessToken) {
      this.deps.onStatus({ accountId: account.id, state: "auth_failed", detail: "还没有可用的授权码。" });
      return;
    }
    if (secret.refreshToken && (secret.expiresAt || 0) < Date.now() + 5 * 60 * 1000) {
      try {
        const refreshed = await refreshOutlookToken(this.deps.getSettings(), secret.refreshToken);
        secret = {
          ...secret,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || secret.refreshToken,
          expiresAt: refreshed.expiresAt,
        };
        this.deps.replaceSecret(account.id, secret);
      } catch {
        this.deps.onStatus({ accountId: account.id, state: "auth_failed", detail: "Outlook 登录已过期，请重新登录。" });
        return;
      }
    }
    const client = new ImapFlow(buildImapOptions(account, secret)) as IdleClient;
    if (needsImapId(account.host)) forceImapId(client);
    client.on("error", () => undefined);
    this.deps.onStatus({
      accountId: account.id,
      state: attempt ? "reconnecting" : "connecting",
      detail: attempt ? `正在重连 · 第 ${attempt} 次` : "正在连接",
    });
    try {
      await client.connect();
      if (signal.aborted) {
        client.close();
        return;
      }
      const idle = client.capabilities.has("IDLE");
      this.deps.onStatus({
        accountId: account.id,
        state: idle ? "listening" : "polling",
        detail: idle ? "" : "服务器不支持 IDLE，改为轮询",
        mode: idle ? "idle" : "poll",
      });
      logInfo(idle ? "开始 IDLE" : "开始轮询", { accountId: account.id, host: account.host });
      await this.watch(client, account, signal);
      if (!signal.aborted) throw new Error("连接已断开");
    } catch (error) {
      try { client.close(); } catch { /* already closed */ }
      if (signal.aborted) return;
      if (isAuthFailure(error)) {
        this.deps.onStatus({ accountId: account.id, state: "auth_failed", detail: explainImapError(error, account.provider) });
        logInfo("登录失败", { accountId: account.id, host: account.host });
        return;
      }
      const wait = Math.min(60_000, 2_000 * 2 ** Math.min(attempt, 5));
      this.deps.onStatus({ accountId: account.id, state: "reconnecting", detail: explainImapError(error) });
      logInfo("连接中断，准备重连", { accountId: account.id, wait });
      await sleep(wait, signal);
      if (!signal.aborted) await this.session(account, signal, attempt + 1);
    }
  }

  private async watch(client: ImapFlow, account: Account, signal: AbortSignal): Promise<void> {
    const lock = await client.getMailboxLock("INBOX");
    const mailbox = client.mailbox && typeof client.mailbox === "object" ? client.mailbox : undefined;
    const baseline = Math.max(0, Number(mailbox?.uidNext || 1) - 1);
    let cursor = baseline;
    let closed = false;
    let chain: Promise<void> = Promise.resolve();
    let currentIdle: Promise<unknown> | null = null;

    const ensureIdle = () => {
      if (closed || currentIdle) return;
      const task = client.idle();
      currentIdle = task;
      void Promise.resolve(task).finally(() => {
        if (currentIdle === task) currentIdle = null;
      });
    };

    const pull = async (mode: "startup" | "live") => {
      const range = mode === "startup" ? (cursor < 1 ? "" : `${Math.max(1, cursor - 14)}:${cursor}`) : `${cursor + 1}:*`;
      if (!range) {
        ensureIdle();
        return;
      }
      let list: Fetched[] = [];
      try {
        const fetched = await client.fetchAll(range, { uid: true, internalDate: true, envelope: true, source: true }, { uid: true });
        list = Array.isArray(fetched) ? (fetched as Fetched[]) : [];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/nothing to fetch|no messages|Command failed/i.test(message)) throw error;
      }
      const settings = this.deps.getSettings();
      const now = Date.now();
      if (mode === "startup") {
        const fresh = list
          .filter((message) => message.uid <= baseline && message.internalDate && now - message.internalDate.getTime() <= settings.maxAgeMinutes * 60_000)
          .sort((a, b) => (b.internalDate?.getTime() || 0) - (a.internalDate?.getTime() || 0))
          .slice(0, STARTUP_LIMIT);
        for (const message of fresh.reverse()) await this.handle(account, message, baseline, true);
        for (const message of list) cursor = Math.max(cursor, message.uid);
      } else {
        for (const message of list.sort((a, b) => a.uid - b.uid)) {
          if (message.uid <= cursor) continue;
          cursor = message.uid;
          await this.handle(account, message, baseline, false);
        }
      }
      ensureIdle();
    };

    const enqueue = (mode: "startup" | "live") => {
      chain = chain.then(() => pull(mode)).catch((error) => {
        logInfo("读取新邮件失败", { accountId: account.id, message: error instanceof Error ? error.message : "error" });
        ensureIdle();
      });
    };

    client.on("exists", () => enqueue("live"));
    const done = new Promise<void>((resolve) => {
      const finish = () => {
        if (closed) return;
        closed = true;
        resolve();
      };
      client.once("close", finish);
      signal.addEventListener("abort", () => {
        try { client.close(); } catch { /* ignore */ }
        finish();
      }, { once: true });
    });
    enqueue("startup");
    try {
      await done;
    } finally {
      closed = true;
      try { lock.release(); } catch { /* connection already gone */ }
    }
  }

  private async handle(account: Account, message: Fetched, baseline: number, startup: boolean): Promise<void> {
    let subject = message.envelope?.subject || "";
    let from = envelopeFrom(message);
    let text = "";
    let messageId = "";
    let receivedAt = message.internalDate?.getTime() || Date.now();
    if (message.source) {
      const parsed = await parseRawMail(message.source);
      subject = parsed.subject || subject;
      from = parsed.from || from;
      text = parsed.text;
      messageId = parsed.messageId;
      if (parsed.date) receivedAt = parsed.date.getTime();
    }
    const id = messageId || `${account.id}:${message.uid}`;
    const settings = this.deps.getSettings();
    const decision = decideNotification({
      subject,
      from,
      body: text,
      internalDate: receivedAt,
      now: Date.now(),
      uid: message.uid,
      baselineUid: startup ? message.uid : baseline,
      maxAgeMs: settings.maxAgeMinutes * 60_000,
      notifyAllMail: !settings.notifyOnlyCodes,
      alreadyNotified: this.deps.hasSeen(id),
    });
    this.deps.remember(id);
    if (decision.action !== "notify") return;
    if (decision.reason === "code" && !decision.code) return;
    this.deps.onNotify({
      accountId: account.id,
      email: account.email,
      code: decision.code,
      service: decision.service,
      subject: subject || "（无标题）",
      from,
      messageId: id,
      receivedAt,
    });
    logInfo(decision.code ? "识别到验证码" : "新邮件通知", { accountId: account.id, length: decision.code?.length || 0 });
  }
}

interface Fetched {
  uid: number;
  internalDate?: Date;
  source?: Buffer;
  envelope?: { subject?: string; from?: Array<{ name?: string; address?: string }> };
}

function envelopeFrom(message: Fetched): string {
  const first = message.envelope?.from?.[0];
  if (!first) return "";
  return first.name ? `${first.name} <${first.address || ""}>` : first.address || "";
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
