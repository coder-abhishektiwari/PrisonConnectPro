import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

const PIN_ICON = `<svg width="26" height="36" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.37 18.63 0 12 0z" fill="#4F46E5"/><circle cx="12" cy="12" r="4.6" fill="#fff"/></svg>`;

interface LocationMapModalProps {
  location: LocationPoint;
  onClose: () => void;
}

/**
 * In-app map (Leaflet + OpenStreetMap tiles — no API key, works inside the
 * Electron shell where external Google Maps tabs are blocked).
 */
export function LocationMapModal({ location, onClose }: LocationMapModalProps) {
  const mapEl = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const label = locationLabel(location) ?? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;

  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;

    const map = L.map(el, { scrollWheelZoom: true }).setView([location.lat, location.lng], 15);
    // OSM volunteer tiles block app traffic (403), Carto needs a key now —
    // Esri World Street Map is keyless and app-friendly (attribution required).
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, OpenStreetMap contributors',
    }).addTo(map);
    L.marker([location.lat, location.lng], {
      icon: L.divIcon({
        className: '',
        iconSize: [26, 36],
        iconAnchor: [13, 34],
        html: PIN_ICON,
      }),
    }).addTo(map);

    // The modal may mount mid-paint; ask Leaflet to measure after layout settles.
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 120);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('keydown', onKey);
      map.remove();
    };
  }, [location.lat, location.lng]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Map of ${label}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2 text-neutral-900">
            <span className="material-icons text-primary-600">location_on</span>
            <span className="truncate text-[15px] font-semibold">{label}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
          >
            <span className="material-icons text-[18px]">close</span>
          </button>
        </div>

        <div ref={mapEl} className="h-80 w-full bg-neutral-100" />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3.5">
          <span className="text-[13px] text-neutral-500">
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </span>
          <div className="flex items-center gap-2">
            <a
              href={mapsHref(location)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/20"
            >
              <span className="material-icons text-[15px]">open_in_new</span>
              Open in Google Maps
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-[13px] font-semibold text-neutral-900 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
