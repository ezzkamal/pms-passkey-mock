import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const authState = vi.hoisted(() => ({
  session: null as null | { user: { email: string }; session: { id: string } },
  isPending: false,
  fetchPmsAccessToken: vi.fn(),
  signInWithKeycloak: vi.fn(),
  signOutOfBetterAuth: vi.fn(),
}));

const webauthnState = vi.hoisted(() => ({
  createPasskeyCredential: vi.fn(),
  getPasskeyCredential: vi.fn(),
}));

vi.mock("./api/authClient", () => ({
  authClient: {
    useSession: () => ({ data: authState.session, isPending: authState.isPending }),
  },
  fetchPmsAccessToken: authState.fetchPmsAccessToken,
  signInWithKeycloak: authState.signInWithKeycloak,
  signOutOfBetterAuth: authState.signOutOfBetterAuth,
}));

vi.mock("./api/webauthn", () => ({
  createPasskeyCredential: webauthnState.createPasskeyCredential,
  getPasskeyCredential: webauthnState.getPasskeyCredential,
}));

beforeEach(() => {
  authState.session = null;
  authState.isPending = false;
  authState.fetchPmsAccessToken.mockReset();
  authState.fetchPmsAccessToken.mockResolvedValue({ accessToken: "admin-token" });
  authState.signInWithKeycloak.mockReset();
  authState.signInWithKeycloak.mockResolvedValue(undefined);
  authState.signOutOfBetterAuth.mockReset();
  authState.signOutOfBetterAuth.mockResolvedValue(undefined);
  webauthnState.createPasskeyCredential.mockReset();
  webauthnState.createPasskeyCredential.mockResolvedValue('{"id":"credential-1"}');
  webauthnState.getPasskeyCredential.mockReset();
  webauthnState.getPasskeyCredential.mockResolvedValue('{"id":"credential-1"}');
});

afterEach(() => {
  window.localStorage?.clear();
  vi.unstubAllGlobals();
});

describe("PMS real API app", () => {
  it("starts the Keycloak login flow before enabling PMS sections", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Redirecting to Keycloak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salaries" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Payroll Runs" })).toBeDisabled();
    await waitFor(() => expect(authState.signInWithKeycloak).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Sign in with Keycloak" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gets the PMS token from Better Auth and checks passkey registration through the real endpoint", async () => {
    const user = userEvent.setup();
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ registered: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ credentialId: "credential-1", email: "admin@imedia24.test", approved: true }]), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("PMS token")).toBeInTheDocument());
    expect(authState.fetchPmsAccessToken).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Passkeys" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check status" }));

    await waitFor(() => expect(screen.getByText("Registered")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8086/api/passkeys",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
      }),
    );
  });

  it("sends the key grant header when the salaries section opens with a selected employee", async () => {
    const user = userEvent.setup();
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    window.localStorage.setItem(
      "pms-mock-api-config",
      JSON.stringify({ keyGrantToken: "grant-token", keyGrantExpiresAt: new Date(Date.now() + 600_000).toISOString() }),
    );
    window.localStorage.setItem("pms-mock-salary-employee-external-id", "emp-001");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("PMS token")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salaries" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8086/api/salaries/emp-001/history",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({ "X-Key-Grant-Token": "grant-token" }),
        }),
      ),
    );
    expect(await screen.findByText(/Network marker sent/)).toBeInTheDocument();
  });

  it("creates a salary record and refreshes history", async () => {
    const user = userEvent.setup();
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    window.localStorage.setItem(
      "pms-mock-api-config",
      JSON.stringify({ keyGrantToken: "grant-token", keyGrantExpiresAt: new Date(Date.now() + 600_000).toISOString() }),
    );
    const createdSalary = {
      id: "salary-1",
      employeeExternalId: "emp-001",
      netBaseSalary: 82000,
      effectiveFrom: "2026-07-02",
      effectiveTo: null,
      source: "MANUAL",
      createdBy: "admin-001",
      createdAt: "2026-07-02T00:00:00Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(createdSalary), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([createdSalary]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("PMS token")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salaries" }));
    await user.type(screen.getByLabelText("Employee external ID"), "emp-001");
    await user.type(screen.getByLabelText("Net base salary"), "82000");
    await user.clear(screen.getByLabelText("Effective from"));
    await user.type(screen.getByLabelText("Effective from"), "2026-07-02");
    await user.click(screen.getByRole("button", { name: "Create salary record" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "http://localhost:8086/api/salaries",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-Key-Grant-Token": "grant-token" }),
          body: JSON.stringify({ employeeExternalId: "emp-001", netBaseSalary: 82000, effectiveFrom: "2026-07-02", source: "MANUAL" }),
        }),
      ),
    );
    expect(await screen.findByText(/"id": "salary-1"/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8086/api/salaries/emp-001/history",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "X-Key-Grant-Token": "grant-token" }),
      }),
    );
  });

  it("revokes approved key approvals through PMS", async () => {
    const user = userEvent.setup();
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    const approved = [
      {
        credentialId: "credential-1",
        email: "holder@imedia24.test",
        userExternalId: "holder-001",
        approved: true,
        approvedBy: "admin-001",
        approvedAt: "2026-07-02T00:00:00Z",
        createdAt: "2026-07-02T00:00:00Z",
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approved), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("PMS token")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Key Approvals" }));
    await user.click(await screen.findByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8086/api/key-approvals/credential-1",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
        }),
      ),
    );
  });

  it("shows real PMS errors without fixture fallback", async () => {
    const user = userEvent.setup();
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));

    render(<App />);
    await waitFor(() => expect(screen.getByText("PMS token")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Check status" }));

    expect(await screen.findByText("GET /passkeys failed with 401: Unauthorized")).toBeInTheDocument();
  });

  it("defaults passkey registration to phone mode", async () => {
    const user = userEvent.setup();
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ceremonyId: "ceremony-1", publicKey: { challenge: "AQID" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("PMS token")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Phone first" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Register passkey" }));

    await waitFor(() => expect(webauthnState.createPasskeyCredential).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8086/api/passkeys/registration/options",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mode: "phone" }),
      }),
    );
  });

  it("blocks PMS workflow controls when Better Auth cannot provide a PMS token", async () => {
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    authState.fetchPmsAccessToken.mockRejectedValue(new Error("The PMS token route returned HTML instead of JSON."));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "PMS Token Required" })).toBeInTheDocument();
    expect(screen.getByText("The PMS token route returned HTML instead of JSON.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salaries" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Check status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register passkey" })).not.toBeInTheDocument();
  });
});
