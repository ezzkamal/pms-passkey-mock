import type {
  KeyApprovalResponse,
  KeyGrantResponse,
  PasskeyOptionsResponse,
  PasskeyRegistrationMode,
  PasskeyStatusResponse,
  PayrollRun,
  SalaryRecord,
} from "../types";

type HttpMethod = "GET" | "POST" | "PATCH";

export type PmsClientConfig = {
  baseUrl: string;
  authToken: string;
  keyGrantToken: string;
};

const STORAGE_KEY = "pms-mock-api-config";

export const defaultClientConfig: PmsClientConfig = {
  baseUrl: import.meta.env.VITE_PMS_API_BASE_URL || "http://localhost:8086/api",
  authToken: "",
  keyGrantToken: import.meta.env.VITE_PMS_KEY_GRANT_TOKEN || "",
};

export function loadClientConfig(): PmsClientConfig {
  if (typeof window === "undefined") {
    return defaultClientConfig;
  }

  if (!window.localStorage) {
    return defaultClientConfig;
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return defaultClientConfig;
  }

  try {
    const parsed = JSON.parse(saved) as Partial<PmsClientConfig>;
    return {
      ...defaultClientConfig,
      baseUrl: parsed.baseUrl || defaultClientConfig.baseUrl,
      keyGrantToken: parsed.keyGrantToken || defaultClientConfig.keyGrantToken,
      authToken: "",
    };
  } catch {
    return defaultClientConfig;
  }
}

export function saveClientConfig(config: PmsClientConfig) {
  if (!window.localStorage) return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      baseUrl: config.baseUrl,
      keyGrantToken: config.keyGrantToken,
    }),
  );
}

export function clearClientConfig() {
  if (!window.localStorage) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function buildHeaders(config: Pick<PmsClientConfig, "authToken" | "keyGrantToken">, includeKeyGrant = false): HeadersInit {
  requireAuth(config);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.authToken}`,
    "Content-Type": "application/json",
  };

  if (includeKeyGrant) {
    requireKeyGrant(config);
    headers["X-Key-Grant-Token"] = config.keyGrantToken;
  }

  return headers;
}

export function requireAuth(config: Pick<PmsClientConfig, "authToken">) {
  if (!config.authToken.trim()) {
    throw new Error("Better Auth Keycloak session is required before calling PMS.");
  }
}

export function requireKeyGrant(config: Pick<PmsClientConfig, "keyGrantToken">) {
  if (!config.keyGrantToken.trim()) {
    throw new Error("Passkey key-grant token is required for salary endpoints.");
  }
}

async function request<T>(path: string, method: HttpMethod = "GET", body?: unknown, includeKeyGrant = false, config: PmsClientConfig = loadClientConfig()): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: buildHeaders(config, includeKeyGrant),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`${method} ${path} failed with ${response.status}${message ? `: ${message}` : ""}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const pmsClient = {
  getPasskeyStatus(config?: PmsClientConfig) {
    return request<PasskeyStatusResponse>("/passkeys", "GET", undefined, false, config);
  },
  startPasskeyRegistration(config?: PmsClientConfig, mode?: PasskeyRegistrationMode) {
    return request<PasskeyOptionsResponse>("/passkeys/registration/options", "POST", mode ? { mode } : {}, false, config);
  },
  finishPasskeyRegistration(payload: { ceremonyId: string; credentialJson: string }, config?: PmsClientConfig) {
    return request<void>("/passkeys/registration/verify", "POST", payload, false, config);
  },
  startPasskeyAuthentication(config?: PmsClientConfig) {
    return request<PasskeyOptionsResponse>("/passkeys/authentication/options", "POST", {}, false, config);
  },
  finishPasskeyAuthentication(payload: { ceremonyId: string; credentialJson: string }, config?: PmsClientConfig) {
    return request<KeyGrantResponse>("/passkeys/authentication/verify", "POST", payload, false, config);
  },
  revokeKeyGrant(token: string, config?: PmsClientConfig) {
    return request<void>("/passkeys/authentication/revoke", "POST", { token }, false, config);
  },
  listPayrollRuns(config?: PmsClientConfig) {
    return request<PayrollRun[]>("/payroll-runs", "GET", undefined, false, config);
  },
  createPayrollRun(payload: { year: number; month: number; status: "DRAFT" | "OPEN" | "LOCKED" }, config?: PmsClientConfig) {
    return request<PayrollRun>("/payroll-runs", "POST", payload, false, config);
  },
  transitionPayrollRun(id: string, status: "DRAFT" | "OPEN" | "LOCKED", config?: PmsClientConfig) {
    return request<PayrollRun>(`/payroll-runs/${id}/status`, "PATCH", { status }, false, config);
  },
  updatePayrollRunPeriod(id: string, periodStart: string, periodEnd: string, config?: PmsClientConfig) {
    return request<PayrollRun>(`/payroll-runs/${id}/period`, "PATCH", { periodStart, periodEnd }, false, config);
  },
  getPayrollRunTransitions(id: string, config?: PmsClientConfig) {
    return request(`/payroll-runs/${id}/transitions`, "GET", undefined, false, config);
  },
  getSalary(employeeExternalId: string, config?: PmsClientConfig) {
    return request<SalaryRecord>(`/salaries/${employeeExternalId}`, "GET", undefined, true, config);
  },
  createSalary(payload: { employeeExternalId: string; netBaseSalary: number; effectiveFrom: string; source?: "MANUAL" | "IMPORT" | "SYSTEM" }, config?: PmsClientConfig) {
    return request<SalaryRecord>("/salaries", "POST", payload, true, config);
  },
  getSalaryHistory(employeeExternalId: string, config?: PmsClientConfig) {
    return request<SalaryRecord[]>(`/salaries/${employeeExternalId}/history`, "GET", undefined, true, config);
  },
  getPendingKeyApprovals(config?: PmsClientConfig) {
    return request<KeyApprovalResponse[]>("/key-approvals/pending", "GET", undefined, false, config);
  },
  approveKey(credentialId: string, config?: PmsClientConfig) {
    return request<KeyApprovalResponse>("/key-approvals", "POST", { credentialId }, false, config);
  },
  approveMockKeySelf(credentialId: string, config?: PmsClientConfig) {
    return request<KeyApprovalResponse>("/mock/key-approvals/self", "POST", { credentialId }, false, config);
  },
  getAuditRecords(entity: string, entityId: string, config?: PmsClientConfig) {
    return request(`/audit-records?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}`, "GET", undefined, false, config);
  },
};
