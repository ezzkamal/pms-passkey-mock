import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHeaders, getDefaultPmsApiBaseUrl, pmsClient } from "./pmsClient";

const config = {
  baseUrl: "http://localhost:8086/api",
  authToken: "admin-token",
  keyGrantToken: "grant-token",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDefaultPmsApiBaseUrl", () => {
  it("uses the configured PMS API base URL when provided", () => {
    expect(getDefaultPmsApiBaseUrl("https://pms.example.test/api", "pms-passkey-mock.vercel.app")).toBe("https://pms.example.test/api");
  });

  it("uses the same-origin Vercel proxy on deployed hosts when the env var is empty", () => {
    expect(getDefaultPmsApiBaseUrl("", "pms-passkey-mock.vercel.app")).toBe("/api/pms-api");
  });

  it("keeps the local PMS default on localhost", () => {
    expect(getDefaultPmsApiBaseUrl("", "localhost")).toBe("http://localhost:8086/api");
  });
});

describe("pmsClient", () => {
  it("attaches Authorization and key grant headers when configured", () => {
    const headers = buildHeaders(config, true) as Record<string, string>;

    expect(headers.Authorization).toBe("Bearer admin-token");
    expect(headers["X-Key-Grant-Token"]).toBe("grant-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("requires auth before calling PMS", async () => {
    await expect(pmsClient.getPasskeyStatus({ ...config, authToken: "" })).rejects.toThrow("Better Auth Keycloak session is required");
  });

  it("requires key-grant token for salary endpoints", async () => {
    await expect(pmsClient.getSalary("emp-1", { ...config, keyGrantToken: "" })).rejects.toThrow("Passkey key-grant token is required");
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

  it("creates salary records with the key grant header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "rec-1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await pmsClient.createSalary({ employeeExternalId: "emp-1", netBaseSalary: 75000.5, effectiveFrom: "2026-07-01", source: "MANUAL" }, config);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8086/api/salaries",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Key-Grant-Token": "grant-token" }),
        body: JSON.stringify({ employeeExternalId: "emp-1", netBaseSalary: 75000.5, effectiveFrom: "2026-07-01", source: "MANUAL" }),
      }),
    );
  });

  it("loads salary history with the key grant header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await pmsClient.getSalaryHistory("emp-1", config);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8086/api/salaries/emp-1/history",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "X-Key-Grant-Token": "grant-token" }),
      }),
    );
  });

  it("lists and deletes key approvals through real PMS endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ credentialId: "credential-1" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await pmsClient.getApprovedKeyApprovals(config);
    await pmsClient.deleteKeyApproval("credential-1", config);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8086/api/key-approvals",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8086/api/key-approvals/credential-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
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
