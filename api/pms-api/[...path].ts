import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

const pmsProxyBaseUrl = process.env.PMS_PROXY_BASE_URL || "http://localhost:8086/api";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const requestUrl = new URL(req.url || "/", "https://pms-mock.local");
    const pmsPath = requestUrl.pathname.replace(/^\/(?:api\/)?pms-api/, "") || "/";
    const targetUrl = new URL(`${pmsProxyBaseUrl}${pmsPath}${requestUrl.search}`);
    const body = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await readRawBody(req);
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: proxyHeaders(req.headers),
      body: body ? new Uint8Array(body) : undefined,
    });

    res.statusCode = response.status;
    if (hasHeader(req.headers, "x-key-grant-token")) {
      res.setHeader("X-PMS-Mock-Forwarded-Key-Grant-Token", "true");
    }
    response.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    sendJson(res, 502, { message: error instanceof Error ? error.message : "PMS proxy request failed" });
  }
}

function proxyHeaders(headers: IncomingHttpHeaders): HeadersInit {
  const proxiedHeaders: Record<string, string> = {};
  for (const header of ["authorization", "content-type", "x-key-grant-token"]) {
    const value = headers[header];
    if (Array.isArray(value)) {
      proxiedHeaders[header] = value.join(",");
    } else if (value) {
      proxiedHeaders[header] = value;
    }
  }
  return proxiedHeaders;
}

function hasHeader(headers: IncomingHttpHeaders, name: string): boolean {
  const value = headers[name];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
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
