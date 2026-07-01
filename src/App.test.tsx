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

vi.mock("./api/authClient", () => ({
  authClient: {
    useSession: () => ({ data: authState.session, isPending: authState.isPending }),
  },
  fetchPmsAccessToken: authState.fetchPmsAccessToken,
  signInWithKeycloak: authState.signInWithKeycloak,
  signOutOfBetterAuth: authState.signOutOfBetterAuth,
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
    expect(screen.getByRole("button", { name: "Payroll Runs" })).toBeDisabled();
    await waitFor(() => expect(authState.signInWithKeycloak).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Sign in with Keycloak" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gets the PMS token from Better Auth and checks passkey registration through the real endpoint", async () => {
    const user = userEvent.setup();
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ registered: true }), { status: 200 }));
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

  it("shows real PMS errors without fixture fallback", async () => {
    const user = userEvent.setup();
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));

    render(<App />);
    await waitFor(() => expect(screen.getByText("PMS token")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Check status" }));

    expect(await screen.findByText("GET /passkeys failed with 401: Unauthorized")).toBeInTheDocument();
  });

  it("blocks PMS workflow controls when Better Auth cannot provide a PMS token", async () => {
    authState.session = { user: { email: "admin@imedia24.test" }, session: { id: "session-1" } };
    authState.fetchPmsAccessToken.mockRejectedValue(new Error("The PMS token route returned HTML instead of JSON."));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "PMS Token Required" })).toBeInTheDocument();
    expect(screen.getByText("The PMS token route returned HTML instead of JSON.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Payroll Runs" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Check status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register passkey" })).not.toBeInTheDocument();
  });
});
