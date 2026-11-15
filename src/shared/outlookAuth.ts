import type { Settings } from "./types.js";

/** Thunderbird's public Microsoft client. Registered redirect is exactly https://localhost. */
export const THUNDERBIRD_CLIENT_ID = "9e5f94bc-e8a4-4e73-b8be-63364c29d753";
export const THUNDERBIRD_REDIRECT_URI = "https://localhost";

export type OutlookRedirectMode = "embedded" | "loopback";

export interface OutlookAuthConfig {
  clientId: string;
  redirectUri: string;
  mode: OutlookRedirectMode;
  tenant: string;
}

export function resolveOutlookAuth(settings: Pick<Settings, "outlookClientId" | "outlookTenant" | "oauthRedirectPort" | "oauthRedirectUri">): OutlookAuthConfig {
  const clientId = settings.outlookClientId.trim() || THUNDERBIRD_CLIENT_ID;
  const tenant = settings.outlookTenant.trim() || "consumers";
  const custom = settings.oauthRedirectUri.trim();
  const redirectUri = custom || (isThunderbirdClient(clientId) ? THUNDERBIRD_REDIRECT_URI : loopbackRedirect(settings.oauthRedirectPort));
  return {
    clientId,
    redirectUri,
    mode: redirectMode(redirectUri),
    tenant,
  };
}

export function isThunderbirdClient(clientId: string): boolean {
  return clientId.trim().toLowerCase() === THUNDERBIRD_CLIENT_ID;
}

export function loopbackRedirect(port: number): string {
  const safePort = Number.isInteger(port) && port > 0 ? port : 45832;
  return `http://127.0.0.1:${safePort}/callback`;
}

export function redirectMode(redirectUri: string): OutlookRedirectMode {
  try {
    const url = new URL(redirectUri);
    if (url.protocol === "https:" && url.hostname === "localhost" && url.port === "" && (url.pathname === "" || url.pathname === "/")) {
      return "embedded";
    }
  } catch {
    return "loopback";
  }
  return "loopback";
}

export interface ParsedOAuthCallback {
  code?: string;
  state?: string;
  error?: string;
}

/** True when the browser is being sent to the registered redirect, before or after the query arrives. */
export function isRedirectNavigation(navigationUrl: string, redirectUri: string): boolean {
  const actual = readUrl(navigationUrl);
  const expected = readUrl(redirectUri);
  if (!actual || !expected) return false;
  if (actual.protocol !== expected.protocol || actual.hostname !== expected.hostname) return false;
  if (actual.port !== expected.port) return false;
  if (expected.pathname && expected.pathname !== "/") return actual.pathname === expected.pathname;
  return true;
}

export function parseOAuthCallback(navigationUrl: string, redirectUri: string): ParsedOAuthCallback | null {
  if (!isRedirectNavigation(navigationUrl, redirectUri)) return null;
  const url = readUrl(navigationUrl);
  if (!url) return null;
  const error = url.searchParams.get("error_description") || url.searchParams.get("error") || undefined;
  const code = url.searchParams.get("code") || undefined;
  const state = url.searchParams.get("state") || undefined;
  if (!code && !error) return null;
  return { code, state, error };
}

export function loopbackListenTarget(redirectUri: string): { host: string; port: number; path: string } {
  const url = new URL(redirectUri);
  const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  return { host, port, path: url.pathname || "/" };
}

export function buildAuthorizeUrl(input: { tenant: string; clientId: string; redirectUri: string; challenge: string; state: string; scope: string }): string {
  const url = new URL(`https://login.microsoftonline.com/${input.tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scope);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function buildAuthorizationCodeRequest(input: { clientId: string; redirectUri: string; code: string; verifier: string; scope: string }): URLSearchParams {
  return new URLSearchParams({
    client_id: input.clientId,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
    scope: input.scope,
  });
}

export function buildRefreshRequest(input: { clientId: string; redirectUri: string; refreshToken: string; scope: string }): URLSearchParams {
  return new URLSearchParams({
    client_id: input.clientId,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    redirect_uri: input.redirectUri,
    scope: input.scope,
  });
}

/** Electron webRequest match patterns must be scheme://host/path and the path cannot be empty. */
export function assertElectronUrlPattern(pattern: string): void {
  const match = /^([a-zA-Z*][a-zA-Z0-9+.-]*|\*):\/\/([^/]*)(\/.*)?$/.exec(pattern);
  if (!match?.[3]) {
    throw new Error(`Invalid url pattern ${pattern}: Empty path.`);
  }
}

export function webRequestPatterns(redirectUri: string): string[] {
  const url = new URL(redirectUri);
  const origin = `${url.protocol}//${url.host}`;
  const patterns = [`${origin}/*`];
  if (!url.port) patterns.push(`${origin}/?*`);
  for (const pattern of patterns) assertElectronUrlPattern(pattern);
  return patterns;
}

function readUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
