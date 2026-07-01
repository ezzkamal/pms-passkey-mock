import type { IncomingMessage, ServerResponse } from "node:http";
import { getLatestKeycloakAccessToken } from "../../server/tokenStore.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { message: "Method not allowed" });
    return;
  }

  if (process.env.PMS_MOCK_DEV_TOKEN_AUTH !== "true") {
    sendJson(res, 404, { message: "Dev token auth is disabled." });
    return;
  }

  try {
    sendJson(res, 200, { accessToken: await getLatestKeycloakAccessToken() });
  } catch (error) {
    sendJson(res, 500, { message: error instanceof Error ? error.message : "Failed to get stored PMS access token" });
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
