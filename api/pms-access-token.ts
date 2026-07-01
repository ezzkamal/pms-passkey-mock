import { fromNodeHeaders } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import { auth, ensureAuthMigrations, keycloakProviderId } from "../server/auth.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { message: "Method not allowed" });
    return;
  }

  try {
    await ensureAuthMigrations();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      sendJson(res, 401, { message: "Not signed in" });
      return;
    }

    const tokenResponse = await auth.api.getAccessToken({
      headers: fromNodeHeaders(req.headers),
      body: { providerId: keycloakProviderId },
    });

    sendJson(res, 200, tokenResponse);
  } catch (error) {
    sendJson(res, 500, { message: error instanceof Error ? error.message : "Failed to get PMS access token" });
  }
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
