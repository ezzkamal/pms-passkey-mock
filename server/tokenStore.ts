import "./env.js";
import Database from "better-sqlite3";
import { resolve } from "node:path";

type AccountRow = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
};

const defaultDbPath = process.env.VERCEL ? "/tmp/pms-mock-better-auth.sqlite" : ".data/better-auth.sqlite";
const dbPath = resolve(process.cwd(), process.env.BETTER_AUTH_SQLITE_PATH || defaultDbPath);
const keycloakClientId = process.env.AUTH_KEYCLOAK_ID || process.env.KEYCLOAK_CLIENT_ID || "";
const keycloakClientSecret = process.env.AUTH_KEYCLOAK_SECRET || process.env.KEYCLOAK_CLIENT_SECRET || "";
const keycloakIssuer = process.env.AUTH_KEYCLOAK_ISSUER || process.env.KEYCLOAK_ISSUER || "";

export async function getLatestKeycloakAccessToken(): Promise<string> {
  const db = new Database(dbPath);
  const account = db.prepare("select id, accessToken, refreshToken, accessTokenExpiresAt from account where providerId = ? order by updatedAt desc limit 1").get("keycloak") as AccountRow | undefined;

  if (!account) {
    throw new Error("No stored Keycloak account found. Sign in once on http://localhost:3000 first.");
  }

  if (account.accessToken && !isExpiring(account.accessTokenExpiresAt)) {
    return account.accessToken;
  }

  if (!account.refreshToken) {
    throw new Error("Stored Keycloak token is expired and no refresh token is available.");
  }

  const refreshed = await refreshAccessToken(account.refreshToken);
  const accessTokenExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 300) * 1000).toISOString();
  const refreshTokenExpiresAt = refreshed.refresh_expires_in ? new Date(Date.now() + refreshed.refresh_expires_in * 1000).toISOString() : null;

  db.prepare(
    `update account
       set accessToken = ?,
           refreshToken = ?,
           accessTokenExpiresAt = ?,
           refreshTokenExpiresAt = coalesce(?, refreshTokenExpiresAt),
           scope = coalesce(?, scope),
           updatedAt = ?
     where id = ?`,
  ).run(refreshed.access_token, refreshed.refresh_token ?? account.refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, refreshed.scope ?? null, new Date().toISOString(), account.id);

  return refreshed.access_token;
}

function isExpiring(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() - Date.now() < 60_000;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  if (!keycloakClientId || !keycloakClientSecret || !keycloakIssuer) {
    throw new Error("Keycloak env is incomplete; cannot refresh stored token.");
  }

  const response = await fetch(`${keycloakIssuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: keycloakClientId,
      client_secret: keycloakClientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Keycloak refresh failed with ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<TokenResponse>;
}
