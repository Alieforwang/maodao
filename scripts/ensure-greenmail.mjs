import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const URL = "https://repo1.maven.org/maven2/com/icegreen/greenmail-standalone/2.1.3/greenmail-standalone-2.1.3.jar";

export async function ensureGreenMailJar(root = process.cwd()) {
  const jar = path.join(root, "tools/greenmail-standalone.jar");
  if (fs.existsSync(jar) && fs.statSync(jar).size > 1_000_000) return jar;
  fs.mkdirSync(path.dirname(jar), { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn("curl", ["-fsSL", "-o", jar, URL], { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("下载 GreenMail 失败"))));
  });
  return jar;
}
