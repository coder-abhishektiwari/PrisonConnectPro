import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ColumnFilter { value: string; open: boolean; }

export function FilterDropdown({ label, options, filter, setFilter }: {
  label: string; options: { value: string; label: string }[];
  filter: ColumnFilter; setFilter: (f: ColumnFilter) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = Math.min(options.length * 40 + 44, 300);
    const openAbove = spaceBelow < dropdownHeight + 8;
    setPos({
      top: openAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 180)),
    });
  }, [options.length]);

  useEffect(() => {
    if (filter.open) {
      updatePos();
      window.addEventListener('scroll', updatePos, true);
      window.addEventListener('resize', updatePos);
    }
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [filter.open, updatePos]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current && !triggerRef.current.contains(target)) {
        const dropdown = document.getElementById(`filter-dropdown-${label}`);
        if (dropdown && !dropdown.contains(target)) {
          setFilter({ ...filter, open: false });
        }
      }
    };
    if (filter.open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [filter.open, setFilter, label]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setFilter({ ...filter, open: !filter.open })}
        className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider hover:text-primary-600 transition-colors ${filter.value !== 'all' ? 'text-primary-600' : 'text-neutral-500'}`}
      >
        {label}
        {filter.value !== 'all' && <span className="w-4 h-4 bg-primary-600 text-white rounded-full text-[9px] flex items-center justify-center">1</span>}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {filter.open && createPortal(
        <div
          id={`filter-dropdown-${label}`}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-white border border-neutral-200 rounded-xl shadow-2xl min-w-[140px] w-max py-1 max-h-[300px] overflow-y-auto"
        >
          <button onClick={() => setFilter({ value: 'all', open: false })} className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ${filter.value === 'all' ? 'font-bold text-primary-600' : 'text-neutral-700'}`}>All {label}</button>
          {options.map((o) => (
            <button key={o.value} onClick={() => setFilter({ value: o.value, open: false })} className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ${filter.value === o.value ? 'font-bold text-primary-600' : 'text-neutral-700'}`}>{o.label}</button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
