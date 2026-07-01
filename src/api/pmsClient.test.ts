import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHeaders, pmsClient } from "./pmsClient";

const config = {
  baseUrl: "http://localhost:8086/api",
  authToken: "admin-token",
  keyGrantToken: "grant-token",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pmsClient", () => {
  it("attaches Authorization and key grant headers when configured", () => {
    const headers = buildHeaders(config, true) as Record<string, string>;

    expect(headers.Authorization).toBe("Bearer admin-token");
    expect(headers["X-Key-Grant-Token"]).toBe("grant-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("requires auth before calling PMS", async () => {
    await expect(pmsClient.listPayrollRuns({ ...config, authToken: "" })).rejects.toThrow("Better Auth Keycloak session is required");
  });

  it("requires key-grant token for salary endpoints", async () => {
    await expect(pmsClient.getSalary("emp-1", { ...config, keyGrantToken: "" })).rejects.toThrow("Passkey key-grant token is required");
  });

  it("calls real payroll run endpoint without fixture fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const runs = await pmsClient.listPayrollRuns(config);

    expect(runs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8086/api/payroll-runs",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
      }),
    );
  });

  it("supports point-in-time salary lookups via asOf", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "rec-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await pmsClient.getSalary("emp-1", config, "2026-06-01");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8086/api/salaries/emp-1?asOf=2026-06-01",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "X-Key-Grant-Token": "grant-token" }),
      }),
    );
  });

  it("requests a preferred passkey registration mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ceremonyId: "ceremony-1", publicKey: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await pmsClient.startPasskeyRegistration(config, "device");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8086/api/passkeys/registration/options",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mode: "device" }),
      }),
    );
  });
});
