import type {
  AddOnCatalogEntry,
  AddOnCatalogType,
  AuditRecord,
  EntryPagedResponse,
  KeyApprovalResponse,
  KeyApprovalStatus,
  KeyGrantResponse,
  PagedResponse,
  PasskeyOptionsResponse,
  PasskeyRegistrationMode,
  PasskeyStatusResponse,
  PayElement,
  PayrollEntry,
  PayrollRun,
  PayrollRunStatus,
  PayrollRunStatusTransition,
  SalaryRecord,
  SalaryRecordSource,
} from "../types";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export type PmsClientConfig = {
  baseUrl: string;
  authToken: string;
  keyGrantToken: string;
  keyGrantExpiresAt?: string;
};

const STORAGE_KEY = "pms-mock-api-config";

export function getDefaultPmsApiBaseUrl(configuredBaseUrl = import.meta.env.VITE_PMS_API_BASE_URL || "", currentHostname = typeof window === "undefined" ? "" : window.location.hostname) {
  const trimmedBaseUrl = configuredBaseUrl.trim();
  if (trimmedBaseUrl) {
    return trimmedBaseUrl;
  }

  if (currentHostname && !LOCAL_HOSTS.has(currentHostname)) {
    return "/api/pms-api";
  }

  return "http://localhost:8086/api";
}

export const defaultClientConfig: PmsClientConfig = {
  baseUrl: getDefaultPmsApiBaseUrl(),
  authToken: "",
  keyGrantToken: import.meta.env.VITE_PMS_KEY_GRANT_TOKEN || "",
  keyGrantExpiresAt: "",
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
    // Key grants live ~10 minutes server-side; drop stale tokens instead of pretending they still work.
    const grantExpired = parsed.keyGrantExpiresAt ? Date.parse(parsed.keyGrantExpiresAt) <= Date.now() : false;
    return {
      ...defaultClientConfig,
      keyGrantToken: grantExpired ? "" : parsed.keyGrantToken || defaultClientConfig.keyGrantToken,
      keyGrantExpiresAt: grantExpired ? "" : parsed.keyGrantExpiresAt || "",
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
      keyGrantToken: config.keyGrantToken,
      keyGrantExpiresAt: config.keyGrantExpiresAt || "",
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
    throw new Error("Passkey key-grant token is required for sensitive payroll endpoints.");
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
  getSalary(employeeExternalId: string, config?: PmsClientConfig, asOf?: string) {
    const query = asOf ? `?asOf=${encodeURIComponent(asOf)}` : "";
    return request<SalaryRecord>(`/salaries/${employeeExternalId}${query}`, "GET", undefined, true, config);
  },
  createSalary(payload: { employeeExternalId: string; netBaseSalary: number; effectiveFrom: string; source?: SalaryRecordSource }, config?: PmsClientConfig) {
    return request<SalaryRecord>("/salaries", "POST", payload, true, config);
  },
  getSalaryHistory(employeeExternalId: string, config?: PmsClientConfig) {
    return request<SalaryRecord[]>(`/salaries/${employeeExternalId}/history`, "GET", undefined, true, config);
  },
  listKeyApprovals(status: KeyApprovalStatus, config?: PmsClientConfig) {
    return request<KeyApprovalResponse[]>(`/key-approvals?status=${status}`, "GET", undefined, false, config);
  },
  getPendingKeyApprovals(config?: PmsClientConfig) {
    return pmsClient.listKeyApprovals("PENDING", config);
  },
  getApprovedKeyApprovals(config?: PmsClientConfig) {
    return pmsClient.listKeyApprovals("APPROVED", config);
  },
  approveKey(credentialId: string, config?: PmsClientConfig) {
    return request<KeyApprovalResponse>(`/key-approvals/${encodeURIComponent(credentialId)}/approve`, "POST", undefined, false, config);
  },
  rejectKey(credentialId: string, config?: PmsClientConfig) {
    return request<KeyApprovalResponse>(`/key-approvals/${encodeURIComponent(credentialId)}/reject`, "POST", undefined, false, config);
  },
  deleteKeyApproval(credentialId: string, config?: PmsClientConfig) {
    return request<void>(`/key-approvals/${encodeURIComponent(credentialId)}`, "DELETE", undefined, false, config);
  },
  getAuditRecords(entity: string, entityId: string, config?: PmsClientConfig, page = 0) {
    return request<PagedResponse<AuditRecord>>(`/audit-records?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}&page=${page}`, "GET", undefined, false, config);
  },
  listPayrollRuns(config?: PmsClientConfig) {
    return request<PayrollRun[]>("/payroll-runs", "GET", undefined, false, config);
  },
  getPayrollRun(runId: string, config?: PmsClientConfig) {
    return request<PayrollRun>(`/payroll-runs/${encodeURIComponent(runId)}`, "GET", undefined, false, config);
  },
  createPayrollRun(payload: { year: number; month: number; status?: PayrollRunStatus }, config?: PmsClientConfig) {
    return request<PayrollRun>("/payroll-runs", "POST", payload, false, config);
  },
  transitionPayrollRunStatus(runId: string, status: PayrollRunStatus, config?: PmsClientConfig) {
    return request<PayrollRun>(`/payroll-runs/${encodeURIComponent(runId)}/status`, "PATCH", { status }, false, config);
  },
  updatePayrollRunPeriod(runId: string, payload: { periodStart: string; periodEnd: string }, config?: PmsClientConfig) {
    return request<PayrollRun>(`/payroll-runs/${encodeURIComponent(runId)}/period`, "PATCH", payload, false, config);
  },
  getPayrollRunTransitions(runId: string, config?: PmsClientConfig) {
    return request<PayrollRunStatusTransition[]>(`/payroll-runs/${encodeURIComponent(runId)}/transitions`, "GET", undefined, false, config);
  },
  listPayrollEntries(runId: string, config?: PmsClientConfig, page = 0, size = 20) {
    return request<EntryPagedResponse<PayrollEntry>>(`/payroll-runs/${encodeURIComponent(runId)}/entries?page=${page}&size=${size}`, "GET", undefined, true, config);
  },
  getPayrollEntry(runId: string, employeeId: string, config?: PmsClientConfig) {
    return request<PayrollEntry>(`/payroll-runs/${encodeURIComponent(runId)}/entries/${encodeURIComponent(employeeId)}`, "GET", undefined, true, config);
  },
  bulkCreatePayrollEntries(payload: { runId: string; employeesIds?: string[] }, config?: PmsClientConfig) {
    return request<void>("/payroll-runs/entries/bulk", "POST", { runId: payload.runId, employeesIds: payload.employeesIds || [] }, true, config);
  },
  listAddOnCatalog(config?: PmsClientConfig) {
    return request<AddOnCatalogEntry[]>("/add-on-catalog", "GET", undefined, false, config);
  },
  getAddOnCatalogEntry(code: string, config?: PmsClientConfig) {
    return request<AddOnCatalogEntry>(`/add-on-catalog/${encodeURIComponent(code)}`, "GET", undefined, false, config);
  },
  createAddOnCatalogEntry(payload: { code: string; label: string; type: AddOnCatalogType | string; defaultAmount?: number | null }, config?: PmsClientConfig) {
    return request<AddOnCatalogEntry>("/add-on-catalog", "POST", payload, false, config);
  },
  updateAddOnCatalogEntry(code: string, payload: { label: string; type: AddOnCatalogType | string; defaultAmount?: number | null }, config?: PmsClientConfig) {
    return request<AddOnCatalogEntry>(`/add-on-catalog/${encodeURIComponent(code)}`, "PUT", payload, false, config);
  },
  deleteAddOnCatalogEntry(code: string, config?: PmsClientConfig) {
    return request<void>(`/add-on-catalog/${encodeURIComponent(code)}`, "DELETE", undefined, false, config);
  },
  listPayElements(runId: string, employeeId: string, config?: PmsClientConfig) {
    return request<PayElement[]>(`/payroll-runs/${encodeURIComponent(runId)}/entries/${encodeURIComponent(employeeId)}/add-ons`, "GET", undefined, true, config);
  },
  createPayElement(
    runId: string,
    employeeId: string,
    payload: {
      type: string;
      amount?: number;
      label: string;
      note?: string;
      expenseRef?: string;
      rotationsCount?: number;
      rate?: number;
    },
    config?: PmsClientConfig,
  ) {
    return request<PayElement>(`/payroll-runs/${encodeURIComponent(runId)}/entries/${encodeURIComponent(employeeId)}/add-ons`, "POST", payload, true, config);
  },
  updatePayElement(
    elementId: string,
    payload: {
      amount?: number;
      label?: string;
      note?: string;
      expenseRef?: string;
      rotationsCount?: number;
      rate?: number;
    },
    config?: PmsClientConfig,
  ) {
    return request<PayElement>(`/pay-elements/${encodeURIComponent(elementId)}`, "PUT", payload, true, config);
  },
  deletePayElement(elementId: string, config?: PmsClientConfig) {
    return request<void>(`/pay-elements/${encodeURIComponent(elementId)}`, "DELETE", undefined, true, config);
  },
};
