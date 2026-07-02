export type Section = "passkeys" | "approvals" | "salaries" | "audit";

export type SalaryRecordSource = "MANUAL" | "IMPORT" | "CORRECTION";

export type SalaryRecord = {
  id: string;
  employeeExternalId: string;
  netBaseSalary: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: SalaryRecordSource;
  createdBy?: string | null;
  createdAt: string;
};

export type PasskeyStatusResponse = {
  registered: boolean;
};

export type PasskeyOptionsResponse = {
  ceremonyId: string;
  publicKey: unknown;
};

export type PasskeyRegistrationMode = "phone" | "device";

export type KeyGrantResponse = {
  token: string;
  expiresAt: string;
};

export type KeyApprovalResponse = {
  credentialId: string;
  userExternalId: string;
  email: string;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string | null;
};

export type AuditRecord = {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  action: "CREATE" | "DECRYPT" | "CORRECT";
  status: "SUCCESS" | "DENIED";
  author: string;
  createdAt: string;
};

export type PagedResponse<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
};

export type ApprovalState = "unknown" | "pending" | "approved";
