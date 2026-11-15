import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/shared/types.js";
import {
  THUNDERBIRD_CLIENT_ID,
  THUNDERBIRD_REDIRECT_URI,
  buildAuthorizationCodeRequest,
  buildAuthorizeUrl,
  buildRefreshRequest,
  isRedirectNavigation,
  parseOAuthCallback,
  resolveOutlookAuth,
} from "../src/shared/outlookAuth.js";
import { OUTLOOK_SCOPES } from "../src/main/oauth.js";

const settings = { ...DEFAULT_SETTINGS };

describe("Outlook 登录配置", () => {
  it("客户端 ID 留空时使用 Thunderbird 公共客户端和 https://localhost", () => {
    const config = resolveOutlookAuth({ ...settings, outlookClientId: "  " });
    expect(config.clientId).toBe(THUNDERBIRD_CLIENT_ID);
    expect(config.redirectUri).toBe(THUNDERBIRD_REDIRECT_URI);
    expect(config.mode).toBe("embedded");
    expect(config.tenant).toBe("consumers");
  });

  it("填入 Thunderbird 客户端 ID 时同样走内置回调", () => {
    const config = resolveOutlookAuth({ ...settings, outlookClientId: THUNDERBIRD_CLIENT_ID.toUpperCase() });
    expect(config.mode).toBe("embedded");
    expect(config.redirectUri).toBe("https://localhost");
  });

  it("自己的客户端 ID 使用本机回环回调", () => {
    const config = resolveOutlookAuth({ ...settings, outlookClientId: "11111111-2222-3333-4444-555555555555", oauthRedirectPort: 45832 });
    expect(config.mode).toBe("loopback");
    expect(config.redirectUri).toBe("http://127.0.0.1:45832/callback");
  });

  it("自定义回调地址优先于按客户端猜测", () => {
    const config = resolveOutlookAuth({
      ...settings,
      outlookClientId: "11111111-2222-3333-4444-555555555555",
      oauthRedirectUri: "https://localhost",
    });
    expect(config.mode).toBe("embedded");
    expect(config.redirectUri).toBe("https://localhost");
  });
});

describe("Outlook 回调拦截", () => {
  it("识别 https://localhost 上的 code 和 state，并拒绝带端口或别的主机", () => {
    const target = "https://localhost/?code=auth-code&state=state-1";
    expect(isRedirectNavigation(target, THUNDERBIRD_REDIRECT_URI)).toBe(true);
    expect(parseOAuthCallback(target, THUNDERBIRD_REDIRECT_URI)).toEqual({
      code: "auth-code",
      state: "state-1",
      error: undefined,
    });
    expect(isRedirectNavigation("https://localhost:8443/?code=auth-code&state=state-1", THUNDERBIRD_REDIRECT_URI)).toBe(false);
    expect(parseOAuthCallback("https://evil.example/?code=auth-code&state=state-1", THUNDERBIRD_REDIRECT_URI)).toBeNull();
    expect(parseOAuthCallback("https://localhost/?error=invalid_request&error_description=redirect_uri%20is%20not%20valid", THUNDERBIRD_REDIRECT_URI)?.error).toContain("redirect_uri");
  });

  it("授权地址和刷新请求使用同一个客户端与回调，且没有 client secret", () => {
    const authorize = new URL(buildAuthorizeUrl({
      tenant: "consumers",
      clientId: THUNDERBIRD_CLIENT_ID,
      redirectUri: THUNDERBIRD_REDIRECT_URI,
      challenge: "challenge",
      state: "state-1",
      scope: OUTLOOK_SCOPES,
    }));
    expect(authorize.searchParams.get("redirect_uri")).toBe("https://localhost");
    expect(authorize.searchParams.get("client_id")).toBe(THUNDERBIRD_CLIENT_ID);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    const codeBody = buildAuthorizationCodeRequest({
      clientId: THUNDERBIRD_CLIENT_ID,
      redirectUri: THUNDERBIRD_REDIRECT_URI,
      code: "auth-code",
      verifier: "verifier",
      scope: OUTLOOK_SCOPES,
    });
    const refreshBody = buildRefreshRequest({
      clientId: THUNDERBIRD_CLIENT_ID,
      redirectUri: THUNDERBIRD_REDIRECT_URI,
      refreshToken: "refresh-token",
      scope: OUTLOOK_SCOPES,
    });
    expect(codeBody.get("redirect_uri")).toBe(refreshBody.get("redirect_uri"));
    expect(codeBody.get("client_id")).toBe(refreshBody.get("client_id"));
    expect(codeBody.get("client_secret")).toBeNull();
    expect(refreshBody.get("client_secret")).toBeNull();
    expect(codeBody.get("scope")).toContain("https://outlook.office.com/IMAP.AccessAsUser.All");
    expect(codeBody.get("scope")).toContain("offline_access");
  });
});
