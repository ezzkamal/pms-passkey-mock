import { describe, expect, it } from "vitest";
import { getCanonicalRedirectUrl } from "./runtimeOrigin";

describe("getCanonicalRedirectUrl", () => {
  it("redirects local Vite fallback ports to the canonical Better Auth origin", () => {
    expect(getCanonicalRedirectUrl("http://localhost:3001/payroll?tab=runs#x", "http://localhost:3000")).toBe("http://localhost:3000/payroll?tab=runs#x");
  });

  it("does not redirect the canonical origin", () => {
    expect(getCanonicalRedirectUrl("http://localhost:3000/", "http://localhost:3000")).toBeNull();
  });
});
