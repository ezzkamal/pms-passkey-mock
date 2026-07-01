import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCanonicalRedirectUrl } from "./runtimeOrigin";
import "./styles.css";

const redirectUrl = getCanonicalRedirectUrl(window.location.href);

if (redirectUrl) {
  window.location.replace(redirectUrl);
} else {
  const { default: App } = await import("./App");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
