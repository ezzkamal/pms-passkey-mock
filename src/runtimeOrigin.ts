const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const DISABLE_CANONICAL_REDIRECT = import.meta.env.VITE_DISABLE_CANONICAL_REDIRECT === "true";

export function getDefaultCanonicalAppOrigin(currentOrigin?: string, currentHostname?: string) {
  const configuredOrigin = import.meta.env.VITE_APP_ORIGIN?.trim();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (currentOrigin && currentHostname && !LOCAL_HOSTS.has(currentHostname)) {
    return currentOrigin;
  }

  return "http://localhost:3000";
}

export const canonicalAppOrigin = getDefaultCanonicalAppOrigin(
  typeof window === "undefined" ? undefined : window.location.origin,
  typeof window === "undefined" ? undefined : window.location.hostname,
);

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
