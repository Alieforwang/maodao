import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { ensureGreenMailJar } from "./ensure-greenmail.mjs";

const root = process.cwd();
fs.rmSync(path.join(root, ".e2e-userdata"), { recursive: true, force: true });
const imapPort = 24143;
const smtpPort = 24025;
const shotDir = path.join(root, "docs/screenshots");
fs.mkdirSync(shotDir, { recursive: true });

const jar = await ensureGreenMailJar(root);
const greenmail = spawn("java", [
  "-Dgreenmail.imap.hostname=127.0.0.1",
  `-Dgreenmail.imap.port=${imapPort}`,
  "-Dgreenmail.smtp.hostname=127.0.0.1",
  `-Dgreenmail.smtp.port=${smtpPort}`,
  "-Dgreenmail.users=ada:s3cret@example.com",
  "-Dgreenmail.users.login=email",
  "-jar",
  jar,
], { stdio: "pipe" });

function waitPort(port) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        if (Date.now() - started > 30_000) reject(new Error(`端口 ${port} 未就绪`));
        else setTimeout(tick, 200);
      });
    };
    tick();
  });
}

try {
  await waitPort(imapPort);
  await waitPort(smtpPort);
  const code = await new Promise((resolve) => {
    const child = spawn("xvfb-run", ["-a", "-s", "-screen 0 1400x900x24", path.join(root, "node_modules/.bin/electron"), "--no-sandbox", "."], {
      cwd: root,
      env: {
        ...process.env,
        MADAO_E2E: "1",
        MADAO_IMAP_PORT: String(imapPort),
        MADAO_SMTP_PORT: String(smtpPort),
        MADAO_SHOT_DIR: shotDir,
        MADAO_RESULT: path.join(root, "e2e-result.json"),
        MADAO_USER_DATA: path.join(root, ".e2e-userdata"),
      },
      stdio: "inherit",
    });
    child.on("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) process.exit(code);
  const result = JSON.parse(fs.readFileSync(path.join(root, "e2e-result.json"), "utf8"));
  console.log(JSON.stringify(result, null, 2));
} finally {
  greenmail.kill();
}
