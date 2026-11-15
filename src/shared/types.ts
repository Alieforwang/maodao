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
  maxAgeMinutes: 3 | 5 | 10;
  outlookClientId: string;
  outlookTenant: string;
  oauthRedirectPort: number;
  /** Empty means choose https://localhost or the loopback URL from the client id. */
  oauthRedirectUri: string;
  /** 启动后以及每 6 小时检查 GitHub Releases。 */
  autoCheckUpdates: boolean;
  /** 按发件域名记住的校正，不挂在某个账号上。 */
  senderPrefs: Record<string, SenderPref>;
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

export type CopyReason = "notification-click" | "copy-button" | "history" | "tray";

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
}

export interface AppState {
  theme: "light" | "dark";
  accounts: Account[];
  statuses: AccountStatus[];
  history: HistoryItem[];
  settings: Settings;
  encryptionAvailable: boolean;
  paused: boolean;
  version: string;
  e2e: boolean;
  update: UpdateStatus;
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
};

export const COPY_REASONS: readonly CopyReason[] = [
  "notification-click",
  "copy-button",
  "history",
  "tray",
];

export function isCopyReason(value: unknown): value is CopyReason {
  return typeof value === "string" && (COPY_REASONS as readonly string[]).includes(value);
}
