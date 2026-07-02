import { describe, expect, it } from "vitest";
import { getCanonicalRedirectUrl, getDefaultCanonicalAppOrigin } from "./runtimeOrigin";

describe("getDefaultCanonicalAppOrigin", () => {
  it("uses the current non-local origin when VITE_APP_ORIGIN is empty", () => {
    expect(getDefaultCanonicalAppOrigin("https://pms-passkey-mock.vercel.app", "pms-passkey-mock.vercel.app")).toBe("https://pms-passkey-mock.vercel.app");
  });

  it("keeps the local development fallback for localhost", () => {
    expect(getDefaultCanonicalAppOrigin("http://localhost:3001", "localhost")).toBe("http://localhost:3000");
  });
});

describe("getCanonicalRedirectUrl", () => {
  it("redirects local Vite fallback ports to the canonical Better Auth origin", () => {
    expect(getCanonicalRedirectUrl("http://localhost:3001/payroll?tab=runs#x", "http://localhost:3000")).toBe("http://localhost:3000/payroll?tab=runs#x");
  });

  it("does not redirect the canonical origin", () => {
    expect(getCanonicalRedirectUrl("http://localhost:3000/", "http://localhost:3000")).toBeNull();
  });
});
