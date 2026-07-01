import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPmsAccessToken } from "./authClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPmsAccessToken", () => {
  it("explains when a Vite-only server returns HTML for the token route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } })),
    );

    await expect(fetchPmsAccessToken()).rejects.toThrow("returned HTML instead of JSON");
  });

  it("requires Better Auth to return a provider access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } })),
    );

    await expect(fetchPmsAccessToken()).rejects.toThrow("did not return a Keycloak access token");
  });
});
