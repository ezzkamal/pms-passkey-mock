import "dotenv/config";
import express from "express";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { createServer as createViteServer } from "vite";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth, ensureAuthMigrations, keycloakProviderId } from "./auth";
import { getLatestKeycloakAccessToken } from "./tokenStore";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const publicOrigin = process.env.BETTER_AUTH_URL || process.env.VITE_APP_ORIGIN || `http://localhost:${port}`;
const publicHostname = new URL(publicOrigin).hostname;
const hmrPort = process.env.VITE_HMR_PORT ? Number(process.env.VITE_HMR_PORT) : undefined;
const allowedHosts = process.env.VITE_ALLOW_ALL_HOSTS === "true" ? true : [publicHostname, "localhost", "127.0.0.1"];
const httpsKeyPath = process.env.HTTPS_KEY_PATH;
const httpsCertPath = process.env.HTTPS_CERT_PATH;
const pmsProxyBaseUrl = process.env.PMS_PROXY_BASE_URL || "http://localhost:8086/api";
const devTokenAuthEnabled = process.env.PMS_MOCK_DEV_TOKEN_AUTH === "true";

await ensureAuthMigrations();

const app = express();

app.all("/api/auth/*", toNodeHandler(auth));
app.get("/api/pms-access-token", async (req, res) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }

    const tokenResponse = await auth.api.getAccessToken({
      headers: fromNodeHeaders(req.headers),
      body: { providerId: keycloakProviderId },
    });

    res.json(tokenResponse);
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to get PMS access token" });
  }
});
app.get("/api/dev/pms-access-token", async (_req, res) => {
  if (!devTokenAuthEnabled) {
    res.status(404).json({ message: "Dev token auth is disabled." });
    return;
  }

  try {
    res.json({ accessToken: await getLatestKeycloakAccessToken() });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to get stored PMS access token" });
  }
});
app.use(["/api/pms-api", "/pms-api"], pmsProxy);
app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Unknown pms-mock API route." });
});

async function pmsProxy(req: express.Request, res: express.Response) {
  try {
    const targetUrl = new URL(`${pmsProxyBaseUrl}${req.originalUrl.replace(/^\/(?:api\/)?pms-api/, "")}`);
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readRawBody(req);
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: proxyHeaders(req),
      body: body ? new Uint8Array(body) : undefined,
    });

    res.status(response.status);
    if (req.header("x-key-grant-token")) {
      res.setHeader("X-PMS-Mock-Forwarded-Key-Grant-Token", "true");
    }
    response.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.status(502).json({ message: error instanceof Error ? error.message : "PMS proxy request failed" });
  }
}

const vite = await createViteServer({
  server: {
    middlewareMode: true,
    host,
    port,
    allowedHosts,
    hmr: hmrPort ? { port: hmrPort } : undefined,
  },
  appType: "spa",
});

app.use(vite.middlewares);

const server =
  httpsKeyPath && httpsCertPath
    ? https.createServer({ key: readFileSync(httpsKeyPath), cert: readFileSync(httpsCertPath) }, app)
    : http.createServer(app);

server.listen(port, host, () => {
  console.log(`PMS mock with Better Auth ready at ${publicOrigin}`);
  console.log(`Keycloak callback URL: ${publicOrigin}/api/auth/oauth2/callback/keycloak`);
  if (devTokenAuthEnabled) {
    console.log("Dev token auth is enabled for the HTTPS passkey lab.");
  }
});

function proxyHeaders(req: express.Request): HeadersInit {
  const headers: Record<string, string> = {};
  for (const header of ["authorization", "content-type", "x-key-grant-token"]) {
    const value = req.header(header);
    if (value) headers[header] = value;
  }
  return headers;
}

function readRawBody(req: express.Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
