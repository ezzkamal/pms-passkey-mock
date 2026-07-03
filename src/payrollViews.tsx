import { CalendarRange, ChevronLeft, ChevronRight, History, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { pmsClient, type PmsClientConfig } from "./api/pmsClient";
import {
  PAYROLL_WORKFLOW_STEPS,
  addOnsForType,
  flattenAddOns,
  formatMoney,
  formatRunLabel,
  formatRunPeriod,
  getPayrollWorkflowActiveStep,
  gridAddOnTotal,
  loadLastSelectedRunId,
  runStatusLabel,
  saveLastSelectedRunId,
  sortPayrollRunsOldToNew,
  statusTone,
  summarizePayrollEntries,
} from "./payrollUtils";
import type { AddOnCatalogEntry, AddOnCatalogType, AddOnsTab, PayrollEntry, PayrollRun, PayrollRunStatus, PayrollRunStatusTransition, PayrollRunTab } from "./types";

type AuditTarget = { entity: string; entityId: string };

function EmptyTable({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td className="empty-table" colSpan={colSpan}>
        {label}
      </td>
    </tr>
  );
}

function PayrollWorkflowBar({ activeStep }: { activeStep: number }) {
  return (
    <div className="payroll-workflow" aria-label="Payroll period workflow">
      {PAYROLL_WORKFLOW_STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const done = activeStep >= stepNumber;
        const active = activeStep === index || (activeStep === 0 && index === 0);
        const state = done ? "done" : active ? "active" : "";
        return (
          <div className="payroll-workflow-group" key={label}>
            {index > 0 && <div className={`payroll-workflow-line ${activeStep >= stepNumber ? "done" : ""}`.trim()} />}
            <div className="payroll-workflow-step">
              <div className={`payroll-workflow-dot ${state}`.trim()}>{done ? "✓" : stepNumber}</div>
              <div className={`payroll-workflow-label ${state}`.trim()}>{label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const LAST_SALARY_EMPLOYEE_STORAGE_KEY = "pms-mock-salary-employee-external-id";

function loadLastSalaryEmployeeExternalId(): string {
  if (typeof window === "undefined" || !window.localStorage) return "";
  return window.localStorage.getItem(LAST_SALARY_EMPLOYEE_STORAGE_KEY) || "";
}

async function loadAllEntries(runId: string, config: PmsClientConfig): Promise<PayrollEntry[]> {
  const all: PayrollEntry[] = [];
  let page = 0;
  let hasNext = true;
  while (hasNext) {
    const response = await pmsClient.listPayrollEntries(runId, config, page, 50);
    all.push(...response.content);
    hasNext = response.hasNext;
    page += 1;
  }
  return all;
}

export function PayrollRunsView({
  config,
  grantActive,
  onToast,
  onGoToAddons,
  onGoToPasskeys,
}: {
  config: PmsClientConfig;
  grantActive: boolean;
  onToast: (message: string) => void;
  onGoToAddons: () => void;
  onGoToPasskeys: () => void;
}) {
  const now = new Date();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState(loadLastSelectedRunId);
  const [tab, setTab] = useState<PayrollRunTab>("overview");
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [catalog, setCatalog] = useState<AddOnCatalogEntry[]>([]);
  const [transitions, setTransitions] = useState<PayrollRunStatusTransition[]>([]);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [createStatus, setCreateStatus] = useState<PayrollRunStatus>("DRAFT");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [bulkEmployeeIds, setBulkEmployeeIds] = useState(loadLastSalaryEmployeeExternalId);
  const [loaded, setLoaded] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const selectedRun = runs.find((run) => run.id === selectedRunId) || null;
  const selectedIndex = selectedRun ? runs.findIndex((run) => run.id === selectedRun.id) : -1;
  const catalogByCode = useMemo(() => new Map(catalog.map((item) => [item.code, item])), [catalog]);
  const summary = useMemo(() => summarizePayrollEntries(entries, catalogByCode), [entries, catalogByCode]);
  const workflowStep = selectedRun ? getPayrollWorkflowActiveStep(selectedRun, summary) : 0;

  async function loadRuns() {
    setError("");
    try {
      const nextRuns = sortPayrollRunsOldToNew(await pmsClient.listPayrollRuns(config));
      setRuns(nextRuns);
      setLoaded(true);
      if (!selectedRunId && nextRuns.length > 0) {
        const newestRunId = nextRuns[nextRuns.length - 1].id;
        setSelectedRunId(newestRunId);
        saveLastSelectedRunId(newestRunId);
      } else if (selectedRunId && !nextRuns.some((run) => run.id === selectedRunId)) {
        const fallback = nextRuns[nextRuns.length - 1]?.id || "";
        setSelectedRunId(fallback);
        saveLastSelectedRunId(fallback);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load payroll runs.");
    }
  }

  async function loadRunData(runId: string) {
    try {
      setTransitions(await pmsClient.getPayrollRunTransitions(runId, config));
    } catch {
      setTransitions([]);
    }

    if (!grantActive) {
      setEntries([]);
      return;
    }

    setEntriesLoading(true);
    try {
      setEntries(await loadAllEntries(runId, config));
    } catch (caught) {
      setEntries([]);
      setError(caught instanceof Error ? caught.message : "Could not load payroll entries.");
    } finally {
      setEntriesLoading(false);
    }
  }

  useEffect(() => {
    void loadRuns();
    void pmsClient.listAddOnCatalog(config).then(setCatalog).catch(() => setCatalog([]));
  }, [config.authToken, config.baseUrl]);

  useEffect(() => {
    if (!selectedRun) return;
    setPeriodStart(selectedRun.periodStart);
    setPeriodEnd(selectedRun.periodEnd);
    void loadRunData(selectedRun.id);
  }, [selectedRun?.id, grantActive, config.keyGrantToken]);

  function selectRun(runId: string) {
    setSelectedRunId(runId);
    saveLastSelectedRunId(runId);
  }

  function shiftRun(delta: number) {
    if (selectedIndex < 0 || runs.length === 0) return;
    const nextIndex = Math.min(runs.length - 1, Math.max(0, selectedIndex + delta));
    selectRun(runs[nextIndex].id);
  }

  async function createRun() {
    const parsedYear = Number(year);
    const parsedMonth = Number(month);
    if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      setError("Year and month must be valid.");
      return;
    }

    setBusy("create");
    setError("");
    try {
      const created = await pmsClient.createPayrollRun({ year: parsedYear, month: parsedMonth, status: createStatus }, config);
      onToast(`Payroll run created for ${formatRunLabel(created)}.`);
      selectRun(created.id);
      await loadRuns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create payroll run.");
    } finally {
      setBusy("");
    }
  }

  async function transitionRun(status: PayrollRunStatus) {
    if (!selectedRun) return;
    setBusy(`transition-${status}`);
    setError("");
    try {
      await pmsClient.transitionPayrollRunStatus(selectedRun.id, status, config);
      onToast(status === "LOCKED" ? "Period locked. Export step complete for this run." : `Run transitioned to ${status}.`);
      await loadRuns();
      if (selectedRun) await loadRunData(selectedRun.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not transition run status.");
    } finally {
      setBusy("");
    }
  }

  async function bulkCreateEntries() {
    if (!selectedRun) return;
    if (!grantActive) {
      setError("Key grant is required to bulk-create payroll entries.");
      return;
    }

    const employeesIds = bulkEmployeeIds
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    setBusy("bulk");
    setError("");
    try {
      await pmsClient.bulkCreatePayrollEntries({ runId: selectedRun.id, employeesIds }, config);
      onToast(employeesIds.length ? `Salary snapshots refreshed for ${employeesIds.length} employee(s).` : "Salary snapshots refreshed for all active employees.");
      await loadRunData(selectedRun.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not bulk-create entries.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="payroll-page">
      <div className="tab-bar">
        <button className={tab === "overview" ? "tab active" : "tab"} type="button" onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={tab === "grid" ? "tab active" : "tab"} type="button" onClick={() => setTab("grid")}>
          Salary Grid
        </button>
        <button className={tab === "history" ? "tab active" : "tab"} type="button" onClick={() => setTab("history")}>
          Period History
        </button>
      </div>

      {tab === "history" ? (
        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Period history</h2>
              <p>All payroll runs, newest first. Locked periods are immutable.</p>
            </div>
            <button className="btn secondary" type="button" onClick={() => void loadRuns()} disabled={Boolean(busy)}>
              <RefreshCw size={16} />
              Reload
            </button>
          </div>
          {error && <div className="alert error">{error}</div>}
          <div className="inline-form">
            <label>
              Year
              <input value={year} onChange={(event) => setYear(event.target.value)} type="number" min="1900" />
            </label>
            <label>
              Month
              <input value={month} onChange={(event) => setMonth(event.target.value)} type="number" min="1" max="12" />
            </label>
            <label>
              Initial status
              <select value={createStatus} onChange={(event) => setCreateStatus(event.target.value as PayrollRunStatus)}>
                <option value="DRAFT">DRAFT</option>
                <option value="LOCKED">LOCKED (historical)</option>
              </select>
            </label>
            <button className="btn primary inline-action" type="button" onClick={() => void createRun()} disabled={Boolean(busy)}>
              <Plus size={16} />
              Create run
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th className="num">Employees</th>
                  <th>Locked on</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className={run.id === selectedRunId ? "selected-row" : ""}>
                    <td>
                      <strong>{formatRunLabel(run)}</strong>
                    </td>
                    <td>
                      <span className={`flag ${statusTone(run.status) === "ok" ? "blue" : statusTone(run.status) === "warn" ? "amber" : "red"}`}>{runStatusLabel(run.status)}</span>
                    </td>
                    <td className="num">{run.id === selectedRunId ? summary.entriesCount : "—"}</td>
                    <td>{run.lockedAt || "—"}</td>
                    <td>
                      <button className="btn secondary compact" type="button" onClick={() => { selectRun(run.id); setTab("overview"); }}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && <EmptyTable colSpan={5} label={loaded ? "No payroll runs yet." : "Loading runs..."} />}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel">
          {!selectedRun ? (
            <div className="alert info">Create a payroll run from Period History, then return here to work the monthly cycle.</div>
          ) : (
            <>
              <div className="period-nav">
                <button className="period-btn" type="button" onClick={() => shiftRun(-1)} disabled={selectedIndex <= 0} aria-label="Previous period">
                  <ChevronLeft size={16} />
                </button>
                <div className="period-label">
                  <CalendarRange size={14} />
                  {formatRunLabel(selectedRun)}
                </div>
                <button className="period-btn" type="button" onClick={() => shiftRun(1)} disabled={selectedIndex >= runs.length - 1} aria-label="Next period">
                  <ChevronRight size={16} />
                </button>
                <span className={`stat-badge ${statusTone(selectedRun.status) === "ok" ? "badge-blue" : statusTone(selectedRun.status) === "warn" ? "badge-amber" : "badge-red"}`}>● {runStatusLabel(selectedRun.status)}</span>
                <div className="period-actions">
                  {selectedRun.status === "DRAFT" && (
                    <button className="btn primary compact" type="button" onClick={() => void transitionRun("OPEN")} disabled={Boolean(busy)}>
                      Open period
                    </button>
                  )}
                  {selectedRun.status === "OPEN" && (
                    <button className="btn primary compact" type="button" onClick={() => void transitionRun("LOCKED")} disabled={Boolean(busy)}>
                      Lock period
                    </button>
                  )}
                </div>
              </div>

              <PayrollWorkflowBar activeStep={workflowStep} />

              {!grantActive && (
                <div className="alert warn">
                  Salary amounts are encrypted. Authenticate with your passkey before confirming auto-pulls or reviewing the salary grid.
                  <button className="link-button" type="button" onClick={onGoToPasskeys}>
                    Open passkeys
                  </button>
                </div>
              )}

              {selectedRun.status === "OPEN" && summary.entriesCount > 0 && summary.addOnsCount === 0 && (
                <div className="alert warn">
                  Auto-pulls are confirmed. Continue with manual add-ons before locking the period.
                  <button className="link-button" type="button" onClick={onGoToAddons}>
                    Review in Add-ons →
                  </button>
                </div>
              )}

              {workflowStep >= 3 && selectedRun.status === "OPEN" && (
                <div className="alert info">
                  Validation and approver sign-off are part of the IMS payroll UX but are not implemented in the PMS API yet. Lock the run when add-ons are complete.
                </div>
              )}

              {error && <div className="alert error">{error}</div>}

              {tab === "overview" && (
                <>
                  <div className="stats-row">
                    <div className="stat-card">
                      <div className="stat-label">Total Net to Pay</div>
                      <div className="stat-value">{grantActive ? formatMoney(summary.totalNet) : "—"}</div>
                      <div className="stat-sub">{formatRunLabel(selectedRun)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Active Employees</div>
                      <div className="stat-value">{summary.entriesCount}</div>
                      <div className="stat-sub">{summary.entriesCount ? "Entries loaded from PMS" : "Run bulk auto-pull to populate"}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Add-ons Total</div>
                      <div className="stat-value">{grantActive ? formatMoney(summary.expenseTotal + summary.oncallTotal + summary.bonusTotal) : "—"}</div>
                      <div className="stat-sub">
                        Expenses {formatMoney(summary.expenseTotal)} · On-call {formatMoney(summary.oncallTotal)} · Bonuses {formatMoney(summary.bonusTotal)}
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Workflow Step</div>
                      <div className="stat-value">{Math.min(workflowStep + 1, PAYROLL_WORKFLOW_STEPS.length)}/{PAYROLL_WORKFLOW_STEPS.length}</div>
                      <div className="stat-sub">{PAYROLL_WORKFLOW_STEPS[Math.min(workflowStep, PAYROLL_WORKFLOW_STEPS.length - 1)]}</div>
                    </div>
                  </div>

                  <div className="inline-form">
                    <label className="wide">
                      Employee external IDs (comma-separated — leave empty to pull all active EMS employees)
                      <input value={bulkEmployeeIds} onChange={(event) => setBulkEmployeeIds(event.target.value)} placeholder="emp-001, emp-002" />
                    </label>
                    <button className="btn primary inline-action" type="button" onClick={() => void bulkCreateEntries()} disabled={Boolean(busy) || !grantActive || selectedRun.status === "LOCKED"}>
                      Confirm auto-pulls
                    </button>
                  </div>

                  <div className="section-head">
                    <div>
                      <div className="section-title">Period summary</div>
                      <div className="section-sub">Breakdown by add-on category</div>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Employees</th>
                          <th className="num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Net base salaries</td>
                          <td>{summary.entriesCount}</td>
                          <td className="num">{grantActive ? formatMoney(summary.baseTotal) : "—"}</td>
                        </tr>
                        <tr>
                          <td>Expense reimbursements</td>
                          <td>{summary.entries.filter((entry) => gridAddOnTotal(entry, catalogByCode, "expense") > 0).length}</td>
                          <td className="num">{grantActive ? formatMoney(summary.expenseTotal) : "—"}</td>
                        </tr>
                        <tr>
                          <td>On-call allowances</td>
                          <td>{summary.entries.filter((entry) => gridAddOnTotal(entry, catalogByCode, "oncall") > 0).length}</td>
                          <td className="num">{grantActive ? formatMoney(summary.oncallTotal) : "—"}</td>
                        </tr>
                        <tr>
                          <td>Bonuses &amp; adjustments</td>
                          <td>{summary.entries.filter((entry) => gridAddOnTotal(entry, catalogByCode, "bonus") > 0).length}</td>
                          <td className="num">{grantActive ? formatMoney(summary.bonusTotal) : "—"}</td>
                        </tr>
                        <tr className="summary-total-row">
                          <td>Grand total</td>
                          <td>{summary.entriesCount}</td>
                          <td className="num">{grantActive ? formatMoney(summary.totalNet) : "—"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="table-wrap" style={{ marginTop: 16 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>From</th>
                          <th>To</th>
                          <th>Changed by</th>
                          <th>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transitions.map((transition) => (
                          <tr key={transition.id}>
                            <td>{transition.fromStatus || "—"}</td>
                            <td>{transition.toStatus}</td>
                            <td>{transition.changedBy}</td>
                            <td>{transition.changedAt}</td>
                          </tr>
                        ))}
                        {transitions.length === 0 && <EmptyTable colSpan={4} label="No status transitions recorded." />}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {tab === "grid" && (
                <>
                  <div className="section-head">
                    <div>
                      <div className="section-title">{formatRunLabel(selectedRun)} — salary grid</div>
                      <div className="section-sub">Net base snapshots and add-ons per employee for this run</div>
                    </div>
                    <button className="btn secondary compact" type="button" onClick={onGoToAddons}>
                      + Add manual add-on
                    </button>
                  </div>
                  {entriesLoading && <div className="alert info">Loading salary grid...</div>}
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th className="num">Net base</th>
                          <th className="num">Expenses</th>
                          <th className="num">On-call</th>
                          <th className="num">Bonus / other</th>
                          <th className="num">Total net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.entries.map((entry) => {
                          const expense = gridAddOnTotal(entry, catalogByCode, "expense");
                          const oncall = gridAddOnTotal(entry, catalogByCode, "oncall");
                          const bonus = gridAddOnTotal(entry, catalogByCode, "bonus");
                          return (
                            <tr key={entry.id}>
                              <td>{entry.employeeId}</td>
                              <td className="num">{grantActive ? formatMoney(entry.netBaseSnapshot ?? 0) : "—"}</td>
                              <td className="num">{grantActive && expense ? formatMoney(expense) : "—"}</td>
                              <td className="num">{grantActive && oncall ? formatMoney(oncall) : "—"}</td>
                              <td className="num">{grantActive && bonus ? formatMoney(bonus) : "—"}</td>
                              <td className="num">{grantActive ? formatMoney(entry.totalNet ?? 0) : "—"}</td>
                            </tr>
                          );
                        })}
                        {summary.entries.length === 0 && <EmptyTable colSpan={6} label={grantActive ? "No entries yet — confirm auto-pulls on Overview." : "Key grant required to decrypt the salary grid."} />}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AddOnsView({
  config,
  grantActive,
  remainingMs,
  onToast,
  onInspectAudit,
  onGoToPasskeys,
}: {
  config: PmsClientConfig;
  grantActive: boolean;
  remainingMs: number | null;
  onToast: (message: string) => void;
  onInspectAudit: (target: AuditTarget) => void;
  onGoToPasskeys: () => void;
}) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [runId, setRunId] = useState(loadLastSelectedRunId);
  const [tab, setTab] = useState<AddOnsTab>("all");
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [catalog, setCatalog] = useState<AddOnCatalogEntry[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [addOnType, setAddOnType] = useState("");
  const [addOnLabel, setAddOnLabel] = useState("");
  const [addOnAmount, setAddOnAmount] = useState("");
  const [addOnNote, setAddOnNote] = useState("");
  const [addOnExpenseRef, setAddOnExpenseRef] = useState("");
  const [addOnRotations, setAddOnRotations] = useState("");
  const [addOnRate, setAddOnRate] = useState("");
  const [catalogCode, setCatalogCode] = useState("");
  const [catalogLabel, setCatalogLabel] = useState("");
  const [catalogType, setCatalogType] = useState<AddOnCatalogType>("OTHER");
  const [catalogDefaultAmount, setCatalogDefaultAmount] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const selectedRun = runs.find((run) => run.id === runId) || null;
  const runLocked = selectedRun?.status === "LOCKED";
  const catalogByCode = useMemo(() => new Map(catalog.map((item) => [item.code, item])), [catalog]);
  const flatAddOns = useMemo(() => flattenAddOns(entries), [entries]);
  const visibleAddOns = useMemo(() => addOnsForType(flatAddOns, catalogByCode, tab), [flatAddOns, catalogByCode, tab]);

  async function loadRuns() {
    try {
      const nextRuns = sortPayrollRunsOldToNew(await pmsClient.listPayrollRuns(config));
      setRuns(nextRuns);
      if (!runId && nextRuns.length > 0) {
        setRunId(nextRuns[nextRuns.length - 1].id);
        saveLastSelectedRunId(nextRuns[nextRuns.length - 1].id);
      }
    } catch {
      setRuns([]);
    }
  }

  async function loadCatalog() {
    try {
      const items = await pmsClient.listAddOnCatalog(config);
      setCatalog(items);
      if (!addOnType && items.length > 0) setAddOnType(items[0].code);
    } catch {
      setCatalog([]);
    }
  }

  async function loadEntries() {
    if (!runId || !grantActive) {
      setEntries([]);
      return;
    }
    setError("");
    try {
      setEntries(await loadAllEntries(runId, config));
    } catch (caught) {
      setEntries([]);
      setError(caught instanceof Error ? caught.message : "Could not load payroll entries.");
    }
  }

  useEffect(() => {
    void loadRuns();
    void loadCatalog();
  }, [config.authToken, config.baseUrl]);

  useEffect(() => {
    saveLastSelectedRunId(runId);
    void loadEntries();
  }, [runId, grantActive, config.keyGrantToken]);

  async function addPayElement() {
    const trimmedEmployeeId = employeeId.trim();
    const trimmedLabel = addOnLabel.trim();
    if (!runId || !trimmedEmployeeId || !addOnType || !trimmedLabel) {
      setError("Run, employee, type, and label are required.");
      return;
    }

    setBusy("add");
    setError("");
    try {
      await pmsClient.createPayElement(
        runId,
        trimmedEmployeeId,
        {
          type: addOnType,
          label: trimmedLabel,
          amount: addOnAmount.trim() ? Number(addOnAmount) : undefined,
          note: addOnNote.trim() || undefined,
          expenseRef: addOnExpenseRef.trim() || undefined,
          rotationsCount: addOnRotations.trim() ? Number(addOnRotations) : undefined,
          rate: addOnRate.trim() ? Number(addOnRate) : undefined,
        },
        config,
      );
      onToast("Manual add-on saved.");
      setAddOnLabel("");
      setAddOnAmount("");
      setAddOnNote("");
      setAddOnExpenseRef("");
      setAddOnRotations("");
      setAddOnRate("");
      await loadEntries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add pay element.");
    } finally {
      setBusy("");
    }
  }

  async function removePayElement(elementId: string) {
    setBusy(elementId);
    setError("");
    try {
      await pmsClient.deletePayElement(elementId, config);
      onToast("Add-on deleted.");
      await loadEntries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete pay element.");
    } finally {
      setBusy("");
    }
  }

  async function createCatalogEntry() {
    const code = catalogCode.trim();
    const label = catalogLabel.trim();
    if (!code || !label) {
      setError("Catalog code and label are required.");
      return;
    }

    setBusy("catalog");
    setError("");
    try {
      await pmsClient.createAddOnCatalogEntry(
        {
          code,
          label,
          type: catalogType,
          defaultAmount: catalogDefaultAmount.trim() ? Number(catalogDefaultAmount) : null,
        },
        config,
      );
      onToast("Catalog entry created.");
      setCatalogCode("");
      setCatalogLabel("");
      setCatalogDefaultAmount("");
      await loadCatalog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create catalog entry.");
    } finally {
      setBusy("");
    }
  }

  async function removeCatalogEntry(code: string) {
    setBusy(code);
    setError("");
    try {
      await pmsClient.deleteAddOnCatalogEntry(code, config);
      onToast("Catalog entry deleted.");
      await loadCatalog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete catalog entry.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="payroll-page">
      <div className="tab-bar">
        <button className={tab === "all" ? "tab active" : "tab"} type="button" onClick={() => setTab("all")}>
          All add-ons
        </button>
        <button className={tab === "expenses" ? "tab active" : "tab"} type="button" onClick={() => setTab("expenses")}>
          Expenses
        </button>
        <button className={tab === "oncall" ? "tab active" : "tab"} type="button" onClick={() => setTab("oncall")}>
          On-call
        </button>
        <button className={tab === "manual" ? "tab active" : "tab"} type="button" onClick={() => setTab("manual")}>
          Manual
        </button>
        <button className={tab === "catalog" ? "tab active" : "tab"} type="button" onClick={() => setTab("catalog")}>
          Catalog
        </button>
      </div>

      <div className="panel">
        <div className="section-head">
          <div>
            <h2>Add-ons</h2>
            <p>Manual bonuses, expense lines, and on-call allowances for the selected payroll period. BONUS and OTHER types require a note.</p>
          </div>
        </div>

        {!grantActive && tab !== "catalog" && (
          <div className="alert warn">
            Add-on amounts are encrypted. Authenticate with your passkey to review or edit add-ons.
            <button className="link-button" type="button" onClick={onGoToPasskeys}>
              Open passkeys
            </button>
          </div>
        )}
        {grantActive && remainingMs !== null && tab !== "catalog" && <div className="alert info">Key grant active — {Math.floor(remainingMs / 60000)}:{String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")} remaining.</div>}
        {error && <div className="alert error">{error}</div>}

        {tab !== "catalog" && (
          <div className="inline-form">
            <label>
              Payroll run
              <select value={runId} onChange={(event) => setRunId(event.target.value)}>
                <option value="">Select a run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {formatRunLabel(run)} · {runStatusLabel(run.status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {tab === "catalog" ? (
          <>
            <div className="inline-form">
              <label>
                Code
                <input value={catalogCode} onChange={(event) => setCatalogCode(event.target.value)} placeholder="car_allowance" />
              </label>
              <label>
                Label
                <input value={catalogLabel} onChange={(event) => setCatalogLabel(event.target.value)} placeholder="Car Allowance" />
              </label>
              <label>
                Type
                <select value={catalogType} onChange={(event) => setCatalogType(event.target.value as AddOnCatalogType)}>
                  <option value="EXPENSE">EXPENSE</option>
                  <option value="ON_CALL">ON_CALL</option>
                  <option value="BONUS">BONUS</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </label>
              <label>
                Default amount
                <input value={catalogDefaultAmount} onChange={(event) => setCatalogDefaultAmount(event.target.value)} type="number" step="0.01" />
              </label>
              <button className="btn primary inline-action" type="button" onClick={() => void createCatalogEntry()} disabled={busy === "catalog"}>
                <Plus size={16} />
                Create catalog entry
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Label</th>
                    <th>Type</th>
                    <th className="num">Default amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((entry) => (
                    <tr key={entry.code}>
                      <td className="mono">{entry.code}</td>
                      <td>{entry.label}</td>
                      <td>{entry.type}</td>
                      <td className="num">{entry.defaultAmount ?? "—"}</td>
                      <td>
                        <button className="btn danger compact" type="button" onClick={() => void removeCatalogEntry(entry.code)} disabled={busy === entry.code}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {catalog.length === 0 && <EmptyTable colSpan={5} label="No catalog entries." />}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {selectedRun && runLocked && <div className="alert info">This run is locked — add-ons cannot be changed.</div>}

            {!runLocked && (
              <div className="inline-form">
                <label>
                  Employee ID
                  <input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} placeholder="employee external id" />
                </label>
                <label>
                  Catalog type
                  <select value={addOnType} onChange={(event) => setAddOnType(event.target.value)}>
                    {catalog.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label} ({item.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Label
                  <input value={addOnLabel} onChange={(event) => setAddOnLabel(event.target.value)} />
                </label>
                <label>
                  Amount
                  <input value={addOnAmount} onChange={(event) => setAddOnAmount(event.target.value)} type="number" step="0.01" />
                </label>
                <label>
                  Note
                  <input value={addOnNote} onChange={(event) => setAddOnNote(event.target.value)} />
                </label>
                <label>
                  Expense ref
                  <input value={addOnExpenseRef} onChange={(event) => setAddOnExpenseRef(event.target.value)} />
                </label>
                <label>
                  Rotations
                  <input value={addOnRotations} onChange={(event) => setAddOnRotations(event.target.value)} type="number" />
                </label>
                <label>
                  Rate
                  <input value={addOnRate} onChange={(event) => setAddOnRate(event.target.value)} type="number" step="0.01" />
                </label>
                <button className="btn primary inline-action" type="button" onClick={() => void addPayElement()} disabled={!grantActive || busy === "add"}>
                  <Plus size={16} />
                  Add manual
                </button>
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Label</th>
                    <th className="num">Amount</th>
                    <th>Note</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAddOns.map((addOn) => (
                    <tr key={addOn.id}>
                      <td>{addOn.employeeId}</td>
                      <td>{addOn.type}</td>
                      <td>{addOn.label}</td>
                      <td className="num">{grantActive ? formatMoney(addOn.amount) : "—"}</td>
                      <td>{addOn.note || "—"}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn secondary compact" type="button" onClick={() => onInspectAudit({ entity: "pay_element", entityId: addOn.id })}>
                            <History size={13} />
                          </button>
                          <button className="btn danger compact" type="button" onClick={() => void removePayElement(addOn.id)} disabled={runLocked || busy === addOn.id}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleAddOns.length === 0 && <EmptyTable colSpan={6} label={runId ? (grantActive ? "No add-ons in this tab for the selected run." : "Key grant required.") : "Select a payroll run."} />}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
