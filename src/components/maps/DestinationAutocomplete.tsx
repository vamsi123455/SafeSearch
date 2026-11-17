import React, {useEffect, useRef, useState} from 'react';
import {MapPin, Search, X} from 'lucide-react';
import {LatLngPoint} from '../../types/safereach';

export interface SelectedPlaceResult {
  name: string;
  address: string;
  location: LatLngPoint;
}

interface DestinationAutocompleteProps {
  value: string;
  onSelect: (place: SelectedPlaceResult) => void;
  placeholder?: string;
  biasCenter?: LatLngPoint;
}

export function DestinationAutocomplete({
  value,
  onSelect,
  placeholder = 'Search destination (e.g. Home, Bus Stand, Campus)',
  biasCenter,
}: DestinationAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<SelectedPlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    const trimmed = inputValue.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams({q: trimmed});
        if (biasCenter) {
          params.set('lat', String(biasCenter.lat));
          params.set('lng', String(biasCenter.lng));
        }
        const res = await fetch(
          `/api/places/autocomplete?${params.toString()}`,
          {signal: controller.signal}
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as {results?: SelectedPlaceResult[]};
        setSuggestions(Array.isArray(data.results) ? data.results : []);
        setIsOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [inputValue, biasCenter?.lat, biasCenter?.lng]);

  const handleSelectSuggestion = (place: SelectedPlaceResult) => {
    skipNextFetchRef.current = true;
    setInputValue(place.name);
    setSuggestions([]);
    setIsOpen(false);
    onSelect(place);
  };

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 pointer-events-none" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          aria-label="Search destination"
          className="w-full min-h-[44px] pl-10 pr-10 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700 transition-colors"
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              setSuggestions([]);
              setIsOpen(false);
            }}
            aria-label="Clear destination search"
            className="absolute right-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && (isLoading || suggestions.length > 0) && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-stone-200 rounded-xl shadow-lg z-[500] max-h-64 overflow-y-auto divide-y divide-stone-100">
          {isLoading && suggestions.length === 0 ? (
            <div className="px-4 py-3 text-xs text-stone-500">
              Searching places...
            </div>
          ) : (
            suggestions.map((item, idx) => (
              <button
                key={`${item.name}-${idx}`}
                type="button"
                onClick={() => handleSelectSuggestion(item)}
                className="w-full text-left px-3.5 py-3 min-h-[44px] hover:bg-stone-50 active:bg-stone-100 flex items-start gap-2.5 transition-colors cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-900 truncate">
                    {item.name}
                  </div>
                  {item.address && item.address !== item.name && (
                    <div className="text-xs text-stone-500 truncate">
                      {item.address}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
