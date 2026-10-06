import type { LocationPoint } from '@/services/api/wardenApi';

/** "Area, City, State" with empty parts dropped; falls back to raw coordinates. */
export function locationLabel(location?: LocationPoint | null): string | null {
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return null;
  const place = [location.area, location.city, location.state].filter(Boolean).join(', ');
  return place || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
}

export function mapsHref(location: LocationPoint): string {
  return `https://www.google.com/maps?q=${location.lat},${location.lng}`;
}

/**
 * Icon + "Area, City, State" as one link; clicking opens the exact lat/lng in
 * Google Maps (no API key needed for a plain q= link).
 */
export function LocationLink({ location, className = '' }: { location?: LocationPoint | null; className?: string }) {
  const label = locationLabel(location);
  if (!location || !label) return <span className={`text-neutral-400 ${className}`}>Location not shared</span>;

  return (
    <a
      href={mapsHref(location)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open in Google Maps (${location.lat}, ${location.lng})`}
      className={`inline-flex items-center gap-1 hover:underline ${className}`}
    >
      <span className="material-icons text-[15px] leading-none">location_on</span>
      <span>{label}</span>
    </a>
  );
}
