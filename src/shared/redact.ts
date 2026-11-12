const SECRET_KEYS = /password|pass|secret|token|authorization|auth|cookie|refresh|access/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEYS.test(key) ? "[redacted]" : redact(item);
  }
  return output;
}

export function explainImapError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/unsafe login/i.test(message)) return "网易拒绝了登录。请确认已开启 IMAP，并使用客户端授权码。";
  if (/application-specific password/i.test(message)) return "Gmail 需要应用专用密码，不能填账号密码。";
  if (/authentication|auth|login failed|invalid credentials|AUTHENTICATIONFAILED/i.test(message)) return "登录失败，请检查账号和授权码。";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) return "找不到服务器，请检查网络或服务器地址。";
  if (/ETIMEDOUT|timeout|TIMEDOUT/i.test(message)) return "连接超时。";
  if (/certificate|UNABLE_TO_VERIFY/i.test(message)) return "服务器证书校验失败。";
  return "连接中断，将自动重试。";
}

export function isAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { authenticationFailed?: boolean; message?: string };
  if (record.authenticationFailed) return true;
  return /authentication|invalid credentials|login failed|AUTHENTICATIONFAILED|application-specific password|unsafe login/i.test(record.message || "");
}
