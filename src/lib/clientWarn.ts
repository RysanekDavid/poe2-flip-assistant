/**
 * `.catch(warnOnFailure("[topbar] unread alerts"))` for background polls whose failure should not
 * interrupt the dashboard but must still be diagnosable: the old `.catch(() => {})` made a dead
 * route indistinguishable from "no data".
 */
export function warnOnFailure(context: string): (error: unknown) => void {
  return (error: unknown) => {
    console.warn(`${context} failed:`, error instanceof Error ? error.message : error);
  };
}

/** A caught value as display text, for panels that show their own load error. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Throw on a non-2xx response so an error page is reported as an error, not parsed as data. */
export function assertOk(response: Response, what: string): Response {
  if (!response.ok) throw new Error(`${what} → HTTP ${response.status}`);
  return response;
}
