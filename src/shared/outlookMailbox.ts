export interface MailIdentity {
  email?: string;
  preferred_username?: string;
  upn?: string;
  emails?: string[];
}

export interface MailboxPlan {
  loginName: string;
  /** Consumer Outlook address from claims, if any. */
  mailboxFromClaims: string | null;
  /** IMAP usernames to try, in order. */
  tryOrder: string[];
}

export interface OutlookShown {
  title: string;
  mailbox: string;
  microsoftAccount: string | null;
}

const CONSUMER_HOST = /^(outlook|hotmail|live|msn)(\.[a-z0-9-]+)+$/i;

export function isMicrosoftMailAddress(value: string): boolean {
  const email = normalizeEmail(value);
  const host = email.split("@")[1] || "";
  return CONSUMER_HOST.test(host);
}

export function readIdentity(claims: MailIdentity | null | undefined): MailboxPlan {
  const addresses = uniqueEmails([
    claims?.email,
    claims?.preferred_username,
    claims?.upn,
    ...(claims?.emails || []),
  ]);
  const loginName = normalizeEmail(claims?.preferred_username || claims?.upn || claims?.email || addresses[0] || "");
  const consumer = addresses.filter(isMicrosoftMailAddress);
  const mailboxFromClaims = consumer[0] || (isMicrosoftMailAddress(loginName) ? loginName : null);
  const tryOrder = uniqueEmails([
    ...consumer,
    isMicrosoftMailAddress(loginName) ? loginName : "",
    loginName,
  ]);
  return { loginName, mailboxFromClaims, tryOrder };
}

export function chooseSavedMailbox(plan: MailboxPlan, imapUser: string, explicit = false): { email: string; loginName?: string; imapUser?: string } {
  const email = explicit ? imapUser : (plan.mailboxFromClaims || imapUser);
  const loginName = plan.loginName && normalizeEmail(plan.loginName) !== normalizeEmail(email) ? plan.loginName : undefined;
  const storedImapUser = normalizeEmail(imapUser) !== normalizeEmail(email) ? imapUser : undefined;
  return { email, loginName, imapUser: storedImapUser };
}

export function outlookDisplay(account: { email: string; loginName?: string; alias?: string }): OutlookShown {
  const mailbox = account.email;
  const login = account.loginName?.trim();
  const alias = account.alias?.trim();
  return {
    title: alias || mailbox,
    mailbox,
    microsoftAccount: login && normalizeEmail(login) !== normalizeEmail(mailbox) ? login : null,
  };
}

export function imapLoginUser(account: { email: string; imapUser?: string }): string {
  return account.imapUser?.trim() || account.email;
}

export function findDuplicateOutlook<T extends { id: string; provider: string; email: string }>(accounts: T[], mailbox: string, exceptId?: string): T | undefined {
  const target = normalizeEmail(mailbox);
  return accounts.find((account) => account.provider === "outlook" && account.id !== exceptId && normalizeEmail(account.email) === target);
}

export type OutlookFailureCode = "cancelled" | "window" | "device-expired" | "imap" | "network" | "custom-client" | "unknown";

export interface OutlookFailure {
  code: OutlookFailureCode;
  title: string;
  reasons: string[];
  actions: Array<"retry" | "device" | "edit-mailbox" | "reset-client" | "new-code">;
  raw: string;
}

export function mapOutlookFailure(raw: string, context: { stage: "login" | "device" | "imap"; customClient: boolean }): OutlookFailure {
  const text = raw || "";
  if (context.customClient && /redirect_uri|unauthorized_client|invalid_client|AADSTS/i.test(text)) {
    return { code: "custom-client", title: "自定义 Azure 应用配置有误", reasons: ["回调地址或客户端 ID 与 Azure 里登记的不一致。"], actions: ["reset-client", "retry"], raw: text };
  }
  if (/已取消|登录窗口已关闭|access_denied|user.?cancel/i.test(text)) {
    return { code: "cancelled", title: "登录已取消", reasons: [], actions: ["retry"], raw: text };
  }
  if (context.stage === "device" && /expired|过期|code has expired/i.test(text)) {
    return { code: "device-expired", title: "代码已过期", reasons: [], actions: ["new-code"], raw: text };
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONN|getaddrinfo|ERR_NAME|ERR_INTERNET|ERR_CONNECTION|无法连接微软/i.test(text) && context.stage !== "imap") {
    return { code: "network", title: "无法连接微软服务器，请检查网络", reasons: [], actions: ["retry"], raw: text };
  }
  if (context.stage === "login" && /登录窗口没打开|登录超时|Empty path/i.test(text)) {
    return { code: "window", title: "登录窗口没打开，可能是网络问题", reasons: [], actions: ["retry", "device"], raw: text };
  }
  if (context.stage === "imap") {
    return {
      code: "imap",
      title: "微软账号登录成功，但无法连接邮箱",
      reasons: ["收信地址可能不是这个邮箱。", "Outlook 的 IMAP 可能还没打开。"],
      actions: ["edit-mailbox", "retry"],
      raw: text,
    };
  }
  return { code: "unknown", title: "登录没有完成", reasons: [], actions: ["retry", "device"], raw: text };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueEmails(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const email = value.trim();
    const key = email.toLowerCase();
    if (!email.includes("@") || seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }
  return result;
}
