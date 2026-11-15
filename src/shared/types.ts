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
  /** 启动后以及每 6 小时检查 GitHub Releases。 */
  autoCheckUpdates: boolean;
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
  code: string | null;
  service: string;
  subject: string;
  email: string;
  sound: boolean;
  seconds: number;
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
  autoCheckUpdates: true,
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
