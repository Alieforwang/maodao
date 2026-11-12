import { spawn } from "node:child_process";

const vite = spawn("npx", ["vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", "45941"], {
  stdio: "inherit",
});
const electron = spawn("npx", ["electron", "--no-sandbox", "."], {
  stdio: "inherit",
  env: { ...process.env, MADAO_DEV: "1" },
});
const stop = () => {
  vite.kill();
  electron.kill();
};
process.on("SIGINT", stop);
electron.on("exit", () => {
  stop();
  process.exit(0);
});
