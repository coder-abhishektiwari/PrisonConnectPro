interface LoadingProps {
  message?: string;
}

/**
 * Full-page loading state.
 */
export function Loading({ message = 'Loading...' }: LoadingProps) {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <div className="text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-primary-600 mx-auto mb-4" />
        <p className="text-neutral-600">{message}</p>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Full-page error state with optional retry.
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4" role="alert">
      <div className="text-center max-w-md">
        <div className="text-error text-5xl mb-4">⚠</div>
        <h2 className="text-xl font-semibold text-neutral-900 mb-2">Something went wrong</h2>
        <p className="text-neutral-600 mb-6">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}

interface EmptyProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * Full-page empty state.
 */
export function Empty({ title, description, action }: EmptyProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-neutral-400 text-5xl mb-4">📭</div>
        <h2 className="text-xl font-semibold text-neutral-900 mb-2">{title}</h2>
        {description && <p className="text-neutral-600 mb-6">{description}</p>}
        {action}
      </div>
    </div>
  );
}