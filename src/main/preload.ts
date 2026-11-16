import { contextBridge, ipcRenderer } from "electron";
import type { AccountDraft, AppState, CopyReason, Settings, StoredMail, ToastPayload } from "../shared/types.js";
import type { OAuthEvent, OAuthStartOptions } from "./oauth.js";

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke("state"),
  onState: (callback: (state: AppState) => void) => {
    const listener = (_event: unknown, state: AppState) => callback(state);
    ipcRenderer.on("state", listener);
    return () => {
      ipcRenderer.removeListener("state", listener);
    };
  },
  saveAccount: (draft: AccountDraft) => ipcRenderer.invoke("account-save", draft) as Promise<{ ok: true } | { ok: false; message: string }>,
  deleteAccount: (id: string) => ipcRenderer.invoke("account-delete", id),
  setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke("account-enabled", id, enabled),
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke("settings", patch),
  setAiKey: (key: string) => ipcRenderer.invoke("ai-key", key) as Promise<{ saved: boolean; persisted: boolean }>,
  testAi: () => ipcRenderer.invoke("ai-test") as Promise<string>,
  sendTestNotification: () => ipcRenderer.invoke("test-toast") as Promise<boolean>,
  setMuted: (minutes: number) => ipcRenderer.invoke("set-muted", minutes) as Promise<number>,
  getMail: (id: string) => ipcRenderer.invoke("mail-get", id) as Promise<StoredMail | null>,
  correctMail: (id: string, action: { kind: "code" | "link" | "none"; code?: string }) => ipcRenderer.invoke("mail-correct", id, action) as Promise<StoredMail | null>,
  clearMails: () => ipcRenderer.invoke("mail-clear"),
  exportMail: (id: string) => ipcRenderer.invoke("mail-export", id) as Promise<string>,
  rerecognizeMail: (id: string) => ipcRenderer.invoke("mail-rerecognize", id) as Promise<StoredMail | null>,
  copyCode: (code: string, reason: CopyReason) => ipcRenderer.invoke("copy-code", code, reason) as Promise<string>,
  clearHistory: () => ipcRenderer.invoke("history-clear"),
  setPaused: (paused: boolean) => ipcRenderer.invoke("paused", paused),
  checkForUpdates: () => ipcRenderer.invoke("update-check"),
  installUpdate: () => ipcRenderer.invoke("update-install"),
  startOAuth: (mode: "pkce" | "device", options?: OAuthStartOptions) => ipcRenderer.invoke("oauth-start", mode, options),
  cancelOAuth: () => ipcRenderer.invoke("oauth-cancel"),
  submitMailbox: (email: string) => ipcRenderer.invoke("oauth-mailbox", email) as Promise<{ ok: boolean; message?: string }>,
  setAlias: (id: string, alias: string) => ipcRenderer.invoke("account-alias", id, alias),
  fixMailbox: (id: string, email: string) => ipcRenderer.invoke("outlook-fix-mailbox", id, email) as Promise<{ ok: true; email: string } | { ok: false; message: string }>,
  onOAuth: (callback: (event: OAuthEvent) => void) => {
    const listener = (_event: unknown, payload: OAuthEvent) => callback(payload);
    ipcRenderer.on("oauth", listener);
    return () => {
      ipcRenderer.removeListener("oauth", listener);
    };
  },
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  windowControl: (action: "minimize" | "maximize" | "close" | "show" | "quit") => ipcRenderer.invoke("window", action),
  copyText: (text: string) => ipcRenderer.invoke("copy-text", text) as Promise<string>,
  currentToast: (): Promise<ToastPayload | null> => ipcRenderer.invoke("toast-current"),
  onToast: (callback: (payload: ToastPayload) => void) => {
    const listener = (_event: unknown, payload: ToastPayload) => callback(payload);
    ipcRenderer.on("toast", listener);
    return () => {
      ipcRenderer.removeListener("toast", listener);
    };
  },
  dismissToast: () => ipcRenderer.invoke("toast-dismiss"),
  muteToastSender: () => ipcRenderer.invoke("toast-mute"),
  chooseOtherCode: () => ipcRenderer.invoke("toast-other"),
  openVerifyLink: () => ipcRenderer.invoke("toast-open-link"),
  exportRedactedSample: () => ipcRenderer.invoke("toast-export") as Promise<string>,
};

contextBridge.exposeInMainWorld("madao", api);

export type MadaoApi = typeof api;
