export type Section = "passkeys" | "payroll-runs" | "salaries" | "approvals" | "audit";

export type PayrollRunStatus = "DRAFT" | "OPEN" | "LOCKED" | "APPROVED" | "IN_PROGRESS";

export type PayrollRun = {
  id: string;
  year: number;
  month: number;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  lockedAt: string | null;
  createdBy?: string | null;
  createdAt: string;
};

export type SalaryRecord = {
  id: string;
  employeeExternalId: string;
  netBaseSalary: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: "MANUAL" | "IMPORT" | "SYSTEM";
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
