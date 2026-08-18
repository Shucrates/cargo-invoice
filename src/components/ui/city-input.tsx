'use client';

import { useMemo, useRef, useState } from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { INDIAN_CITIES } from '@/lib/indianCities';

export interface CityInputProps extends Omit<InputProps, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Extra known city names (e.g. already used in quotation sheets) shown
   *  ahead of the static master list. */
  extraCities?: string[];
}

const MAX_SUGGESTIONS = 8;

/** Text input with a fast, local prefix-match dropdown of Indian city names.
 *  No network fetch — filtering a few hundred strings is effectively instant. */
export function CityInput({ value, onChange, extraCities, className = '', ...inputProps }: CityInputProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cityPool = useMemo(() => {
    const seen = new Set<string>();
    const pool: string[] = [];
    for (const city of [...(extraCities || []), ...INDIAN_CITIES]) {
      const trimmed = city.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());
      pool.push(trimmed);
    }
    return pool;
  }, [extraCities]);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    return cityPool.filter((c) => c.toLowerCase().startsWith(query)).slice(0, MAX_SUGGESTIONS);
  }, [value, cityPool]);

  const showDropdown = open && matches.length > 0;

  const selectCity = (city: string) => {
    onChange(city);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Input
        {...inputProps}
        value={value}
        autoComplete="off"
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={(e) => {
          setOpen(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          // Delay so a click on a suggestion registers before the list unmounts.
          blurTimeout.current = setTimeout(() => setOpen(false), 120);
          inputProps.onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (showDropdown) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, matches.length - 1));
              return;
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
              return;
            } else if (e.key === 'Enter' && matches[highlight]) {
              // Consume Enter here so it only picks the suggestion, rather
              // than also submitting whatever form the input lives in.
              e.preventDefault();
              selectCity(matches[highlight]);
              return;
            } else if (e.key === 'Escape') {
              setOpen(false);
              return;
            }
          }
          inputProps.onKeyDown?.(e);
        }}
      />
      {showDropdown && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((city, idx) => (
            <li key={city}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // Prevent the input's blur from closing the list before click registers.
                  e.preventDefault();
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  selectCity(city);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
                  idx === highlight ? 'bg-[#2563EB]/10 text-[#2563EB] font-medium' : 'text-slate-700'
                }`}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
