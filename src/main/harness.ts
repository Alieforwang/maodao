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
  await main.webContents.executeJavaScript(`
    const outlook = [...document.querySelectorAll(".provider")].find((button) => button.textContent.includes("Outlook"));
    if (!outlook) throw new Error("找不到 Outlook 选项");
    outlook.click();
  `);
  await delay(300);
  const outlookUi = await main.webContents.executeJavaScript(`(() => {
    const flow = document.querySelector(".outlook-flow");
    const text = flow ? flow.innerText : "";
    const advanced = flow ? flow.querySelector("details.advanced") : null;
    return {
      text,
      advancedOpen: Boolean(advanced && advanced.open),
      emailField: Boolean(document.querySelector("#email")),
    };
  })()`) as { text: string; advancedOpen: boolean; emailField: boolean };
  if (!outlookUi.text.includes("登录 Microsoft 账号")) throw new Error("Outlook 添加页没有主登录按钮");
  if (!outlookUi.text.includes("会打开微软官方登录页，码到不会看到你的密码")) throw new Error("Outlook 添加页没有密码说明");
  if (!outlookUi.text.includes("登录窗口打不开？改用设备码登录")) throw new Error("Outlook 添加页没有设备码入口");
  if (outlookUi.text.includes("IMAP 服务器")) throw new Error("高级选项默认展开了");
  if (outlookUi.advancedOpen) throw new Error("高级选项不是收起的");
  if (outlookUi.emailField) throw new Error("Outlook 添加页仍然要求先填邮箱");
  if (shotDir) await shot(main, path.join(shotDir, "outlook-add.png"));
  await main.webContents.executeJavaScript(`document.querySelector(".dialog-actions .btn")?.click()`);
  await delay(200);
  await main.webContents.executeJavaScript("window.__madao.openSettings()");
  await delay(200);
  const settingsUi = await main.webContents.executeJavaScript(`(() => {
    const block = [...document.querySelectorAll("details.advanced")].find((item) => item.textContent.includes("一般不需要填写"));
    return { found: Boolean(block), open: Boolean(block && block.open), dialog: Boolean(document.querySelector(".dialog")) };
  })()`) as { found: boolean; open: boolean; dialog: boolean };
  if (!settingsUi.found || settingsUi.open || settingsUi.dialog) throw new Error("设置里的 Azure 客户端 ID 没有收进高级选项");
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
  const toastText = await toast.webContents.executeJavaScript("document.body.innerText") as string;
  if (!toastText.includes("不是验证码") || !toastText.includes("导出脱敏样本")) throw new Error("通知上没有校正按钮");
  if (toastText.includes("打开链接")) throw new Error("验证码通知被当成了链接邮件");
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
