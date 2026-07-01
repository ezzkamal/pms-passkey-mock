import { describe, expect, it } from "vitest";
import { base64urlToBuffer, bufferToBase64url, toCredentialCreationOptions, toCredentialRequestOptions } from "./webauthn";

describe("webauthn helpers", () => {
  it("round-trips base64url buffers", () => {
    const encoded = bufferToBase64url(new Uint8Array([1, 2, 3, 252]));
    expect(encoded).toBe("AQID_A");
    expect(Array.from(new Uint8Array(base64urlToBuffer(encoded)))).toEqual([1, 2, 3, 252]);
  });

  it("decodes creation and request public key options", () => {
    const creation = toCredentialCreationOptions({
      publicKey: {
        challenge: "AQID",
        rp: { id: "localhost", name: "IMS Payroll" },
        user: { id: "BAUG", name: "a@b.test", displayName: "a@b.test" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      },
    });
    const request = toCredentialRequestOptions({
      publicKey: {
        challenge: "AQID",
        allowCredentials: [{ type: "public-key", id: "BAUG" }],
      },
    });

    expect(creation.publicKey?.challenge).toBeInstanceOf(ArrayBuffer);
    expect(creation.publicKey?.user.id).toBeInstanceOf(ArrayBuffer);
    expect(request.publicKey?.allowCredentials?.[0].id).toBeInstanceOf(ArrayBuffer);
  });
});
