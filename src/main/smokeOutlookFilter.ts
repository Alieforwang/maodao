import { app, BrowserWindow } from "electron";
import { webRequestPatterns } from "../shared/outlookAuth.js";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const urls = webRequestPatterns("https://localhost");
  win.webContents.session.webRequest.onBeforeRequest({ urls }, (_details, callback) => callback({}));
  await win.loadURL("about:blank");
  win.close();
  app.exit(0);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  app.exit(1);
});
