import type { AddOnCatalogEntry, AddOnsTab, PayElement, PayrollEntry, PayrollRun, PayrollRunStatus } from "./types";

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const PAYROLL_WORKFLOW_STEPS = [
  "Period Opened",
  "Auto-pulls Confirmed",
  "Add-ons Entry",
  "Validation Report",
  "Approver Sign-off",
  "Export & Lock",
] as const;

export const LAST_SELECTED_RUN_STORAGE_KEY = "pms-mock-selected-run-id";

export function formatRunLabel(run: PayrollRun): string {
  return `${MONTH_NAMES[run.month - 1]} ${run.year}`;
}

export function formatRunPeriod(run: PayrollRun): string {
  return `${run.year}-${String(run.month).padStart(2, "0")} (${run.periodStart} → ${run.periodEnd})`;
}

export function runStatusLabel(status: PayrollRunStatus): string {
  if (status === "LOCKED") return "Locked";
  if (status === "OPEN") return "In Progress";
  return "Draft";
}

export function statusTone(status: PayrollRunStatus): "ok" | "warn" | "bad" {
  if (status === "LOCKED") return "ok";
  if (status === "OPEN") return "warn";
  return "bad";
}

export type PayrollSummary = {
  entries: PayrollEntry[];
  entriesCount: number;
  addOnsCount: number;
  totalNet: number;
  baseTotal: number;
  expenseTotal: number;
  oncallTotal: number;
  bonusTotal: number;
};

export function summarizePayrollEntries(entries: PayrollEntry[], catalogByCode: Map<string, AddOnCatalogEntry>): PayrollSummary {
  let addOnsCount = 0;
  let totalNet = 0;
  let baseTotal = 0;
  let expenseTotal = 0;
  let oncallTotal = 0;
  let bonusTotal = 0;

  for (const entry of entries) {
    baseTotal += entry.netBaseSnapshot ?? 0;
    totalNet += entry.totalNet ?? entry.netBaseSnapshot ?? 0;
    for (const addOn of entry.addOns) {
      addOnsCount += 1;
      const catalogType = catalogByCode.get(addOn.type)?.type?.toUpperCase() ?? "";
      if (catalogType === "EXPENSE" || addOn.type === "expense") {
        expenseTotal += addOn.amount;
      } else if (catalogType === "ON_CALL" || addOn.type === "oncall") {
        oncallTotal += addOn.amount;
      } else {
        bonusTotal += addOn.amount;
      }
    }
  }

  return {
    entries,
    entriesCount: entries.length,
    addOnsCount,
    totalNet,
    baseTotal,
    expenseTotal,
    oncallTotal,
    bonusTotal,
  };
}

export function getPayrollWorkflowActiveStep(run: PayrollRun, summary: PayrollSummary): number {
  if (run.status === "LOCKED") return PAYROLL_WORKFLOW_STEPS.length;
  if (run.status === "DRAFT") return 0;
  if (summary.entriesCount === 0) return 1;
  if (summary.addOnsCount === 0) return 2;
  return 3;
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function loadLastSelectedRunId(): string {
  if (typeof window === "undefined" || !window.localStorage) return "";
  return window.localStorage.getItem(LAST_SELECTED_RUN_STORAGE_KEY) || "";
}

export function saveLastSelectedRunId(runId: string) {
  if (!window.localStorage) return;
  const trimmed = runId.trim();
  if (trimmed) {
    window.localStorage.setItem(LAST_SELECTED_RUN_STORAGE_KEY, trimmed);
  } else {
    window.localStorage.removeItem(LAST_SELECTED_RUN_STORAGE_KEY);
  }
}

export function addOnsForType(addOns: Array<PayElement & { employeeId: string }>, catalogByCode: Map<string, AddOnCatalogEntry>, tab: AddOnsTab) {
  if (tab === "all" || tab === "catalog") return addOns;
  return addOns.filter((addOn) => {
    const catalogType = catalogByCode.get(addOn.type)?.type?.toUpperCase() ?? "";
    if (tab === "expenses") return catalogType === "EXPENSE" || addOn.type === "expense";
    if (tab === "oncall") return catalogType === "ON_CALL" || addOn.type === "oncall";
    return catalogType === "BONUS" || catalogType === "OTHER" || addOn.type === "bonus" || addOn.type === "other";
  });
}

export function flattenAddOns(entries: PayrollEntry[]): Array<PayElement & { employeeId: string }> {
  return entries.flatMap((entry) => entry.addOns.map((addOn) => ({ ...addOn, employeeId: entry.employeeId })));
}

export function gridAddOnTotal(entry: PayrollEntry, catalogByCode: Map<string, AddOnCatalogEntry>, kind: "expense" | "oncall" | "bonus"): number {
  return entry.addOns
    .filter((addOn) => {
      const catalogType = catalogByCode.get(addOn.type)?.type?.toUpperCase() ?? "";
      if (kind === "expense") return catalogType === "EXPENSE" || addOn.type === "expense";
      if (kind === "oncall") return catalogType === "ON_CALL" || addOn.type === "oncall";
      return catalogType === "BONUS" || catalogType === "OTHER" || addOn.type === "bonus" || addOn.type === "other";
    })
    .reduce((sum, addOn) => sum + addOn.amount, 0);
}
