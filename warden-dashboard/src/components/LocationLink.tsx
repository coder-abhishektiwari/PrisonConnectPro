import { useState } from 'react';
import type { LocationPoint } from '@/services/api/wardenApi';
import { LocationMapModal } from './LocationMapModal';

export { locationLabel, mapsHref } from './LocationMapModal';
import { locationLabel } from './LocationMapModal';

/**
 * Icon + "Area, City, State" as one clickable row; clicking opens the map
 * right inside the app (works in the desktop shell too, where external
 * Google Maps tabs are blocked).
 */
export function LocationLink({ location, className = '' }: { location?: LocationPoint | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const label = locationLabel(location);
  if (!location || !label) return <span className={`text-neutral-400 ${className}`}>Location not shared</span>;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`Show on map (${location.lat}, ${location.lng})`}
        className={`inline-flex items-center gap-1 text-left hover:underline ${className}`}
      >
        <span className="material-icons text-15 leading-none">location_on</span>
        <span>{label}</span>
      </button>

      {open && <LocationMapModal location={location} onClose={() => setOpen(false)} />}
    </>
  );
}
