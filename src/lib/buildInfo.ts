const COMMIT_SHA = /^[0-9a-f]{7,40}$/i;

/** Return only a non-sensitive release identifier suitable for health responses. */
export function buildIdentifier(environment: NodeJS.ProcessEnv = process.env): string {
  const raw = environment.APP_COMMIT_SHA?.trim() ?? "";
  if (raw && COMMIT_SHA.test(raw)) return raw.toLowerCase().slice(0, 12);
  if (environment.NODE_ENV === "production") {
    throw new Error("APP_COMMIT_SHA is required in production");
  }
  return "development";
}
