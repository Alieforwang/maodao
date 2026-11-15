import type { ProviderId } from "./types.js";

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  hint: string;
  host: string;
  port: number;
  letter: string;
  secretLabel: string;
  placeholder: string;
  authMethod: "password" | "oauth";
  guideTitle: string;
  steps: string[];
  link: string;
  linkText: string;
}

export const PROVIDERS: Record<ProviderId, ProviderPreset> = {
  qq: {
    id: "qq",
    name: "QQ 邮箱",
    hint: "授权码",
    host: "imap.qq.com",
    port: 993,
    letter: "Q",
    secretLabel: "授权码",
    placeholder: "name@qq.com",
    authMethod: "password",
    guideTitle: "QQ 邮箱怎么拿到授权码",
    steps: [
      "网页打开 QQ 邮箱，进入设置 → 账号。",
      "开启 IMAP/SMTP 服务，按提示用密保手机发短信。",
      "把生成的授权码贴到上面。不要填 QQ 密码。",
    ],
    link: "https://service.mail.qq.com/detail/0/75",
    linkText: "QQ 邮箱 IMAP 说明",
  },
  netease: {
    id: "netease",
    name: "网易 163",
    hint: "授权码",
    host: "imap.163.com",
    port: 993,
    letter: "163",
    secretLabel: "客户端授权码",
    placeholder: "name@163.com",
    authMethod: "password",
    guideTitle: "网易 163 / 126 怎么开 IMAP",
    steps: [
      "网页进入设置 → POP3/SMTP/IMAP，开启 IMAP。",
      "新增客户端授权码，填到上面，不要填邮箱密码。",
      "126 邮箱把服务器改成 imap.126.com。码到会发送 IMAP ID，避免 Unsafe Login。",
    ],
    link: "https://help.mail.163.com/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171312b77aeea3d2c8a8",
    linkText: "网易邮箱 IMAP 说明",
  },
  gmail: {
    id: "gmail",
    name: "Gmail",
    hint: "应用专用密码",
    host: "imap.gmail.com",
    port: 993,
    letter: "G",
    secretLabel: "应用专用密码",
    placeholder: "name@gmail.com",
    authMethod: "password",
    guideTitle: "Gmail 要用应用专用密码",
    steps: [
      "Google 账号先开启两步验证。",
      "生成 16 位应用专用密码，中间空格可以不输入。",
      "Gmail 设置里确认 IMAP 已开启。不要填 Google 账号密码。",
    ],
    link: "https://support.google.com/accounts/answer/185833?hl=zh-Hans",
    linkText: "Google 应用专用密码说明",
  },
  outlook: {
    id: "outlook",
    name: "Outlook",
    hint: "浏览器登录",
    host: "outlook.office365.com",
    port: 993,
    letter: "O",
    secretLabel: "授权码",
    placeholder: "name@outlook.com",
    authMethod: "oauth",
    guideTitle: "Outlook 个人账号走登录，不走授权码",
    steps: [
      "在 Azure 免费注册应用，账户类型包含个人 Microsoft 账号。",
      "重定向地址填 http://127.0.0.1:45832/callback，并允许公共客户端流。",
      "权限加上 IMAP.AccessAsUser.All、offline_access、openid、email，把客户端 ID 填进设置。",
    ],
    link: "https://learn.microsoft.com/zh-cn/entra/identity-platform/quickstart-register-app",
    linkText: "如何注册 Azure 应用",
  },
};

export const PROVIDER_LIST = [PROVIDERS.qq, PROVIDERS.netease, PROVIDERS.gmail, PROVIDERS.outlook];

export function needsImapId(host: string): boolean {
  return /(^|\.)(163\.com|126\.com|yeah\.net)$/i.test(host.trim());
}

const APP_PASSWORD_PROVIDERS = new Set<ProviderId>(["gmail", "qq", "netease"]);

/** Remove every whitespace character, including full-width spaces and line breaks. */
export function stripCredentialWhitespace(value: string): string {
  return value.replace(/[\s\u3000\u00a0\u2000-\u200b\u202f\u205f\ufeff]+/g, "");
}

export function normalizePassword(provider: ProviderId, password: string): string {
  if (APP_PASSWORD_PROVIDERS.has(provider)) return stripCredentialWhitespace(password);
  return password.trim();
}
