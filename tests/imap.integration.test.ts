import { spawn, type ChildProcess } from "node:child_process";
// @ts-expect-error plain JavaScript helper
import { ensureGreenMailJar } from "../scripts/ensure-greenmail.mjs";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImapFlow } from "imapflow";
import { extractVerificationCode } from "../src/shared/extract.js";
import { parseRawMail } from "../src/shared/mail.js";
import { sendSmtp } from "../src/main/harness.js";

const imapPort = 24143;
const smtpPort = 24025;
let greenmail: ChildProcess | undefined;

async function waitForPort(port: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1", () => {
          socket.end();
          resolve();
        });
        socket.on("error", reject);
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`端口 ${port} 没有打开`);
}

beforeAll(async () => {
  const jar = await ensureGreenMailJar();
  greenmail = spawn("java", [
    "-Dgreenmail.imap.hostname=127.0.0.1",
    `-Dgreenmail.imap.port=${imapPort}`,
    "-Dgreenmail.smtp.hostname=127.0.0.1",
    `-Dgreenmail.smtp.port=${smtpPort}`,
    "-Dgreenmail.users=ada:s3cret@example.com",
    "-Dgreenmail.users.login=email",
    "-jar",
    jar,
  ], { stdio: "pipe" });
  await waitForPort(imapPort);
  await waitForPort(smtpPort);
}, 40_000);

afterAll(() => {
  greenmail?.kill();
});

describe("GreenMail IMAP", () => {
  it("收到邮件后能通过 IDLE 取到验证码", async () => {
    const client = new ImapFlow({
      host: "127.0.0.1",
      port: imapPort,
      secure: false,
      doSTARTTLS: false,
      auth: { user: "ada@example.com", pass: "s3cret" },
      logger: false,
      disableAutoIdle: true,
    });
    client.on("error", () => undefined);
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      let arrived = false;
      client.on("exists", () => { arrived = true; });
      const idle = client.idle();
      await sendSmtp({
        port: smtpPort,
        from: "Alipay <notify@alipay.com>",
        to: "ada@example.com",
        subject: "您正在登录支付宝",
        text: "【支付宝】您的验证码是738291，5分钟内有效。",
      });
      const started = Date.now();
      while (!arrived && Date.now() - started < 15_000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(arrived).toBe(true);
      const messages = await client.fetchAll("1:*", { source: true, uid: true }, { uid: true });
      const source = messages.at(-1)?.source;
      expect(source).toBeTruthy();
      const parsed = await parseRawMail(source!);
      expect(extractVerificationCode(`${parsed.subject}\n${parsed.text}`)?.code).toBe("738291");
      void idle;
    } finally {
      lock.release();
      await client.logout();
    }
  });
});
