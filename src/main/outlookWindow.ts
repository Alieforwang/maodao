import { BrowserWindow } from "electron";
import { isRedirectNavigation, parseOAuthCallback, webRequestPatterns } from "../shared/outlookAuth.js";

export function openEmbeddedOutlookLogin(authorizeUrl: string, redirectUri: string): { result: Promise<string>; close: () => void } {
  let win: BrowserWindow | null = null;
  let settled = false;
  let rejectResult: (error: Error) => void = () => undefined;
  const result = new Promise<string>((resolve, reject) => {
    rejectResult = reject;
    win = new BrowserWindow({
      width: 480,
      height: 720,
      title: "登录 Outlook",
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    const finish = (url: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (win && !win.isDestroyed()) win.close();
      resolve(url);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (win && !win.isDestroyed()) win.close();
      reject(error);
    };
    const consider = (url: string) => {
      if (!isRedirectNavigation(url, redirectUri)) return false;
      const parsed = parseOAuthCallback(url, redirectUri);
      if (parsed?.code || parsed?.error) {
        finish(url);
        return true;
      }
      return false;
    };
    const session = win.webContents.session;
    let filter: { urls: string[] } | null = null;
    let filterError = "";
    try {
      filter = { urls: webRequestPatterns(redirectUri) };
      session.webRequest.onBeforeRequest(filter, (details, callback) => {
        if (consider(details.url)) {
          callback({ cancel: true });
          return;
        }
        callback({});
      });
    } catch (error) {
      filter = null;
      filterError = error instanceof Error ? error.message : String(error);
      console.error(`[码到] 登录回调拦截未挂上：${filterError}`);
    }
    win.webContents.on("will-redirect", (event, url) => {
      if (consider(url)) event.preventDefault();
    });
    win.webContents.on("will-navigate", (event, url) => {
      if (isRedirectNavigation(url, redirectUri)) event.preventDefault();
      consider(url);
    });
    win.webContents.on("did-fail-load", (_event, _code, _description, validatedURL) => {
      consider(validatedURL);
    });
    win.on("closed", () => fail(new Error("登录窗口已关闭。")));
    const timer = setTimeout(() => fail(new Error("登录超时。")), 5 * 60 * 1000);
    const cleanup = () => {
      clearTimeout(timer);
      if (filter) {
        try {
          session.webRequest.onBeforeRequest(filter, null);
        } catch {
          /* listener is already gone */
        }
      }
    };
    void win.loadURL(authorizeUrl).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const detail = filterError ? `${message}（回调拦截：${filterError}）` : message;
      if (!settled) fail(new Error(detail));
    });
  });
  return {
    result,
    close: () => {
      if (!settled) {
        settled = true;
        rejectResult(new Error("已取消登录。"));
      }
      if (win && !win.isDestroyed()) win.close();
    },
  };
}
