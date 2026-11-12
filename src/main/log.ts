import { redact } from "../shared/redact.js";

export function logInfo(message: string, extra?: Record<string, unknown>): void {
  const suffix = extra ? ` ${JSON.stringify(redact(extra))}` : "";
  console.log(`[码到] ${message}${suffix}`);
}
