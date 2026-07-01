import "./env";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { genericOAuth, keycloak } from "better-auth/plugins/generic-oauth";

const authUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const dbPath = resolve(process.cwd(), process.env.BETTER_AUTH_SQLITE_PATH || ".data/better-auth.sqlite");
const keycloakClientId = process.env.AUTH_KEYCLOAK_ID || process.env.KEYCLOAK_CLIENT_ID || "";
const keycloakClientSecret = process.env.AUTH_KEYCLOAK_SECRET || process.env.KEYCLOAK_CLIENT_SECRET || "";
const keycloakIssuer = process.env.AUTH_KEYCLOAK_ISSUER || process.env.KEYCLOAK_ISSUER || "";
const keycloakPrompt = process.env.AUTH_KEYCLOAK_PROMPT || "login";

mkdirSync(dirname(dbPath), { recursive: true });

if (!keycloakClientId || !keycloakClientSecret || !keycloakIssuer) {
  console.warn("Better Auth Keycloak env is incomplete. Set AUTH_KEYCLOAK_ID, AUTH_KEYCLOAK_SECRET, and AUTH_KEYCLOAK_ISSUER.");
}

export const keycloakProviderId = "keycloak";
const keycloakProvider = keycloak({
  clientId: keycloakClientId,
  clientSecret: keycloakClientSecret,
  issuer: keycloakIssuer,
  scopes: ["openid", "profile", "email"],
  pkce: true,
});

keycloakProvider.prompt = keycloakPrompt as typeof keycloakProvider.prompt;

export const auth = betterAuth({
  baseURL: authUrl,
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "dev-only-pms-mock-secret-change-me-change-me",
  database: new Database(dbPath),
  trustedOrigins: [authUrl, "http://localhost:3000", "http://127.0.0.1:3000"],
  plugins: [
    genericOAuth({
      config: [keycloakProvider],
    }),
  ],
});
