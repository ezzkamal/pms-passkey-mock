import { toNodeHandler } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import { auth, ensureAuthMigrations } from "../../server/auth";

const authHandler = toNodeHandler(auth);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ensureAuthMigrations();
  return authHandler(req, res);
}
