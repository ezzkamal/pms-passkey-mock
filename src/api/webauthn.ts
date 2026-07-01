type JsonObject = Record<string, unknown>;

export function base64urlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

export function bufferToBase64url(value: BufferSource): string {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function toCredentialCreationOptions(publicKeyJson: unknown): CredentialCreationOptions {
  const publicKey = clonePublicKey(publicKeyJson);
  publicKey.challenge = base64urlToBuffer(String(publicKey.challenge));

  if (publicKey.user?.id) {
    publicKey.user.id = base64urlToBuffer(String(publicKey.user.id));
  }

  for (const credential of publicKey.excludeCredentials ?? []) {
    credential.id = base64urlToBuffer(String(credential.id));
  }

  decodePrfInputs(publicKey);
  return { publicKey: publicKey as unknown as PublicKeyCredentialCreationOptions };
}

export function toCredentialRequestOptions(publicKeyJson: unknown): CredentialRequestOptions {
  const publicKey = clonePublicKey(publicKeyJson);
  publicKey.challenge = base64urlToBuffer(String(publicKey.challenge));

  for (const credential of publicKey.allowCredentials ?? []) {
    credential.id = base64urlToBuffer(String(credential.id));
  }

  decodePrfInputs(publicKey);
  return { publicKey: publicKey as unknown as PublicKeyCredentialRequestOptions };
}

export function serializeCredential(credential: PublicKeyCredential): string {
  const response = credential.response;
  const responseJson =
    response instanceof AuthenticatorAttestationResponse
      ? {
          attestationObject: bufferToBase64url(response.attestationObject),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
          transports: typeof response.getTransports === "function" ? response.getTransports() : undefined,
        }
      : response instanceof AuthenticatorAssertionResponse
        ? {
            authenticatorData: bufferToBase64url(response.authenticatorData),
            clientDataJSON: bufferToBase64url(response.clientDataJSON),
            signature: bufferToBase64url(response.signature),
            userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
          }
        : {};

  return JSON.stringify(
    serializeBuffers({
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      response: responseJson,
      clientExtensionResults: credential.getClientExtensionResults(),
    }),
  );
}

export async function createPasskeyCredential(publicKeyJson: unknown): Promise<string> {
  ensureWebAuthn();
  const credential = await runWebAuthn(() => navigator.credentials.create(toCredentialCreationOptions(publicKeyJson)));
  if (!credential || credential.type !== "public-key") {
    throw new Error("Passkey registration was cancelled or returned an unsupported credential.");
  }
  return serializeCredential(credential as PublicKeyCredential);
}

export async function getPasskeyCredential(publicKeyJson: unknown): Promise<string> {
  ensureWebAuthn();
  const credential = await runWebAuthn(() => navigator.credentials.get(toCredentialRequestOptions(publicKeyJson)));
  if (!credential || credential.type !== "public-key") {
    throw new Error("Passkey authentication was cancelled or returned an unsupported credential.");
  }
  return serializeCredential(credential as PublicKeyCredential);
}

async function runWebAuthn(action: () => Promise<Credential | null>): Promise<Credential | null> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new Error("Passkey prompt timed out, was cancelled, or that option is not available. Try another passkey option.");
    }
    throw error;
  }
}

function ensureWebAuthn() {
  if (!window.isSecureContext) {
    throw new Error("Passkeys require a secure context. Use localhost or HTTPS.");
  }
  if (!("credentials" in navigator) || typeof PublicKeyCredential === "undefined") {
    throw new Error("This browser does not expose WebAuthn passkey APIs.");
  }
}

function clonePublicKey(publicKeyJson: unknown): JsonObject & {
  challenge?: unknown;
  user?: { id?: unknown };
  excludeCredentials?: Array<{ id?: unknown }>;
  allowCredentials?: Array<{ id?: unknown }>;
} {
  const root = JSON.parse(JSON.stringify(publicKeyJson)) as JsonObject;
  return ((root.publicKey as JsonObject | undefined) ?? root) as JsonObject & {
    challenge?: unknown;
    user?: { id?: unknown };
    excludeCredentials?: Array<{ id?: unknown }>;
    allowCredentials?: Array<{ id?: unknown }>;
  };
}

function decodePrfInputs(publicKey: JsonObject) {
  const extensions = publicKey.extensions as JsonObject | undefined;
  const prf = extensions?.prf as JsonObject | undefined;
  if (!prf) return;

  decodePrfValue(prf.eval as JsonObject | undefined);

  const evalByCredential = prf.evalByCredential as Record<string, JsonObject> | undefined;
  if (evalByCredential) {
    Object.values(evalByCredential).forEach(decodePrfValue);
  }
}

function decodePrfValue(value: JsonObject | undefined) {
  if (!value) return;
  if (typeof value.first === "string") {
    value.first = base64urlToBuffer(value.first);
  }
  if (typeof value.second === "string") {
    value.second = base64urlToBuffer(value.second);
  }
}

function serializeBuffers(value: unknown): unknown {
  if (value instanceof ArrayBuffer) {
    return bufferToBase64url(value);
  }
  if (ArrayBuffer.isView(value)) {
    return bufferToBase64url(value as BufferSource);
  }
  if (Array.isArray(value)) {
    return value.map(serializeBuffers);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeBuffers(nested)]));
  }
  return value;
}
