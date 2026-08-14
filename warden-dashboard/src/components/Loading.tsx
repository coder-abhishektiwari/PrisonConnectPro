/**
 * Reusable loading indicator.
 */
export function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
    </div>
  );
}