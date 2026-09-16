import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface SearchableSelectOption {
  id: string;
  name: string;
}

interface SearchableSelectProps {
  value: string;
  options: (string | SearchableSelectOption)[];
  onChange: (val: string) => void;
  onAdd?: (val: string) => void;
  placeholder?: string;
  addLabel?: string;
}

function isObjOpt(o: string | SearchableSelectOption): o is SearchableSelectOption {
  return typeof o === 'object' && o !== null && 'id' in o;
}

function getOptId(o: string | SearchableSelectOption): string {
  return isObjOpt(o) ? o.id : o;
}

function getOptName(o: string | SearchableSelectOption): string {
  return isObjOpt(o) ? o.name : o;
}

export function SearchableSelect({ value, options, onChange, onAdd, placeholder = 'Select...', addLabel }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(o => getOptName(o).toLowerCase().includes(query.toLowerCase()));
  const showAdd = onAdd && !adding && query.trim() && !options.some(o => getOptName(o).toLowerCase() === query.trim().toLowerCase());

  const updatePosition = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    }
  }, []);

  useEffect(() => { if (open) updatePosition(); }, [open, updatePosition]);

  useEffect(() => {
    if (!open) { setQuery(''); setAdding(false); setAddValue(''); }
  }, [open]);

  useEffect(() => {
    if (adding && addInputRef.current) addInputRef.current.focus();
  }, [adding]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAdd = useCallback(() => {
    const name = addValue.trim();
    if (!name || !onAdd) return;
    onAdd(name);
    setOpen(false);
    setAdding(false);
    setAddValue('');
  }, [addValue, onAdd]);

  // Find the display name for the current value
  const currentOption = options.find(o => getOptId(o) === value);
  const displayValue = currentOption ? getOptName(currentOption) : value;

  const dropdown = open ? createPortal(
    <div
      className="bg-white border border-neutral-200 rounded-lg shadow-xl max-h-60 overflow-auto"
      style={{ position: 'absolute', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
    >
      <div className="p-2 border-b border-neutral-100 sticky top-0 bg-white">
        <input
          ref={inputRef}
          type="text"
          value={adding ? addValue : query}
          onChange={e => { if (adding) setAddValue(e.target.value); else setQuery(e.target.value); }}
          onKeyDown={e => { if (adding && e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setOpen(false); }}
          placeholder={adding ? (addLabel || 'Type name...') : 'Search...'}
          className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      {adding ? (
        <div className="p-2">
          <button onClick={handleAdd} className="w-full px-3 py-2 bg-success text-white rounded-lg text-sm hover:bg-success-700 transition">
            + Add "{addValue.trim()}"
          </button>
        </div>
      ) : (
        <div className="py-1">
          {filtered.length === 0 && !showAdd && (
            <p className="px-4 py-2 text-sm text-neutral-400">No options found</p>
          )}
          {filtered.map(opt => {
            const id = getOptId(opt);
            const name = getOptName(opt);
            return (
              <button
                key={id}
                type="button"
                onClick={() => { onChange(id); setOpen(false); }}
                className={`w-full px-4 py-2 text-sm text-left hover:bg-neutral-50 transition ${id === value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-neutral-700'}`}
              >
                {name}
              </button>
            );
          })}
          {showAdd && (
            <button
              type="button"
              onClick={() => { setAdding(true); setAddValue(query.trim()); }}
              className="w-full px-4 py-2 text-sm text-left text-success hover:bg-success/5 font-medium flex items-center gap-2 border-t border-neutral-100 mt-1"
            >
              <span className="material-icons text-base">add</span> {addLabel || `Add "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-left flex items-center justify-between hover:border-neutral-400 transition"
      >
        <span className={value ? 'text-neutral-900' : 'text-neutral-400'}>{displayValue || placeholder}</span>
        <span className="material-icons text-neutral-400 text-base">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {dropdown}
    </div>
  );
}
