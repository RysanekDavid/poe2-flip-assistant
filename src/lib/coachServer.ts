import { createHmac } from "node:crypto";

const DEV_THREAD_SECRET = "poe2-coach-local-development-only";
const THREAD_NAMESPACE = "responses-v2";

/** Convert a browser conversation id into a user-scoped UUID accepted by LangGraph. */
export function deriveCoachThreadId(
  userId: number,
  conversationId: string,
  configuredSecret: string,
): string {
  const secret = configuredSecret || developmentSecret();
  const bytes = createHmac("sha256", secret)
    .update(`${THREAD_NAMESPACE}:${userId}:${conversationId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Build an HTTP(S)-only endpoint from trusted server configuration. */
export function coachEndpoint(apiUrl: string, path: string): string {
  const base = apiUrl.trim().replace(/\/+$/, "");
  const endpoint = new URL(`${base}/${path.replace(/^\/+/, "")}`);
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error("COACH_API_URL must be an HTTP(S) origin without embedded credentials");
  }
  return endpoint.toString();
}

/** Preserve expected user-action statuses and hide other upstream failures behind 502. */
export function coachPublicStatus(status: number): number {
  return [400, 409, 429, 503, 504].includes(status) ? status : 502;
}

function developmentSecret(): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error("COACH_THREAD_SECRET or AUTH_SECRET is required in production");
  }
  return DEV_THREAD_SECRET;
}
