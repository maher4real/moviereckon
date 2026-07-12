const LOCAL_AUTH_URL = "http://localhost:3000";

export function getConfiguredAuthBaseURL(): string {
  const raw =
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.NODE_ENV === "production" ? "" : LOCAL_AUTH_URL);

  if (!raw) {
    throw new Error("BETTER_AUTH_URL or APP_URL must be configured in production");
  }

  const url = new URL(raw);
  const isLocalDevelopment =
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if (url.protocol !== "https:" && !isLocalDevelopment) {
    throw new Error("Authentication base URL must use HTTPS");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Authentication base URL must be an origin without credentials, path, query, or fragment");
  }

  return url.origin;
}
