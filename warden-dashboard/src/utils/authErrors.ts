/**
 * Distinguish a definitive auth rejection from a transient failure.
 *
 * Only a 4xx answer from the auth server means the session is actually dead
 * (revoked/expired refresh token, bad credentials, expired access token).
 * Network drops and 5xx answers say nothing about the session — clearing
 * tokens on those was logging users out whenever Render was cold-starting.
 */
export function isDefinitiveAuthRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { response?: { status?: unknown }; status?: unknown };
  const status = e.response?.status ?? e.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * HTTP status of an API/axios error when one is available.
 */
export function authErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as { response?: { status?: unknown }; status?: unknown };
  const status = e.response?.status ?? e.status;
  return typeof status === 'number' ? status : undefined;
}
