import "./env.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { genericOAuth, keycloak } from "better-auth/plugins/generic-oauth";
import { PostgresDialect } from "kysely";
import pg from "pg";

const authUrl = process.env.BETTER_AUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const defaultDbPath = process.env.VERCEL ? "/tmp/pms-mock-better-auth.sqlite" : ".data/better-auth.sqlite";
const dbPath = resolve(process.cwd(), process.env.BETTER_AUTH_SQLITE_PATH || defaultDbPath);
// Serverless functions don't share /tmp, so sqlite sessions vanish between the auth
// callback and the token route. Any Postgres URL switches Better Auth to shared storage.
const postgresUrl = process.env.BETTER_AUTH_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const keycloakClientId = process.env.AUTH_KEYCLOAK_ID || process.env.KEYCLOAK_CLIENT_ID || "";
const keycloakClientSecret = process.env.AUTH_KEYCLOAK_SECRET || process.env.KEYCLOAK_CLIENT_SECRET || "";
const keycloakIssuer = process.env.AUTH_KEYCLOAK_ISSUER || process.env.KEYCLOAK_ISSUER || "";
const keycloakPrompt = process.env.AUTH_KEYCLOAK_PROMPT || "login";
const trustedOrigins = Array.from(
  new Set(
    [
      authUrl,
      process.env.VITE_APP_ORIGIN,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ].filter(Boolean) as string[],
  ),
);

if (!postgresUrl) {
  mkdirSync(dirname(dbPath), { recursive: true });
}

if (process.env.VERCEL && !postgresUrl) {
  console.warn("Running on Vercel without a Postgres URL. Sessions will not survive across serverless functions — set DATABASE_URL.");
}

const database = postgresUrl
  ? {
      dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: postgresUrl, max: 1 }) }),
      type: "postgres" as const,
    }
  : new Database(dbPath);

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
  database,
  trustedOrigins,
  plugins: [
    genericOAuth({
      config: [keycloakProvider],
    }),
  ],
});

let migrationsPromise: Promise<void> | null = null;

export function ensureAuthMigrations(): Promise<void> {
  migrationsPromise ??= auth.$context.then((context) => context.runMigrations());
  return migrationsPromise;
}
