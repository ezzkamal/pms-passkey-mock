const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const DISABLE_CANONICAL_REDIRECT = import.meta.env.VITE_DISABLE_CANONICAL_REDIRECT === "true";

export const canonicalAppOrigin = import.meta.env.VITE_APP_ORIGIN || "http://localhost:3000";

export function getCanonicalRedirectUrl(currentHref: string, canonicalOrigin = canonicalAppOrigin) {
  if (DISABLE_CANONICAL_REDIRECT) {
    return null;
  }

  const current = new URL(currentHref);
  const canonical = new URL(canonicalOrigin);

  if (current.origin === canonical.origin) {
    return null;
  }

  if (!LOCAL_HOSTS.has(current.hostname) && current.hostname !== canonical.hostname) {
    return null;
  }

  return `${canonical.origin}${current.pathname}${current.search}${current.hash}`;
}
