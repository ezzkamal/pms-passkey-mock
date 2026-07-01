import {
  Banknote,
  History,
  KeyRound,
  Monitor,
  LockKeyhole,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  clearClientConfig,
  defaultClientConfig,
  loadClientConfig,
  pmsClient,
  saveClientConfig,
  type PmsClientConfig,
} from "./api/pmsClient";
import { authClient, fetchPmsAccessToken, signInWithKeycloak, signOutOfBetterAuth, type BetterAuthSession } from "./api/authClient";
import { createPasskeyCredential, getPasskeyCredential } from "./api/webauthn";
import type { KeyApprovalResponse, KeyGrantResponse, PasskeyRegistrationMode, PayrollRun, SalaryRecord, Section } from "./types";

const sectionLabels: Record<Section, string> = {
  passkeys: "Passkeys",
  "payroll-runs": "Payroll Runs",
  salaries: "Salaries",
  approvals: "Key Approvals",
  audit: "Audit",
};

function App() {
  const [section, setSection] = useState<Section>("passkeys");
  const [config, setConfig] = useState<PmsClientConfig>(() => loadClientConfig());
  const [toast, setToast] = useState("");
  const [authError, setAuthError] = useState("");
  const [tokenPending, setTokenPending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sessionQuery = authClient.useSession();
  const session = sessionQuery.data as BetterAuthSession | null;
  const sessionPending = Boolean(sessionQuery.isPending);
  const devTokenAuth = import.meta.env.VITE_DEV_TOKEN_AUTH === "true";

  const signedIn = Boolean(session) || devTokenAuth;
  const authed = signedIn && config.authToken.trim().length > 0;
  const headerTitle = authed ? sectionLabels[section] : signedIn ? "PMS Token Required" : "Redirecting to Keycloak";
  const signedInLabel = session?.user?.email || session?.user?.name || (devTokenAuth ? "Stored Keycloak token" : "Signed in");

  useEffect(() => {
    if (!signedIn) {
      setConfig((current) => ({ ...current, authToken: "" }));
      return;
    }
    void refreshAccessToken();
  }, [signedIn]);

  function persistConfig(next: PmsClientConfig) {
    setConfig(next);
    saveClientConfig(next);
  }

  function clearAuth() {
    void signOutOfBetterAuth().finally(() => {
      clearClientConfig();
      setConfig(defaultClientConfig);
      setSection("passkeys");
      pushToast("Signed out.");
    });
  }

  async function refreshAccessToken() {
    setTokenPending(true);
    setAuthError("");
    try {
      const token = await fetchPmsAccessToken();
      setConfig((current) => ({ ...current, authToken: token.accessToken }));
    } catch (error) {
      setConfig((current) => ({ ...current, authToken: "" }));
      setAuthError(error instanceof Error ? error.message : "Could not get Keycloak access token from Better Auth.");
    } finally {
      setTokenPending(false);
    }
  }

  function pushToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">IM</div>
          <div>
            <div className="brand-name">iMedia24</div>
            <div className="brand-sub">PMS real API lab</div>
          </div>
        </div>

        <nav className="nav-list" aria-label="PMS tester navigation">
          {(Object.keys(sectionLabels) as Section[]).map((item) => (
            <button className={item === section ? "nav-item active" : "nav-item"} key={item} type="button" onClick={() => setSection(item)} disabled={!authed}>
              {item === "passkeys" && <KeyRound size={17} />}
              {item === "payroll-runs" && <Banknote size={17} />}
              {item === "salaries" && <LockKeyhole size={17} />}
              {item === "approvals" && <UserCheck size={17} />}
              {item === "audit" && <History size={17} />}
              {sectionLabels[item]}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="page-header">
          <div className="page-title">
            <ShieldCheck size={21} />
            <h1>{headerTitle}</h1>
          </div>
          <div className="header-actions">
            <div className={signedIn ? "connection-pill on" : "connection-pill"}>{signedIn ? signedInLabel : "Signed out"}</div>
            <div className={authed ? "connection-pill on" : "connection-pill"}>{authed ? "PMS token" : tokenPending ? "Loading token" : "No PMS token"}</div>
            {config.keyGrantToken && <div className="connection-pill on">Key grant</div>}
            {signedIn && (
              <button className="btn secondary" type="button" onClick={() => setSettingsOpen((open) => !open)}>
                <Settings size={16} />
                Settings
              </button>
            )}
            <button className="btn secondary" type="button" onClick={clearAuth}>
              <Trash2 size={16} />
              Sign out
            </button>
          </div>
        </header>

        <section className="content">
          {sessionPending ? (
            <div className="auth-card">Checking Better Auth session...</div>
          ) : !signedIn ? (
            <KeycloakRedirect />
          ) : (
            <>
              {(settingsOpen || authError) && <ApiConfigPanel config={config} authError={authError} tokenPending={tokenPending} onSave={persistConfig} onRefreshToken={refreshAccessToken} />}
              {!authed ? (
                <TokenRequiredPanel tokenPending={tokenPending} onRefreshToken={refreshAccessToken} onSignOut={clearAuth} />
              ) : (
                <>
                  {section === "passkeys" && <PasskeyWorkflow config={config} onConfig={persistConfig} onToast={pushToast} />}
                  {section === "payroll-runs" && <PayrollRunsView config={config} onToast={pushToast} />}
                  {section === "salaries" && <SalariesView config={config} onToast={pushToast} />}
                  {section === "approvals" && <KeyApprovalsView config={config} onToast={pushToast} />}
                  {section === "audit" && <AuditView config={config} />}
                </>
              )}
            </>
          )}
        </section>
      </main>

      <div className={toast ? "toast show" : "toast"} role="status">
        {toast}
      </div>
    </div>
  );
}

function KeycloakRedirect() {
  const started = useRef(false);
  const [error, setError] = useState("");

  async function startSignIn() {
    if (started.current) return;
    started.current = true;
    setError("");
    try {
      await signInWithKeycloak();
    } catch (caught) {
      started.current = false;
      setError(caught instanceof Error ? caught.message : "Could not start Keycloak sign-in.");
    }
  }

  useEffect(() => {
    void startSignIn();
  }, []);

  return (
    <div className="auth-card">
      <h2>Redirecting to Keycloak</h2>
      {error && <div className="alert error">{error}</div>}
      {error && (
        <div className="modal-actions">
          <button className="btn primary" type="button" onClick={() => void startSignIn()}>
            <KeyRound size={16} />
            Try Keycloak again
          </button>
        </div>
      )}
    </div>
  );
}

function TokenRequiredPanel({ tokenPending, onRefreshToken, onSignOut }: { tokenPending: boolean; onRefreshToken: () => Promise<void>; onSignOut: () => void }) {
  return (
    <div className="panel token-required">
      <h2>PMS token required</h2>
      <div className="button-row">
        <button className="btn primary" type="button" onClick={() => void onRefreshToken()} disabled={tokenPending}>
          <RefreshCw size={16} />
          Refresh token
        </button>
        <button className="btn secondary" type="button" onClick={onSignOut}>
          <Trash2 size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}

function ApiConfigPanel({
  config,
  authError,
  tokenPending,
  onSave,
  onRefreshToken,
}: {
  config: PmsClientConfig;
  authError: string;
  tokenPending: boolean;
  onSave: (config: PmsClientConfig) => void;
  onRefreshToken: () => Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [keyGrantToken, setKeyGrantToken] = useState(config.keyGrantToken);

  useEffect(() => {
    setBaseUrl(config.baseUrl);
    setKeyGrantToken(config.keyGrantToken);
  }, [config]);

  return (
    <div className="api-status">
      <div className="api-config-grid">
        <label>
          Base URL
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label>
          PMS token
          <input value={config.authToken ? "Loaded" : tokenPending ? "Loading" : "Missing"} readOnly />
        </label>
        <label>
          Key-grant token
          <input value={keyGrantToken} onChange={(event) => setKeyGrantToken(event.target.value)} type="password" />
        </label>
        <button className="btn secondary save-config" type="button" onClick={() => onSave({ baseUrl: baseUrl.trim(), authToken: config.authToken, keyGrantToken: keyGrantToken.trim() })}>
          <Save size={15} />
          Save
        </button>
        <button className="btn secondary save-config" type="button" onClick={() => void onRefreshToken()}>
          <RefreshCw size={15} />
          Refresh token
        </button>
      </div>
      {authError && <div className="alert error">{authError}</div>}
    </div>
  );
}

function PasskeyWorkflow({ config, onConfig, onToast }: { config: PmsClientConfig; onConfig: (config: PmsClientConfig) => void; onToast: (message: string) => void }) {
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [grant, setGrant] = useState<KeyGrantResponse | null>(config.keyGrantToken ? { token: config.keyGrantToken, expiresAt: "Stored locally" } : null);
  const [registrationMode, setRegistrationMode] = useState<PasskeyRegistrationMode>("phone");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);

  function appendLog(message: string) {
    setLog((current) => [`${new Date().toLocaleTimeString()} - ${message}`, ...current].slice(0, 8));
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Passkey operation failed.";
      setError(message);
      appendLog(message);
    } finally {
      setBusy("");
    }
  }

  async function checkStatus() {
    await run("Checking passkey status", async () => {
      const response = await pmsClient.getPasskeyStatus(config);
      setRegistered(response.registered);
      appendLog(response.registered ? "Passkey is registered for this user." : "No passkey is registered for this user.");
    });
  }

  async function registerPasskey() {
    await run("Registering passkey", async () => {
      const options = await pmsClient.startPasskeyRegistration(config, registrationMode);
      appendLog(`Registration ceremony started: ${options.ceremonyId}`);
      const credentialJson = await createPasskeyCredential(options.publicKey);
      await pmsClient.finishPasskeyRegistration({ ceremonyId: options.ceremonyId, credentialJson }, config);
      setRegistered(true);
      appendLog("Registration verified by PMS.");
      onToast("Passkey registered.");
    });
  }

  async function authenticatePasskey() {
    await run("Authenticating passkey", async () => {
      const options = await pmsClient.startPasskeyAuthentication(config);
      appendLog(`Authentication ceremony started: ${options.ceremonyId}`);
      const credentialJson = await getPasskeyCredential(options.publicKey);
      const response = await pmsClient.finishPasskeyAuthentication({ ceremonyId: options.ceremonyId, credentialJson }, config);
      setGrant(response);
      onConfig({ ...config, keyGrantToken: response.token });
      appendLog(`Key grant released. Expires at ${response.expiresAt}.`);
      onToast("Salary key-grant token stored locally.");
    });
  }

  async function revokeGrant() {
    await run("Revoking key grant", async () => {
      const token = grant?.token || config.keyGrantToken;
      await pmsClient.revokeKeyGrant(token, config);
      setGrant(null);
      onConfig({ ...config, keyGrantToken: "" });
      appendLog("Key grant revoked.");
      onToast("Key grant revoked.");
    });
  }

  return (
    <div className="work-grid">
      <div className="panel passkey-panel">
        <div className="section-head">
          <div>
            <h2>Passkey</h2>
          </div>
        </div>
        <div className="status-strip">
          <StatusItem label="Registration" value={registered === null ? "Unknown" : registered ? "Registered" : "Not registered"} tone={registered ? "ok" : "warn"} />
          <StatusItem label="Key grant" value={grant?.token || config.keyGrantToken ? "Stored locally" : "Missing"} tone={grant?.token || config.keyGrantToken ? "ok" : "warn"} />
          <StatusItem label="Context" value={window.isSecureContext ? "Secure" : "Not secure"} tone={window.isSecureContext ? "ok" : "bad"} />
        </div>
        <div className="button-row">
          <button className="btn secondary" type="button" onClick={checkStatus} disabled={Boolean(busy)}>
            <RefreshCw size={16} />
            Check status
          </button>
          <div className="segmented-control" aria-label="Passkey registration preference">
            <button type="button" className={registrationMode === "phone" ? "active" : ""} aria-pressed={registrationMode === "phone"} onClick={() => setRegistrationMode("phone")} disabled={Boolean(busy)}>
              <Smartphone size={15} />
              Phone first
            </button>
            <button type="button" className={registrationMode === "device" ? "active" : ""} aria-pressed={registrationMode === "device"} onClick={() => setRegistrationMode("device")} disabled={Boolean(busy)}>
              <Monitor size={15} />
              This device
            </button>
          </div>
          <button className="btn primary" type="button" onClick={() => void registerPasskey()} disabled={Boolean(busy)}>
            <KeyRound size={16} />
            Register passkey
          </button>
          <button className="btn primary" type="button" onClick={authenticatePasskey} disabled={Boolean(busy)}>
            <LockKeyhole size={16} />
            Authenticate
          </button>
          <button className="btn secondary" type="button" onClick={revokeGrant} disabled={Boolean(busy) || !(grant?.token || config.keyGrantToken)}>
            <Trash2 size={16} />
            Revoke grant
          </button>
        </div>
        {busy && <div className="alert info">{busy}...</div>}
        {error && <div className="alert error">{error}</div>}
      </div>

      {(grant?.token || config.keyGrantToken) && (
        <div className="panel">
          <h2>Key grant</h2>
          <div className="token-box">{grant?.token || config.keyGrantToken}</div>
          <div className="api-note">Expires: {grant?.expiresAt || "Unknown"}</div>
        </div>
      )}

      {log.length > 0 && (
        <div className="panel full-span">
          <h2>Log</h2>
          <ul className="log-list">
            {log.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PayrollRunsView({ config, onToast }: { config: PmsClientConfig; onToast: (message: string) => void }) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("7");
  const [status, setStatus] = useState<"DRAFT" | "OPEN" | "LOCKED">("DRAFT");

  async function loadRuns() {
    setLoading(true);
    setError("");
    try {
      setRuns(await pmsClient.listPayrollRuns(config));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load payroll runs.");
    } finally {
      setLoading(false);
    }
  }

  async function createRun() {
    setLoading(true);
    setError("");
    try {
      await pmsClient.createPayrollRun({ year: Number(year), month: Number(month), status }, config);
      onToast("Payroll run created in PMS.");
      await loadRuns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create payroll run.");
    } finally {
      setLoading(false);
    }
  }

  async function transition(id: string, nextStatus: "OPEN" | "LOCKED") {
    setError("");
    try {
      await pmsClient.transitionPayrollRun(id, nextStatus, config);
      onToast(`Payroll run moved to ${nextStatus}.`);
      await loadRuns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not transition payroll run.");
    }
  }

  useEffect(() => {
    void loadRuns();
  }, [config.authToken, config.baseUrl]);

  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <h2>Payroll runs</h2>
        </div>
        <button className="btn secondary" type="button" onClick={loadRuns} disabled={loading}>
          <RefreshCw size={16} />
          Reload
        </button>
      </div>
      <div className="inline-form">
        <label>
          Year
          <input value={year} onChange={(event) => setYear(event.target.value)} />
        </label>
        <label>
          Month
          <input value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as "DRAFT" | "OPEN" | "LOCKED")}>
            <option>DRAFT</option>
            <option>OPEN</option>
            <option>LOCKED</option>
          </select>
        </label>
        <button className="btn primary inline-action" type="button" onClick={createRun} disabled={loading}>
          Create run
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Status</th>
              <th>Created by</th>
              <th>Locked</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.year}-{String(run.month).padStart(2, "0")}</td>
                <td><span className="badge blue">{run.status}</span></td>
                <td>{run.createdBy || "-"}</td>
                <td>{run.lockedAt || "-"}</td>
                <td>
                  {run.status === "DRAFT" && <button className="btn secondary compact" type="button" onClick={() => transition(run.id, "OPEN")}>Move to OPEN</button>}
                  {run.status === "OPEN" && <button className="btn secondary compact" type="button" onClick={() => transition(run.id, "LOCKED")}>Lock</button>}
                </td>
              </tr>
            ))}
            {runs.length === 0 && <EmptyTable colSpan={5} label={loading ? "Loading payroll runs..." : "No payroll runs returned by PMS."} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalariesView({ config, onToast }: { config: PmsClientConfig; onToast: (message: string) => void }) {
  const [employeeExternalId, setEmployeeExternalId] = useState("");
  const [salary, setSalary] = useState<SalaryRecord | null>(null);
  const [history, setHistory] = useState<SalaryRecord[]>([]);
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");

  async function loadSalary() {
    setError("");
    try {
      setSalary(await pmsClient.getSalary(employeeExternalId, config));
      setHistory(await pmsClient.getSalaryHistory(employeeExternalId, config));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load salary.");
    }
  }

  async function createSalary() {
    setError("");
    try {
      await pmsClient.createSalary({ employeeExternalId, netBaseSalary: Number(amount), effectiveFrom, source: "MANUAL" }, config);
      onToast("Salary record created.");
      await loadSalary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create salary.");
    }
  }

  const missingGrant = !config.keyGrantToken;

  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <h2>Salaries</h2>
        </div>
      </div>
      {missingGrant && <div className="alert warn">Authenticate with a passkey first to release a key-grant token.</div>}
      <div className="inline-form">
        <label>
          Employee external ID
          <input value={employeeExternalId} onChange={(event) => setEmployeeExternalId(event.target.value)} placeholder="employee external id" />
        </label>
        <button className="btn secondary inline-action" type="button" onClick={loadSalary} disabled={missingGrant || !employeeExternalId}>
          Load salary
        </button>
      </div>
      <div className="inline-form">
        <label>
          Net base salary
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </label>
        <label>
          Effective from
          <input value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} type="date" />
        </label>
        <button className="btn primary inline-action" type="button" onClick={createSalary} disabled={missingGrant || !employeeExternalId || !amount}>
          Create salary record
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {salary && (
        <div className="result-card">
          <h2>Current salary</h2>
          <pre>{JSON.stringify(salary, null, 2)}</pre>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Effective from</th>
              <th>Effective to</th>
              <th>Source</th>
              <th className="num">Net base</th>
            </tr>
          </thead>
          <tbody>
            {history.map((record) => (
              <tr key={record.id}>
                <td>{record.effectiveFrom}</td>
                <td>{record.effectiveTo || "-"}</td>
                <td>{record.source}</td>
                <td className="num">{record.netBaseSalary}</td>
              </tr>
            ))}
            {history.length === 0 && <EmptyTable colSpan={4} label="No salary history loaded." />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KeyApprovalsView({ config, onToast }: { config: PmsClientConfig; onToast: (message: string) => void }) {
  const [approvals, setApprovals] = useState<KeyApprovalResponse[]>([]);
  const [credentialId, setCredentialId] = useState("");
  const [error, setError] = useState("");

  async function loadApprovals() {
    setError("");
    try {
      setApprovals(await pmsClient.getPendingKeyApprovals(config));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load key approvals.");
    }
  }

  async function approve(id: string, self = false) {
    setError("");
    try {
      await (self ? pmsClient.approveMockKeySelf(id, config) : pmsClient.approveKey(id, config));
      onToast(self ? "Mock self approval completed." : "Key approved.");
      setCredentialId("");
      await loadApprovals();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve key.");
    }
  }

  useEffect(() => {
    void loadApprovals();
  }, [config.authToken, config.baseUrl]);

  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <h2>Key approvals</h2>
        </div>
        <button className="btn secondary" type="button" onClick={loadApprovals}>
          <RefreshCw size={16} />
          Reload
        </button>
      </div>
      <div className="inline-form">
        <label>
          Credential ID
          <input value={credentialId} onChange={(event) => setCredentialId(event.target.value)} />
        </label>
        <button className="btn secondary inline-action" type="button" onClick={() => approve(credentialId)} disabled={!credentialId}>Approve</button>
        <button className="btn primary inline-action" type="button" onClick={() => approve(credentialId, true)} disabled={!credentialId}>Mock self approve</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Credential ID</th>
              <th>Email</th>
              <th>User</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((approval) => (
              <tr key={approval.credentialId}>
                <td className="mono">{approval.credentialId}</td>
                <td>{approval.email}</td>
                <td>{approval.userExternalId}</td>
                <td>{approval.createdAt || "-"}</td>
                <td><button className="btn secondary compact" type="button" onClick={() => approve(approval.credentialId)}>Approve</button></td>
              </tr>
            ))}
            {approvals.length === 0 && <EmptyTable colSpan={5} label="No pending key approvals returned." />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditView({ config }: { config: PmsClientConfig }) {
  const [entity, setEntity] = useState("SalaryRecord");
  const [entityId, setEntityId] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  async function loadAudit() {
    setError("");
    try {
      setResult(await pmsClient.getAuditRecords(entity, entityId, config));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load audit records.");
    }
  }

  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <h2>Audit records</h2>
        </div>
      </div>
      <div className="inline-form">
        <label>
          Entity
          <input value={entity} onChange={(event) => setEntity(event.target.value)} />
        </label>
        <label>
          Entity ID
          <input value={entityId} onChange={(event) => setEntityId(event.target.value)} />
        </label>
        <button className="btn primary inline-action" type="button" onClick={loadAudit} disabled={!entity || !entityId}>Load audit</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="result-card">
        <pre>{result ? JSON.stringify(result, null, 2) : "No audit query has run."}</pre>
      </div>
    </div>
  );
}

function StatusItem({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "bad" }) {
  return (
    <div className={`status-item ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyTable({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td className="empty-table" colSpan={colSpan}>{label}</td>
    </tr>
  );
}

export default App;
