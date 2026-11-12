import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { Settings } from "../shared/types.js";

export const OUTLOOK_SCOPES = [
  "openid",
  "email",
  "offline_access",
  "https://outlook.office.com/IMAP.AccessAsUser.All",
].join(" ");

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  idToken?: string;
}

export type OAuthEvent =
  | { type: "progress"; message: string }
  | { type: "device"; userCode: string; verificationUri: string; message: string }
  | { type: "success"; email: string }
  | { type: "error"; message: string };

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function readJwtEmail(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  const part = idToken.split(".")[1];
  if (!part) return undefined;
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      email?: string;
      preferred_username?: string;
      upn?: string;
    };
    return json.email || json.preferred_username || json.upn;
  } catch {
    return undefined;
  }
}

function endpoint(settings: Settings, kind: "authorize" | "token" | "devicecode"): string {
  const tenant = settings.outlookTenant || "consumers";
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/${kind}`;
}

async function postForm(url: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof json.error === "string") {
    throw new Error(String(json.error_description || json.error || `登录服务返回 ${response.status}`));
  }
  return json;
}

function tokensFromJson(json: Record<string, unknown>): OAuthTokens {
  const expiresIn = Number(json.expires_in || 3600);
  return {
    accessToken: String(json.access_token || ""),
    refreshToken: json.refresh_token ? String(json.refresh_token) : undefined,
    expiresAt: Date.now() + expiresIn * 1000,
    idToken: json.id_token ? String(json.id_token) : undefined,
    email: readJwtEmail(json.id_token ? String(json.id_token) : undefined),
  };
}

export async function refreshOutlookToken(settings: Settings, refreshToken: string): Promise<OAuthTokens> {
  const json = await postForm(
    endpoint(settings, "token"),
    new URLSearchParams({
      client_id: settings.outlookClientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: OUTLOOK_SCOPES,
    }),
  );
  return tokensFromJson(json);
}

export class OutlookLogin {
  private cancelled = false;
  private server: http.Server | undefined;

  cancel(): void {
    this.cancelled = true;
    this.server?.close();
  }

  async pkce(settings: Settings, open: (url: string) => void, onEvent: (event: OAuthEvent) => void): Promise<OAuthTokens> {
    this.requireClient(settings);
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const state = base64url(randomBytes(16));
    const port = settings.oauthRedirectPort || 45832;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const code = await new Promise<string>((resolve, reject) => {
      const server = http.createServer((request, response) => {
        const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
        if (url.pathname !== "/callback") {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end("<!doctype html><meta charset='utf-8'><title>码到</title><p style='font-family:sans-serif'>可以关闭这个页面，回到码到。</p>");
        server.close();
        const error = url.searchParams.get("error_description") || url.searchParams.get("error");
        const authCode = url.searchParams.get("code");
        if (error) reject(new Error(error));
        else if (!authCode || url.searchParams.get("state") !== state) reject(new Error("登录回调无效。"));
        else resolve(authCode);
      });
      this.server = server;
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        onEvent({ type: "progress", message: "正在等待浏览器登录…" });
        open(this.authorizationUrl(settings, challenge, state));
      });
    });
    const json = await postForm(
      endpoint(settings, "token"),
      new URLSearchParams({
        client_id: settings.outlookClientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: OUTLOOK_SCOPES,
      }),
    );
    const tokens = tokensFromJson(json);
    if (!tokens.email) throw new Error("登录成功，但没有拿到邮箱地址。");
    return tokens;
  }

  authorizationUrl(settings: Settings, challenge: string, state: string): string {
    const port = settings.oauthRedirectPort || 45832;
    const url = new URL(endpoint(settings, "authorize"));
    url.searchParams.set("client_id", settings.outlookClientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", `http://127.0.0.1:${port}/callback`);
    url.searchParams.set("scope", OUTLOOK_SCOPES);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  async device(settings: Settings, onEvent: (event: OAuthEvent) => void): Promise<OAuthTokens> {
    this.requireClient(settings);
    const started = await postForm(
      endpoint(settings, "devicecode"),
      new URLSearchParams({ client_id: settings.outlookClientId, scope: OUTLOOK_SCOPES }),
    );
    const deviceCode = String(started.device_code || "");
    const interval = Math.max(5, Number(started.interval || 5));
    onEvent({
      type: "device",
      userCode: String(started.user_code || ""),
      verificationUri: String(started.verification_uri || "https://microsoft.com/devicelogin"),
      message: String(started.message || "在浏览器里输入设备码。"),
    });
    const deadline = Date.now() + 15 * 60 * 1000;
    let wait = interval;
    while (!this.cancelled && Date.now() < deadline) {
      await delay(wait * 1000);
      const response = await fetch(endpoint(settings, "token"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: settings.outlookClientId,
          device_code: deviceCode,
        }),
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (json.access_token) return tokensFromJson(json);
      const error = String(json.error || "");
      if (error === "authorization_pending") continue;
      if (error === "slow_down") {
        wait += 5;
        continue;
      }
      throw new Error(String(json.error_description || error || "设备码登录失败。"));
    }
    throw new Error(this.cancelled ? "已取消登录。" : "设备码已过期。");
  }

  private requireClient(settings: Settings): void {
    if (!settings.outlookClientId.trim()) {
      throw new Error("先在设置里填写 Outlook 的 Azure 客户端 ID。");
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

