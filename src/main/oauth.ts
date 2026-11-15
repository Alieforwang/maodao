import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { OutlookFailure } from "../shared/outlookMailbox.js";
import type { Settings } from "../shared/types.js";
import {
  buildAuthorizationCodeRequest,
  buildAuthorizeUrl,
  buildRefreshRequest,
  loopbackListenTarget,
  parseOAuthCallback,
  resolveOutlookAuth,
  type OutlookAuthConfig,
} from "../shared/outlookAuth.js";

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

export interface OAuthStartOptions {
  replaceId?: string;
  host?: string;
  port?: number;
}

export type OAuthEvent =
  | { type: "progress"; message: string }
  | { type: "device"; userCode: string; verificationUri: string; message: string; expiresIn: number }
  | { type: "success"; email: string; loginName?: string; accountId: string }
  | { type: "need-mailbox"; loginName: string; suggestion: string }
  | { type: "duplicate"; email: string; accountId: string }
  | { type: "error"; message: string; failure: OutlookFailure; loginName?: string; suggestion?: string };

export function readJwtClaims(idToken: string | undefined): { email?: string; preferred_username?: string; upn?: string; emails?: string[] } {
  if (!idToken) return {};
  const part = idToken.split(".")[1];
  if (!part) return {};
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      email?: string;
      preferred_username?: string;
      upn?: string;
      emails?: string[];
      verified_primary_email?: string;
    };
    const emails = [...(Array.isArray(json.emails) ? json.emails : [])];
    if (json.verified_primary_email) emails.push(json.verified_primary_email);
    return { email: json.email, preferred_username: json.preferred_username, upn: json.upn, emails };
  } catch {
    return {};
  }
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function readJwtEmail(idToken: string | undefined): string | undefined {
  const claims = readJwtClaims(idToken);
  return claims.email || claims.preferred_username || claims.upn || claims.emails?.[0];
}

async function postForm(url: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
    const code = cause && typeof cause === "object" && "code" in cause ? String((cause as { code?: string }).code || "") : "";
    const message = error instanceof Error ? error.message : "网络错误";
    throw new Error(code ? `${code} ${message}` : `无法连接微软服务器 ${message}`);
  }
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
  const config = resolveOutlookAuth(settings);
  const json = await postForm(endpointFor(config, "token"), buildRefreshRequest({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    refreshToken,
    scope: OUTLOOK_SCOPES,
  }));
  return tokensFromJson(json);
}

function endpointFor(config: OutlookAuthConfig, kind: "authorize" | "token" | "devicecode"): string {
  return `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/${kind}`;
}

export class OutlookLogin {
  private cancelled = false;
  private server: http.Server | undefined;
  private cancelEmbedded: (() => void) | undefined;

  cancel(): void {
    this.cancelled = true;
    this.server?.close();
    this.cancelEmbedded?.();
  }

  async pkce(
    settings: Settings,
    openExternal: (url: string) => void,
    onEvent: (event: OAuthEvent) => void,
    openEmbedded?: (authorizeUrl: string, redirectUri: string) => { result: Promise<string>; close: () => void },
  ): Promise<OAuthTokens> {
    const config = resolveOutlookAuth(settings);
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const state = base64url(randomBytes(16));
    const authorizeUrl = buildAuthorizeUrl({
      tenant: config.tenant,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      challenge,
      state,
      scope: OUTLOOK_SCOPES,
    });
    onEvent({ type: "progress", message: config.mode === "embedded" ? "正在打开登录窗口…" : "正在等待浏览器登录…" });
    const callbackUrl = config.mode === "embedded"
      ? await this.embeddedCallback(authorizeUrl, config.redirectUri, openEmbedded)
      : await this.loopbackCallback(config.redirectUri, state, () => openExternal(authorizeUrl));
    const parsed = parseOAuthCallback(callbackUrl, config.redirectUri);
    if (!parsed) throw new Error("没有收到登录回调。");
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.code || parsed.state !== state) throw new Error("登录回调无效。");
    const json = await postForm(endpointFor(config, "token"), buildAuthorizationCodeRequest({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      code: parsed.code,
      verifier,
      scope: OUTLOOK_SCOPES,
    }));
    return tokensFromJson(json);
  }

  private embeddedCallback(
    authorizeUrl: string,
    redirectUri: string,
    openEmbedded: ((authorizeUrl: string, redirectUri: string) => { result: Promise<string>; close: () => void }) | undefined,
  ): Promise<string> {
    if (!openEmbedded) throw new Error("当前环境不能打开登录窗口。");
    const opened = openEmbedded(authorizeUrl, redirectUri);
    this.cancelEmbedded = opened.close;
    return opened.result;
  }

  private loopbackCallback(redirectUri: string, state: string, open: () => void): Promise<string> {
    const target = loopbackListenTarget(redirectUri);
    return new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => {
        const url = new URL(request.url || "/", `http://${target.host}:${target.port}`);
        if (url.pathname !== target.path) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end("<!doctype html><meta charset='utf-8'><title>码到</title><p style='font-family:sans-serif'>可以关闭这个页面，回到码到。</p>");
        server.close();
        const error = url.searchParams.get("error_description") || url.searchParams.get("error");
        const code = url.searchParams.get("code");
        if (error) reject(new Error(error));
        else if (!code || url.searchParams.get("state") !== state) reject(new Error("登录回调无效。"));
        else resolve(url.toString());
      });
      this.server = server;
      server.once("error", reject);
      server.listen(target.port, target.host, () => open());
    });
  }

  async device(settings: Settings, onEvent: (event: OAuthEvent) => void): Promise<OAuthTokens> {
    const config = resolveOutlookAuth(settings);
    const started = await postForm(
      endpointFor(config, "devicecode"),
      new URLSearchParams({ client_id: config.clientId, scope: OUTLOOK_SCOPES }),
    );
    const deviceCode = String(started.device_code || "");
    const interval = Math.max(5, Number(started.interval || 5));
    const expiresIn = Math.max(30, Number(started.expires_in || 900));
    onEvent({
      type: "device",
      userCode: String(started.user_code || ""),
      verificationUri: String(started.verification_uri || "https://microsoft.com/link"),
      message: String(started.message || "在浏览器里输入设备码。"),
      expiresIn,
    });
    const deadline = Date.now() + expiresIn * 1000;
    let wait = interval;
    while (!this.cancelled && Date.now() < deadline) {
      await delay(wait * 1000);
      const response = await fetch(endpointFor(config, "token"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: config.clientId,
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
      if (error === "expired_token" || error === "code_expired" || /expired/i.test(error)) throw new Error("设备码已过期。");
      throw new Error(String(json.error_description || error || "设备码登录失败。"));
    }
    throw new Error(this.cancelled ? "已取消登录。" : "设备码已过期。");
  }

  }

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

