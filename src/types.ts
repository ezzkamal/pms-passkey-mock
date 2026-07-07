export type Section = "passkeys" | "approvals" | "salaries" | "payrollRuns" | "addons" | "audit";

export type PayrollRunTab = "overview" | "grid" | "history";

export type AddOnsTab = "all" | "expenses" | "oncall" | "manual" | "catalog";

export type SalaryRecordSource = "MANUAL" | "IMPORT" | "CORRECTION";

export type PayrollRunStatus = "DRAFT" | "OPEN" | "LOCKED";

export type AddOnCatalogType = "EXPENSE" | "ON_CALL" | "BONUS" | "OTHER";

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

export type PayrollRun = {
  id: string;
  year: number;
  month: number;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  lockedAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type PayrollRunStatusTransition = {
  id: string;
  runId: string;
  fromStatus: PayrollRunStatus | null;
  toStatus: PayrollRunStatus;
  changedBy: string;
  changedAt: string;
};

export type PayElement = {
  id: string;
  payrollEntryId: string;
  type: string;
  amount: number;
  label: string;
  note: string | null;
  expenseRef: string | null;
  rotationsCount: number | null;
  rate: number | null;
  source: SalaryRecordSource;
  createdBy: string | null;
  createdAt: string;
};

export type PayrollEntry = {
  id: string;
  runId: string;
  employeeId: string;
  employee?: { externalId: string } | null;
  netBaseSnapshot: number | null;
  sourceSalaryRecordId: string | null;
  salaryEffectiveDateUsed: string | null;
  totalNet: number | null;
  snapshotAt: string;
  addOns: PayElement[];
  createdBy: string | null;
  createdAt: string;
};

export type AddOnCatalogEntry = {
  code: string;
  label: string;
  type: string;
  defaultAmount: number | null;
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

export type KeyApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";

export type KeyApprovalResponse = {
  credentialId: string;
  userExternalId: string;
  email: string;
  status: KeyApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  revokedAt: string | null;
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

export type EntryPagedResponse<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type ApprovalState = "unknown" | "pending" | "approved" | "rejected" | "revoked";
