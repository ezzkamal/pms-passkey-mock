import {
  Banknote,
  History,
  KeyRound,
  Monitor,
  LockKeyhole,
  RefreshCw,
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
import type {
  ApprovalState,
  AuditRecord,
  KeyApprovalResponse,
  PagedResponse,
  PasskeyRegistrationMode,
  PayrollRun,
  PayrollRunStatusTransition,
  SalaryRecord,
  SalaryRecordSource,
  Section,
} from "./types";

const sectionLabels: Record<Section, string> = {
  passkeys: "Passkeys",
  approvals: "Key Approvals",
  salaries: "Salaries",
  "payroll-runs": "Payroll Runs",
  audit: "Audit",
};

type FlowState = {
  registered: boolean | null;
  approval: ApprovalState;
};

type AuditTarget = {
  entity: string;
  entityId: string;
};

function grantRemainingMs(config: PmsClientConfig, now: number): number | null {
  if (!config.keyGrantToken) return null;
  if (!config.keyGrantExpiresAt) return null;
  return Date.parse(config.keyGrantExpiresAt) - now;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function App() {
  const [section, setSection] = useState<Section>("passkeys");
  const [config, setConfig] = useState<PmsClientConfig>(() => loadClientConfig());
  const [flow, setFlow] = useState<FlowState>({ registered: null, approval: "unknown" });
  const [auditTarget, setAuditTarget] = useState<AuditTarget>({ entity: "SalaryRecord", entityId: "" });
  const [vaultUnlockedOnce, setVaultUnlockedOnce] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState("");
  const [authError, setAuthError] = useState("");
  const [tokenPending, setTokenPending] = useState(false);
  const sessionQuery = authClient.useSession();
  const session = sessionQuery.data as BetterAuthSession | null;
  const sessionPending = Boolean(sessionQuery.isPending);
  const devTokenAuth = import.meta.env.VITE_DEV_TOKEN_AUTH === "true";

  const signedIn = Boolean(session) || devTokenAuth;
  const authed = signedIn && config.authToken.trim().length > 0;
  const headerTitle = authed ? sectionLabels[section] : signedIn ? "PMS Token Required" : "Redirecting to Keycloak";
  const signedInLabel = session?.user?.email || session?.user?.name || (devTokenAuth ? "Stored Keycloak token" : "Signed in");
  const sessionEmail = session?.user?.email || "";

  const remainingMs = grantRemainingMs(config, now);
  const grantActive = Boolean(config.keyGrantToken) && (remainingMs === null || remainingMs > 0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Mirror the server: a key grant is only valid until expiresAt, so drop it locally when it lapses.
  useEffect(() => {
    if (config.keyGrantToken && remainingMs !== null && remainingMs <= 0) {
      persistConfig({ ...config, keyGrantToken: "", keyGrantExpiresAt: "" });
      pushToast("Key grant expired. Authenticate with your passkey again to reopen the salary vault.");
    }
  }, [remainingMs, config.keyGrantToken]);

  useEffect(() => {
    if (!signedIn) {
      setConfig((current) => ({ ...current, authToken: "" }));
      setFlow({ registered: null, approval: "unknown" });
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
      setFlow({ registered: null, approval: "unknown" });
      setVaultUnlockedOnce(false);
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

  function inspectAudit(target: AuditTarget) {
    setAuditTarget(target);
    setSection("audit");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">IM</div>
          <div>
            <div className="brand-name">iMedia24</div>
            <div className="brand-sub">PMS salary-access simulation</div>
          </div>
        </div>

        <nav className="nav-list" aria-label="PMS tester navigation">
          {(Object.keys(sectionLabels) as Section[]).map((item) => (
            <button className={item === section ? "nav-item active" : "nav-item"} key={item} type="button" onClick={() => setSection(item)} disabled={!authed}>
              {item === "passkeys" && <KeyRound size={17} />}
              {item === "approvals" && <UserCheck size={17} />}
              {item === "salaries" && <LockKeyhole size={17} />}
              {item === "payroll-runs" && <Banknote size={17} />}
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
            {grantActive && <div className="connection-pill on">Key grant {remainingMs !== null ? formatCountdown(remainingMs) : "active"}</div>}
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
              {authError && <div className="alert error">{authError}</div>}
              {!authed ? (
                <TokenRequiredPanel tokenPending={tokenPending} onRefreshToken={refreshAccessToken} onSignOut={clearAuth} />
              ) : (
                <>
                  <FlowStepper signedIn={signedIn} authed={authed} flow={flow} grantActive={grantActive} remainingMs={remainingMs} vaultUnlockedOnce={vaultUnlockedOnce} />
                  {section === "passkeys" && (
                    <PasskeyWorkflow
                      config={config}
                      flow={flow}
                      grantActive={grantActive}
                      remainingMs={remainingMs}
                      sessionEmail={sessionEmail}
                      onFlow={setFlow}
                      onConfig={persistConfig}
                      onToast={pushToast}
                      onGoToApprovals={() => setSection("approvals")}
                    />
                  )}
                  {section === "approvals" && <KeyApprovalsView config={config} sessionEmail={sessionEmail} onFlow={setFlow} flow={flow} onToast={pushToast} />}
                  {section === "salaries" && (
                    <SalariesView
                      config={config}
                      grantActive={grantActive}
                      remainingMs={remainingMs}
                      onToast={pushToast}
                      onUnlocked={() => setVaultUnlockedOnce(true)}
                      onInspectAudit={inspectAudit}
                      onGoToPasskeys={() => setSection("passkeys")}
                    />
                  )}
                  {section === "payroll-runs" && <PayrollRunsView config={config} onToast={pushToast} />}
                  {section === "audit" && <AuditView config={config} target={auditTarget} onTarget={setAuditTarget} />}
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

function FlowStepper({
  signedIn,
  authed,
  flow,
  grantActive,
  remainingMs,
  vaultUnlockedOnce,
}: {
  signedIn: boolean;
  authed: boolean;
  flow: FlowState;
  grantActive: boolean;
  remainingMs: number | null;
  vaultUnlockedOnce: boolean;
}) {
  const steps: Array<{ label: string; done: boolean; hint?: string }> = [
    { label: "Keycloak sign-in", done: signedIn },
    { label: "Access token", done: authed },
    { label: "Passkey registered", done: flow.registered === true },
    { label: "Key approved", done: flow.approval === "approved", hint: flow.approval === "pending" ? "another admin" : undefined },
    { label: "Key grant", done: grantActive, hint: grantActive && remainingMs !== null ? formatCountdown(remainingMs) : undefined },
    { label: "Salary vault", done: grantActive && vaultUnlockedOnce },
  ];
  const activeIndex = steps.findIndex((step) => !step.done);

  return (
    <div className="workflow" aria-label="Salary access flow">
      {steps.map((step, index) => {
        const state = step.done ? "done" : index === activeIndex ? "active" : "";
        return (
          <div className="workflow-step" key={step.label}>
            <div className={`workflow-dot ${state}`.trim()}>{step.done ? "✓" : index + 1}</div>
            <div className={`workflow-label ${state}`.trim()}>
              {step.label}
              {step.hint ? ` (${step.hint})` : ""}
            </div>
          </div>
        );
      })}
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
      <p>PMS only accepts Keycloak JWTs with the ADMIN realm role. Every call below runs against the real API.</p>
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
      <p>The Keycloak session exists, but Better Auth has not handed over an access token yet. Without it PMS rejects every request with 401.</p>
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

function PasskeyWorkflow({
  config,
  flow,
  grantActive,
  remainingMs,
  sessionEmail,
  onFlow,
  onConfig,
  onToast,
  onGoToApprovals,
}: {
  config: PmsClientConfig;
  flow: FlowState;
  grantActive: boolean;
  remainingMs: number | null;
  sessionEmail: string;
  onFlow: (flow: FlowState) => void;
  onConfig: (config: PmsClientConfig) => void;
  onToast: (message: string) => void;
  onGoToApprovals: () => void;
}) {
  const [registrationMode, setRegistrationMode] = useState<PasskeyRegistrationMode>("phone");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);

  function appendLog(message: string) {
    setLog((current) => [`${new Date().toLocaleTimeString()} - ${message}`, ...current].slice(0, 10));
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
      appendLog(response.registered ? "Passkey is registered for this user." : "No passkey is registered for this user.");
      if (!response.registered) {
        onFlow({ registered: false, approval: "unknown" });
        return;
      }
      // Registered — the pending-approvals list tells us whether the key authority has signed it off.
      let approval: ApprovalState = flow.approval;
      try {
        const pending = await pmsClient.getPendingKeyApprovals(config);
        const minePending = sessionEmail ? pending.some((entry) => entry.email.toLowerCase() === sessionEmail.toLowerCase()) : false;
        approval = minePending ? "pending" : "approved";
        appendLog(minePending ? "Your passkey is still waiting for approval by another admin." : "Your passkey has been approved by the key authority.");
      } catch {
        appendLog("Could not determine approval state from the pending list.");
      }
      onFlow({ registered: true, approval });
    });
  }

  async function registerPasskey() {
    await run("Registering passkey", async () => {
      const options = await pmsClient.startPasskeyRegistration(config, registrationMode);
      appendLog(`Registration ceremony ${options.ceremonyId} started (single-use, expires in 5 minutes).`);
      const credentialJson = await createPasskeyCredential(options.publicKey);
      appendLog("Authenticator created a resident credential with the PRF extension (needed to derive the salary key).");
      await pmsClient.finishPasskeyRegistration({ ceremonyId: options.ceremonyId, credentialJson }, config);
      onFlow({ registered: true, approval: "pending" });
      appendLog("PMS verified the attestation. The credential is now pending key-authority approval.");
      onToast("Passkey registered. A different admin must approve it before it can release salary keys.");
    });
  }

  async function authenticatePasskey() {
    await run("Authenticating passkey", async () => {
      const options = await pmsClient.startPasskeyAuthentication(config);
      appendLog(`Authentication ceremony ${options.ceremonyId} started.`);
      const credentialJson = await getPasskeyCredential(options.publicKey);
      appendLog("Authenticator produced an assertion plus the PRF output that unwraps the salary data key.");
      const response = await pmsClient.finishPasskeyAuthentication({ ceremonyId: options.ceremonyId, credentialJson }, config);
      onFlow({ registered: true, approval: "approved" });
      onConfig({ ...config, keyGrantToken: response.token, keyGrantExpiresAt: response.expiresAt });
      appendLog(`PMS re-wrapped the salary key under a one-time grant token. Expires at ${response.expiresAt}.`);
      onToast("Key grant released. The salary vault is open until the grant expires.");
    });
  }

  async function revokeGrant() {
    await run("Revoking key grant", async () => {
      await pmsClient.revokeKeyGrant(config.keyGrantToken, config);
      onConfig({ ...config, keyGrantToken: "", keyGrantExpiresAt: "" });
      appendLog("Key grant revoked server-side. Salary endpoints will reject the token immediately.");
      onToast("Key grant revoked.");
    });
  }

  const approvalPending = flow.registered === true && flow.approval === "pending";

  return (
    <div className="work-grid">
      <div className="panel passkey-panel">
        <div className="section-head">
          <div>
            <h2>Passkey</h2>
            <p>
              Salary amounts are envelope-encrypted. Decrypting them requires a passkey with the PRF extension, a one-time approval by a second admin, and a
              short-lived key grant released on each authentication.
            </p>
          </div>
        </div>
        <div className="status-strip">
          <StatusItem
            label="Registration"
            value={flow.registered === null ? "Unknown" : flow.registered ? "Registered" : "Not registered"}
            tone={flow.registered ? "ok" : "warn"}
          />
          <StatusItem
            label="Key approval"
            value={flow.approval === "approved" ? "Approved" : flow.approval === "pending" ? "Pending second admin" : "Unknown"}
            tone={flow.approval === "approved" ? "ok" : "warn"}
          />
          <StatusItem
            label="Key grant"
            value={grantActive ? (remainingMs !== null ? `Active · ${formatCountdown(remainingMs)}` : "Active") : "None"}
            tone={grantActive ? "ok" : "warn"}
          />
        </div>
        <div className="status-strip">
          <StatusItem label="Context" value={window.isSecureContext ? "Secure" : "Not secure"} tone={window.isSecureContext ? "ok" : "bad"} />
          <StatusItem label="Grant TTL" value="~10 minutes server-side" tone="ok" />
          <StatusItem label="Ceremony TTL" value="5 minutes, single-use" tone="ok" />
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
          <button className="btn primary" type="button" onClick={() => void registerPasskey()} disabled={Boolean(busy) || flow.registered === true}>
            <KeyRound size={16} />
            Register passkey
          </button>
          <button className="btn primary" type="button" onClick={authenticatePasskey} disabled={Boolean(busy) || flow.registered === false}>
            <LockKeyhole size={16} />
            Authenticate
          </button>
          <button className="btn secondary" type="button" onClick={revokeGrant} disabled={Boolean(busy) || !config.keyGrantToken}>
            <Trash2 size={16} />
            Revoke grant
          </button>
        </div>
        {approvalPending && (
          <div className="alert warn">
            Dual control: PMS refuses to release salary keys for this passkey until a <strong>different</strong> admin approves it. Authenticating now will fail
            with &quot;Key authority has not approved this passkey&quot;.
            <button className="link-button" type="button" onClick={onGoToApprovals}>
              Open Key Approvals
            </button>
          </div>
        )}
        {busy && <div className="alert info">{busy}...</div>}
        {error && <div className="alert error">{error}</div>}
      </div>

      {grantActive && (
        <div className="panel">
          <h2>Key grant</h2>
          <p>
            Shown once and never stored by the server (only its hash). It expires {config.keyGrantExpiresAt ? `at ${config.keyGrantExpiresAt}` : "shortly"}
            {remainingMs !== null ? ` — ${formatCountdown(remainingMs)} left` : ""}. Salary requests send it as <code>X-Key-Grant-Token</code>.
          </p>
          <div className="token-box">{config.keyGrantToken}</div>
        </div>
      )}

      {log.length > 0 && (
        <div className="panel full-span">
          <h2>Flow log</h2>
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

function KeyApprovalsView({
  config,
  sessionEmail,
  flow,
  onFlow,
  onToast,
}: {
  config: PmsClientConfig;
  sessionEmail: string;
  flow: FlowState;
  onFlow: (flow: FlowState) => void;
  onToast: (message: string) => void;
}) {
  const [approvals, setApprovals] = useState<KeyApprovalResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  async function loadApprovals() {
    setError("");
    try {
      const pending = await pmsClient.getPendingKeyApprovals(config);
      setApprovals(pending);
      setLoaded(true);
      if (flow.registered && sessionEmail) {
        const minePending = pending.some((entry) => entry.email.toLowerCase() === sessionEmail.toLowerCase());
        onFlow({ ...flow, approval: minePending ? "pending" : "approved" });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load key approvals.");
    }
  }

  async function approve(credentialId: string) {
    setError("");
    try {
      await pmsClient.approveKey(credentialId, config);
      onToast("Key approved. Its owner can now authenticate and receive key grants.");
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
          <p>
            Dual control over the salary key: a freshly registered passkey lands here, and PMS rejects approval by the credential&apos;s own user. One approval
            by a different admin is enough.
          </p>
        </div>
        <button className="btn secondary" type="button" onClick={loadApprovals}>
          <RefreshCw size={16} />
          Reload
        </button>
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
            {approvals.map((approval) => {
              const own = Boolean(sessionEmail) && approval.email.toLowerCase() === sessionEmail.toLowerCase();
              return (
                <tr key={approval.credentialId}>
                  <td className="mono">{approval.credentialId}</td>
                  <td>
                    {approval.email}
                    {own && <span className="flag amber">your key</span>}
                  </td>
                  <td>{approval.userExternalId}</td>
                  <td>{approval.createdAt || "-"}</td>
                  <td>
                    <button className="btn secondary compact" type="button" onClick={() => approve(approval.credentialId)} title={own ? "PMS will reject self-approval — sign in as another admin." : "Approve this key"}>
                      Approve
                    </button>
                  </td>
                </tr>
              );
            })}
            {approvals.length === 0 && <EmptyTable colSpan={5} label={loaded ? "No passkeys are waiting for approval." : "Loading pending approvals..."} />}
          </tbody>
        </table>
      </div>
      {approvals.some((approval) => sessionEmail && approval.email.toLowerCase() === sessionEmail.toLowerCase()) && (
        <div className="alert info">
          Your own key is in this list. Approving it from this session will fail with &quot;Key approval requires a different approver&quot; — that is the
          simulation working as designed. Sign in as a second admin (e.g. in another browser profile) to approve it.
        </div>
      )}
    </div>
  );
}

function PayrollRunsView({ config, onToast }: { config: PmsClientConfig; onToast: (message: string) => void }) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [historical, setHistorical] = useState(false);
  const [transitionsFor, setTransitionsFor] = useState<string | null>(null);
  const [transitions, setTransitions] = useState<PayrollRunStatusTransition[]>([]);
  const [periodEditFor, setPeriodEditFor] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const activeRun = runs.find((run) => run.status === "DRAFT" || run.status === "OPEN") || null;

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
      await pmsClient.createPayrollRun({ year: Number(year), month: Number(month), status: historical ? "LOCKED" : "DRAFT" }, config);
      onToast(historical ? "Historical run imported as LOCKED." : "Payroll run created as DRAFT.");
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
      onToast(nextStatus === "LOCKED" ? "Run locked. Its period is now immutable." : "Run opened for processing.");
      await loadRuns();
      if (transitionsFor === id) await showTransitions(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not transition payroll run.");
    }
  }

  async function showTransitions(id: string) {
    setError("");
    try {
      setTransitions(await pmsClient.getPayrollRunTransitions(id, config));
      setTransitionsFor(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load transition history.");
    }
  }

  function startPeriodEdit(run: PayrollRun) {
    setPeriodEditFor(run.id);
    setPeriodStart(run.periodStart);
    setPeriodEnd(run.periodEnd);
  }

  async function savePeriod(id: string) {
    setError("");
    try {
      await pmsClient.updatePayrollRunPeriod(id, periodStart, periodEnd, config);
      setPeriodEditFor(null);
      onToast("Payroll period updated.");
      await loadRuns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update period.");
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
          <p>
            Lifecycle is strictly DRAFT → OPEN → LOCKED, one run per month, and only one DRAFT/OPEN run may exist at a time. Every transition is recorded with
            its actor.
          </p>
        </div>
        <button className="btn secondary" type="button" onClick={loadRuns} disabled={loading}>
          <RefreshCw size={16} />
          Reload
        </button>
      </div>
      {activeRun && (
        <div className="alert info">
          {activeRun.year}-{String(activeRun.month).padStart(2, "0")} is currently {activeRun.status}. PMS will reject creating another run until it is LOCKED.
        </div>
      )}
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
          Historical import
          <select value={historical ? "yes" : "no"} onChange={(event) => setHistorical(event.target.value === "yes")}>
            <option value="no">No — create as DRAFT</option>
            <option value="yes">Yes — create as LOCKED</option>
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
              <th>Dates</th>
              <th>Status</th>
              <th>Created by</th>
              <th>Locked</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>
                  {run.year}-{String(run.month).padStart(2, "0")}
                </td>
                <td>
                  {periodEditFor === run.id ? (
                    <span className="button-row">
                      <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
                      <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
                      <button className="btn primary compact" type="button" onClick={() => savePeriod(run.id)}>
                        Save
                      </button>
                      <button className="btn secondary compact" type="button" onClick={() => setPeriodEditFor(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    `${run.periodStart} → ${run.periodEnd}`
                  )}
                </td>
                <td>
                  <span className={run.status === "LOCKED" ? "badge amber" : "badge blue"}>{run.status}</span>
                </td>
                <td>{run.createdBy || "-"}</td>
                <td>{run.lockedAt || "-"}</td>
                <td>
                  <span className="button-row">
                    {run.status === "DRAFT" && (
                      <button className="btn secondary compact" type="button" onClick={() => transition(run.id, "OPEN")}>
                        Open
                      </button>
                    )}
                    {run.status === "OPEN" && (
                      <button className="btn secondary compact" type="button" onClick={() => transition(run.id, "LOCKED")}>
                        Lock
                      </button>
                    )}
                    {run.status !== "LOCKED" && periodEditFor !== run.id && (
                      <button className="btn secondary compact" type="button" onClick={() => startPeriodEdit(run)}>
                        Edit period
                      </button>
                    )}
                    <button className="btn secondary compact" type="button" onClick={() => (transitionsFor === run.id ? setTransitionsFor(null) : void showTransitions(run.id))}>
                      {transitionsFor === run.id ? "Hide history" : "History"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {runs.length === 0 && <EmptyTable colSpan={6} label={loading ? "Loading payroll runs..." : "No payroll runs returned by PMS."} />}
          </tbody>
        </table>
      </div>
      {transitionsFor && (
        <div className="result-card">
          <h2>Status history</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Changed by</th>
                  <th>Changed at</th>
                </tr>
              </thead>
              <tbody>
                {transitions.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.fromStatus || "created"}</td>
                    <td>{entry.toStatus}</td>
                    <td>{entry.changedBy}</td>
                    <td>{entry.changedAt}</td>
                  </tr>
                ))}
                {transitions.length === 0 && <EmptyTable colSpan={4} label="No transitions recorded." />}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SalariesView({
  config,
  grantActive,
  remainingMs,
  onToast,
  onUnlocked,
  onInspectAudit,
  onGoToPasskeys,
}: {
  config: PmsClientConfig;
  grantActive: boolean;
  remainingMs: number | null;
  onToast: (message: string) => void;
  onUnlocked: () => void;
  onInspectAudit: (target: AuditTarget) => void;
  onGoToPasskeys: () => void;
}) {
  const [employeeExternalId, setEmployeeExternalId] = useState("");
  const [asOf, setAsOf] = useState("");
  const [salary, setSalary] = useState<SalaryRecord | null>(null);
  const [history, setHistory] = useState<SalaryRecord[]>([]);
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<SalaryRecordSource>("MANUAL");
  const [error, setError] = useState("");

  async function loadSalary() {
    setError("");
    try {
      setSalary(await pmsClient.getSalary(employeeExternalId, config, asOf || undefined));
      setHistory(await pmsClient.getSalaryHistory(employeeExternalId, config));
      onUnlocked();
      onToast("Salary decrypted. Each read was written to the audit trail as a DECRYPT event.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load salary.");
    }
  }

  async function createSalary() {
    setError("");
    try {
      await pmsClient.createSalary({ employeeExternalId, netBaseSalary: Number(amount), effectiveFrom, source }, config);
      onUnlocked();
      onToast("Salary record created. Any previously open record was closed the day before it takes effect.");
      await loadSalary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create salary.");
    }
  }

  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <h2>Salaries</h2>
          <p>
            Amounts are stored encrypted and append-only: a new record must start after the current one, which gets closed automatically. The employee must
            exist in EMS. Every decrypt — and every denied attempt — is audited.
          </p>
        </div>
      </div>
      {!grantActive && (
        <div className="alert warn">
          The salary vault is locked. Requests without a valid <code>X-Key-Grant-Token</code> are rejected and logged as DENIED audit events.
          <button className="link-button" type="button" onClick={onGoToPasskeys}>
            Authenticate with your passkey
          </button>
        </div>
      )}
      {grantActive && remainingMs !== null && (
        <div className="alert info">Key grant active — {formatCountdown(remainingMs)} until the vault locks again.</div>
      )}
      <div className="inline-form">
        <label>
          Employee external ID
          <input value={employeeExternalId} onChange={(event) => setEmployeeExternalId(event.target.value)} placeholder="employee external id" />
        </label>
        <label>
          As of (optional)
          <input value={asOf} onChange={(event) => setAsOf(event.target.value)} type="date" />
        </label>
        <button className="btn secondary inline-action" type="button" onClick={loadSalary} disabled={!grantActive || !employeeExternalId}>
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
        <label>
          Source
          <select value={source} onChange={(event) => setSource(event.target.value as SalaryRecordSource)}>
            <option>MANUAL</option>
            <option>IMPORT</option>
            <option>CORRECTION</option>
          </select>
        </label>
        <button className="btn primary inline-action" type="button" onClick={createSalary} disabled={!grantActive || !employeeExternalId || !amount}>
          Create salary record
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {salary && (
        <div className="result-card">
          <h2>{asOf ? `Salary as of ${asOf}` : "Current salary"}</h2>
          <pre>{JSON.stringify(salary, null, 2)}</pre>
          <button className="btn secondary compact" type="button" onClick={() => onInspectAudit({ entity: "SalaryRecord", entityId: salary.id })}>
            <History size={14} />
            View audit trail for this record
          </button>
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
              <th>Audit</th>
            </tr>
          </thead>
          <tbody>
            {history.map((record) => (
              <tr key={record.id}>
                <td>{record.effectiveFrom}</td>
                <td>{record.effectiveTo || <span className="flag blue">open</span>}</td>
                <td>{record.source}</td>
                <td className="num">{record.netBaseSalary}</td>
                <td>
                  <button className="btn secondary compact" type="button" onClick={() => onInspectAudit({ entity: "SalaryRecord", entityId: record.id })}>
                    Trail
                  </button>
                </td>
              </tr>
            ))}
            {history.length === 0 && <EmptyTable colSpan={5} label="No salary history loaded." />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditView({ config, target, onTarget }: { config: PmsClientConfig; target: AuditTarget; onTarget: (target: AuditTarget) => void }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PagedResponse<AuditRecord> | null>(null);
  const [error, setError] = useState("");

  async function loadAudit(nextPage = 0) {
    setError("");
    try {
      const response = await pmsClient.getAuditRecords(target.entity, target.entityId, config, nextPage);
      setResult(response);
      setPage(nextPage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load audit records.");
    }
  }

  useEffect(() => {
    if (target.entityId) {
      void loadAudit(0);
    }
  }, [target.entity, target.entityId]);

  return (
    <div className="panel">
      <div className="section-head">
        <div>
          <h2>Audit trail</h2>
          <p>
            Every salary creation, decryption and denied access lands here with its actor. Amounts are deliberately never exposed through this endpoint —
            denied salary reads appear under the zero UUID.
          </p>
        </div>
      </div>
      <div className="inline-form">
        <label>
          Entity
          <input value={target.entity} onChange={(event) => onTarget({ ...target, entity: event.target.value })} />
        </label>
        <label>
          Entity ID (UUID)
          <input value={target.entityId} onChange={(event) => onTarget({ ...target, entityId: event.target.value })} placeholder="salary record id" />
        </label>
        <button className="btn primary inline-action" type="button" onClick={() => loadAudit(0)} disabled={!target.entity || !target.entityId}>
          Load audit
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Status</th>
              <th>Field</th>
              <th>Author</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {(result?.content || []).map((record) => (
              <tr key={record.id}>
                <td>
                  <span className="badge blue">{record.action}</span>
                </td>
                <td>
                  <span className={record.status === "SUCCESS" ? "flag blue" : "flag red"}>{record.status}</span>
                </td>
                <td>{record.field}</td>
                <td>{record.author}</td>
                <td>{record.createdAt}</td>
              </tr>
            ))}
            {(!result || result.content.length === 0) && <EmptyTable colSpan={5} label={result ? "No audit records for this entity." : "No audit query has run."} />}
          </tbody>
        </table>
      </div>
      {result && result.totalPages > 1 && (
        <div className="button-row" style={{ marginTop: 12 }}>
          <button className="btn secondary compact" type="button" onClick={() => loadAudit(page - 1)} disabled={result.first}>
            Previous
          </button>
          <span className="muted">
            Page {result.page + 1} of {result.totalPages} · {result.totalElements} events
          </span>
          <button className="btn secondary compact" type="button" onClick={() => loadAudit(page + 1)} disabled={result.last}>
            Next
          </button>
        </div>
      )}
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
      <td className="empty-table" colSpan={colSpan}>
        {label}
      </td>
    </tr>
  );
}

export default App;
