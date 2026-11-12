import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { BrowserWindow, Clipboard } from "electron";
import type { AccountStore } from "./store.js";
import type { MailMonitor } from "./monitor.js";
import type { AccountStatus } from "../shared/types.js";

export async function runHarness(input: {
  store: AccountStore;
  monitor: MailMonitor;
  clipboard: Clipboard;
  getMain: () => BrowserWindow;
  waitToast: () => Promise<BrowserWindow>;
  statuses: () => AccountStatus[];
}): Promise<void> {
  const imapPort = Number(process.env.MADAO_IMAP_PORT || 24143);
  const smtpPort = Number(process.env.MADAO_SMTP_PORT || 24025);
  const user = process.env.MADAO_IMAP_USER || "ada@example.com";
  const pass = process.env.MADAO_IMAP_PASS || "s3cret";
  const code = "738291";
  const shotDir = process.env.MADAO_SHOT_DIR;
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  const before = input.clipboard.readText();
  input.store.saveAccount({
    provider: "qq",
    email: user,
    host: "127.0.0.1",
    port: imapPort,
    secure: false,
    secret: pass,
  });
  input.monitor.sync();
  const main = input.getMain();
  await waitFor(() => input.statuses().some((status) => status.state === "listening" || status.state === "polling"), 30_000, "测试邮箱没有连上");
  await waitFor(async () => Boolean(await main.webContents.executeJavaScript("Boolean(window.__madao)")), 10_000, "界面没准备好");
  await main.webContents.executeJavaScript("document.fonts ? document.fonts.ready : Promise.resolve()");
  await delay(400);
  if (shotDir) await shot(main, path.join(shotDir, "accounts.png"));
  await main.webContents.executeJavaScript("window.__madao.openAdd()");
  await delay(300);
  if (shotDir) await shot(main, path.join(shotDir, "add-account.png"));
  await main.webContents.executeJavaScript("window.__madao.openSettings()");
  await delay(200);
  if (shotDir) await shot(main, path.join(shotDir, "settings.png"));
  await main.webContents.executeJavaScript("window.__madao.openAccounts()");
  await sendSmtp({
    port: smtpPort,
    from: "Alipay <notify@alipay.com>",
    to: user,
    subject: "您正在登录支付宝",
    text: `【支付宝】您的验证码是${code}，5 分钟内有效。请勿告诉他人。`,
  });
  const toast = await input.waitToast();
  await waitFor(async () => (await toast.webContents.executeJavaScript("document.querySelector('.code')?.textContent || ''")) === code, 20_000, "通知里没有出现验证码");
  const mid = input.clipboard.readText();
  if (mid !== before) throw new Error("通知弹出时剪贴板被改动了");
  if (shotDir) await shot(toast, path.join(shotDir, "toast.png"));
  await toast.webContents.executeJavaScript("document.querySelector('[data-action=copy]').click()");
  await delay(200);
  const copied = input.clipboard.readText();
  if (copied !== code) throw new Error(`点击复制后剪贴板是「${copied}」，不是验证码`);
  const result = { ok: true, code, copied, notifiedWithoutCopy: mid === before, listening: input.statuses() };
  fs.writeFileSync(process.env.MADAO_RESULT || path.join(shotDir || process.cwd(), "e2e-result.json"), JSON.stringify(result, null, 2));
}

async function shot(win: BrowserWindow, file: string): Promise<void> {
  const image = await win.capturePage();
  fs.writeFileSync(file, image.toPNG());
}

async function waitFor(check: () => boolean | Promise<boolean>, timeout: number, message: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await check()) return;
    await delay(200);
  }
  throw new Error(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sendSmtp(input: { port: number; from: string; to: string; subject: string; text: string }): Promise<void> {
  const body = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    ".",
    "",
  ].join("\r\n");
  const commands = [`EHLO madao.test\r\n`, `MAIL FROM:<notify@alipay.com>\r\n`, `RCPT TO:<${input.to}>\r\n`, `DATA\r\n`, body, `QUIT\r\n`];
  return new Promise((resolve, reject) => {
    const socket = net.connect(input.port, "127.0.0.1");
    let buffer = "";
    let step = 0;
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.on("error", fail);
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (/^\d{3}-/.test(line)) continue;
        if (!/^\d{3} /.test(line)) continue;
        const status = Number(line.slice(0, 3));
        if (status >= 400) {
          fail(new Error(line));
          return;
        }
        if (step >= commands.length) {
          socket.end();
          resolve();
          return;
        }
        socket.write(commands[step]);
        step += 1;
      }
    });
  });
}
