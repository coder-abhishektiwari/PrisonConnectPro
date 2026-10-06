/**
 * Shimmer placeholders for content that is actually on its way from the API.
 * Static chrome - headings, labels, buttons, filters - must stay rendered;
 * only numbers, rows and cards that come from a request get one of these.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-200 ${className}`} />;
}

/** Shimmer rows dropped inside a table's existing <tbody>, keeping real headers. */
export function SkeletonRows({ rows = 6, cols = 6, widths }: { rows?: number; cols?: number; widths?: string[] }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-neutral-100">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="py-3 px-4">
              <div
                className="h-3.5 animate-pulse rounded bg-neutral-200"
                style={{ width: widths?.[c] || `${45 + ((r * 7 + c * 13) % 45)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Shimmer lines for a list (kiosk admins, contacts, statements). */
export function SkeletonList({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`divide-y divide-neutral-100 ${className}`}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-4 py-3">
          <div className="h-4 w-4 animate-pulse rounded-full bg-neutral-200" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-neutral-200" style={{ maxWidth: `${55 + ((r * 11) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Shimmer cards for grid layouts (live call cards, stat cards). */
export function SkeletonCards({ count = 6, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 p-5 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-neutral-200 rounded-2xl p-4 space-y-3">
          <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-200" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 animate-pulse rounded-xl bg-neutral-200" />
            <div className="h-16 animate-pulse rounded-xl bg-neutral-200" />
          </div>
          <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
        </div>
      ))}
    </div>
  );
}

/** Inline shimmer for a single value (a count that is still loading). */
export function SkeletonText({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-3.5 w-10 animate-pulse rounded bg-neutral-200 align-middle ${className}`} />;
}
