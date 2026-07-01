import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

export type BetterAuthSession = {
  user?: {
    id?: string;
    email?: string;
    name?: string;
    image?: string;
  };
  session?: {
    id?: string;
    expiresAt?: string | Date;
  };
};

export type PmsAccessTokenResponse = {
  accessToken: string;
  idToken?: string;
  tokenType?: string;
  accessTokenExpiresAt?: string;
};

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [genericOAuthClient()],
});

export async function signInWithKeycloak() {
  await authClient.signIn.oauth2({
    providerId: "keycloak",
    callbackURL: window.location.origin,
  });
}

export async function signOutOfBetterAuth() {
  await authClient.signOut();
}

export async function fetchPmsAccessToken(): Promise<PmsAccessTokenResponse> {
  const response = await fetch("/api/pms-access-token", {
    method: "GET",
    credentials: "include",
  });
  if (response.status === 401 && import.meta.env.VITE_DEV_TOKEN_AUTH === "true") {
    return fetchDevPmsAccessToken();
  }

  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`Better Auth access-token request failed with ${response.status}${bodyText ? `: ${bodyText}` : ""}`);
  }

  if (!contentType.includes("application/json")) {
    throw new Error("The PMS token route returned HTML instead of JSON. Stop any Vite-only server on port 3000 and start this app with pnpm dev so the Better Auth server routes are mounted.");
  }

  const payload = JSON.parse(bodyText) as PmsAccessTokenResponse;
  if (!payload.accessToken) {
    throw new Error("Better Auth did not return a Keycloak access token for PMS. Check the Keycloak client config, then sign out and sign in again.");
  }

  return payload;
}

async function fetchDevPmsAccessToken(): Promise<PmsAccessTokenResponse> {
  const response = await fetch("/api/dev/pms-access-token", {
    method: "GET",
    credentials: "include",
  });
  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`Dev PMS token request failed with ${response.status}${bodyText ? `: ${bodyText}` : ""}`);
  }

  if (!contentType.includes("application/json")) {
    throw new Error("The dev PMS token route returned HTML instead of JSON.");
  }

  const payload = JSON.parse(bodyText) as PmsAccessTokenResponse;
  if (!payload.accessToken) {
    throw new Error("The dev PMS token route did not return a Keycloak access token.");
  }

  return payload;
}
