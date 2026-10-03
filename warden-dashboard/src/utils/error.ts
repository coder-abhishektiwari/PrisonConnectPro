/**
 * apiClient's response interceptor rejects with a plain ApiError { message, status },
 * so `e.response` is usually undefined. Backend errors however live at
 * response.data.error.message (raw axios shape). Read both so callers surface
 * the real server message instead of a generic fallback.
 */
export function errorMessage(e: unknown, fallback: string): string {
  const err = e as {
    message?: string;
    response?: { data?: { error?: { message?: string }; message?: string } };
  } | null | undefined;
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}
