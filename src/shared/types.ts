export type ProviderId = "qq" | "netease" | "gmail" | "outlook";

export type AuthMethod = "password" | "oauth";

export interface Account {
  id: string;
  provider: ProviderId;
  email: string;
  host: string;
  port: number;
  secure: boolean;
  authMethod: AuthMethod;
  enabled: boolean;
  secretUpdatedAt: number;
  /** False when the OS cannot encrypt, so the secret stays in memory only. */
  secretPersisted: boolean;
  /** Microsoft login name when it differs from the mailbox, for example a QQ address. */
  loginName?: string;
  /** IMAP XOAUTH2 username when it differs from the address shown to the user. */
  imapUser?: string;
  /** Optional label. The mailbox address stays visible. */
  alias?: string;
}

export interface Settings {
  openAtLogin: boolean;
  startMinimized: boolean;
  notifyOnlyCodes: boolean;
  sound: boolean;
  /** 0 means the toast stays until dismissed. */
  notificationSeconds: 0 | 15 | 30;
  maxAgeMinutes: 3 | 5 | 10 | 15 | 30 | 60;
  outlookClientId: string;
  outlookTenant: string;
  oauthRedirectPort: number;
  /** Empty means choose https://localhost or the loopback URL from the client id. */
  oauthRedirectUri: string;
  /** 启动后以及每 6 小时检查 GitHub Releases。 */
  autoCheckUpdates: boolean;
  /** 按发件域名记住的校正，不挂在某个账号上。 */
  senderPrefs: Record<string, SenderPref>;
  /** 默认关闭。配好接口后才会对把握不够的邮件调用模型。 */
  aiEnabled: boolean;
  aiPreset: "gemini" | "openrouter" | "groq" | "ollama" | "deepseek" | "sub2" | "custom";
  aiBaseUrl: string;
  aiModel: string;
  /** 高级：连高置信的规则结果也再问一次模型，但模型不能推翻高置信规则。 */
  aiEveryMessage: boolean;
  /** 全局快捷键（Ctrl+Shift+V）复制最新一条验证码，默认开。 */
  hotkeyCopyLatest: boolean;
  /** 静默模式截止时间（epoch ms）：在此之前新码只记录、不弹窗不发声。0 表示未静默。 */
  muteUntil: number;
  /** 是否顺带巡查垃圾箱，捞被误投递的验证码。默认开。 */
  watchJunkFolder: boolean;
  /** 复制验证码后多少分钟自动清空剪贴板（仅当剪贴板里还是这个码时）。0 表示不清理。 */
  clipboardClearMinutes: 0 | 1 | 5 | 10;
  /** 本地全部邮件保留天数。 */
  mailRetentionDays: 7 | 30 | 90;
  /** 每个邮箱在本地最多保留多少封。 */
  mailRetentionCount: 200 | 500 | 1000;
  /** 界面主题：跟随系统或强制浅色/深色。浅色与深色样式都已内置，之前只能跟随系统。 */
  themeMode: "system" | "light" | "dark";
}

export interface SenderPref {
  muted?: boolean;
  preferIndex?: number;
}

export type UpdatePhase = "idle" | "checking" | "latest" | "available" | "downloading" | "downloaded" | "error";

export interface UpdateStatus {
  phase: UpdatePhase;
  message: string;
  percent?: number;
  version?: string;
}

export interface SecretPayload {
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  apiKey?: string;
}

export interface HistoryItem {
  id: string;
  accountId: string;
  email: string;
  code: string;
  service: string;
  subject: string;
  from: string;
  messageId: string;
  receivedAt: number;
  /** receivedAt + validity window stated in the mail. Null when the mail does not say. */
  expiresAt?: number | null;
  /** When the user last copied this code (any surface). */
  copiedAt?: number;
}

export type ConnectionState =
  | "disabled"
  | "connecting"
  | "listening"
  | "polling"
  | "reconnecting"
  | "auth_failed"
  | "error";

export interface AccountStatus {
  accountId: string;
  state: ConnectionState;
  detail: string;
  mode?: "idle" | "poll";
}

export interface AccountDraft {
  id?: string;
  provider: ProviderId;
  email: string;
  host: string;
  port: number;
  secure?: boolean;
  /** Empty means keep the stored secret when editing. */
  secret?: string;
}

export type CopyReason = "notification-click" | "copy-button" | "history" | "tray" | "hotkey";

export interface ToastPayload {
  id: string;
  /** Copy form, separators removed. */
  code: string | null;
  /** Shown form, separators kept. */
  display?: string | null;
  service: string;
  subject: string;
  email: string;
  sound: boolean;
  seconds: number;
  kind?: "code" | "maybe" | "link" | "mail";
  candidates?: string[];
  displays?: string[];
  selectedIndex?: number;
  verifyUrl?: string | null;
  domain?: string;
  /** When the mail arrived, epoch ms. Used for the real timestamp instead of a hard-coded “刚刚”. */
  receivedAt?: number;
  /** When the code itself expires per the mail's own wording. Null when unstated. */
  expiresAt?: number | null;
  /** How many more notifications are queued behind this one. */
  queueLength?: number;
  /** Synthetic test notification: never written to history. */
  test?: boolean;
  /** Account alert (e.g. login expired) instead of a mail notification. */
  alert?: "auth";
  /** The code was found in the junk folder, not the inbox. */
  fromJunk?: boolean;
}

export interface AppState {
  theme: "light" | "dark";
  accounts: Account[];
  statuses: AccountStatus[];
  history: HistoryItem[];
  mails: MailSummary[];
  settings: Settings;
  encryptionAvailable: boolean;
  paused: boolean;
  version: string;
  e2e: boolean;
  update: UpdateStatus;
  aiKeySaved: boolean;
  aiStatus: string;
}

export const DEFAULT_SETTINGS: Settings = {
  openAtLogin: false,
  startMinimized: false,
  notifyOnlyCodes: true,
  sound: true,
  notificationSeconds: 30,
  maxAgeMinutes: 5,
  outlookClientId: "",
  outlookTenant: "consumers",
  oauthRedirectPort: 45832,
  oauthRedirectUri: "",
  autoCheckUpdates: true,
  senderPrefs: {},
  aiEnabled: false,
  aiPreset: "custom",
  aiBaseUrl: "",
  aiModel: "",
  aiEveryMessage: false,
  hotkeyCopyLatest: true,
  muteUntil: 0,
  watchJunkFolder: true,
  clipboardClearMinutes: 5,
  mailRetentionDays: 30,
  mailRetentionCount: 500,
  themeMode: "system",
};

export type MailClass = "code" | "maybe" | "link" | "none";
export type MailSource = "rule" | "ai" | "user";

export interface MailSummary {
  id: string;
  accountId: string;
  email: string;
  from: string;
  subject: string;
  receivedAt: number;
  classification: MailClass;
  confidence: "high" | "medium" | "low";
  source: MailSource;
  code: string | null;
  display: string | null;
  candidates: string[];
  domain: string;
  /** receivedAt + validity window stated in the mail. Null when unstated. */
  expiresAt?: number | null;
  /** Content-axis classification from the local spam scorer. Absent on records stored before it existed. */
  contentKind?: ContentKind;
  /** 0–100 junk risk from the local spam scorer. */
  spamScore?: number;
  /** Explainable ledger behind spamScore. */
  spamReasons?: SpamReason[];
}

export interface StoredMail extends MailSummary {
  text: string;
  displays: string[];
  /** Authentication/header snapshot captured at ingest; older records do not have it. */
  headers?: MailHeaders;
}

export type AuthResult = "pass" | "fail" | "softfail" | "neutral" | "none";

export interface MailHeaders {
  spf?: AuthResult;
  dkim?: AuthResult;
  dmarc?: AuthResult;
  returnPathDomain?: string;
  listUnsubscribe?: boolean;
}

/** Content axis, orthogonal to MailClass (the code axis): what kind of mail this is. */
export type ContentKind = "important" | "promo" | "subscription" | "normal" | "spammy";

export interface SpamReason {
  label: string;
  delta: number;
}

export const COPY_REASONS: readonly CopyReason[] = [
  "notification-click",
  "copy-button",
  "history",
  "tray",
  "hotkey",
];

export function isCopyReason(value: unknown): value is CopyReason {
  return typeof value === "string" && (COPY_REASONS as readonly string[]).includes(value);
}
