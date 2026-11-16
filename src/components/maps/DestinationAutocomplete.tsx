import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useMapsLibrary} from '@vis.gl/react-google-maps';
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

function checkQuotaError(err: unknown) {
  const msg = String(err instanceof Error ? err.message : err);
  if (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('429')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

export function DestinationAutocomplete({
  value,
  onSelect,
  placeholder = 'Search destination (e.g. Home, Bus Stand, Campus)',
  biasCenter,
}: DestinationAutocompleteProps) {
  const placesLib = useMapsLibrary('places');
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
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
    if (!placesLib || trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const {AutocompleteSessionToken, AutocompleteSuggestion} = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        setIsLoading(true);
        const request: google.maps.places.AutocompleteRequest = {
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          ...(biasCenter
            ? {
                locationBias: {
                  center: biasCenter,
                  radius: 25000,
                },
              }
            : {}),
        };

        const response =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        setSuggestions(response?.suggestions ?? []);
        setIsOpen(true);
      } catch (err) {
        checkQuotaError(err);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [placesLib, inputValue, biasCenter]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
        });

        const loc = place.location;
        if (!loc) return;

        const name =
          place.displayName ||
          suggestion.placePrediction.mainText?.text ||
          suggestion.placePrediction.text.text;
        const address =
          place.formattedAddress || suggestion.placePrediction.text.text;

        skipNextFetchRef.current = true;
        setInputValue(name);
        setSuggestions([]);
        setIsOpen(false);
        sessionTokenRef.current = null;

        onSelect({
          name,
          address,
          location: {lat: loc.lat(), lng: loc.lng()},
        });
      } catch (err) {
        checkQuotaError(err);
      }
    },
    [placesLib, onSelect]
  );

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
            className="absolute right-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-400 hover:text-stone-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && (isLoading || suggestions.length > 0) && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-stone-200 rounded-xl shadow-lg z-40 max-h-64 overflow-y-auto divide-y divide-stone-100">
          {isLoading && suggestions.length === 0 ? (
            <div className="px-4 py-3 text-xs text-stone-500">
              Searching places...
            </div>
          ) : (
            suggestions.map((item, idx) => {
              const primary =
                item.placePrediction?.mainText?.text ||
                item.placePrediction?.text.text ||
                'Selected place';
              const secondary =
                item.placePrediction?.secondaryText?.text || '';
              return (
                <button
                  key={`${primary}-${idx}`}
                  type="button"
                  onClick={() => void handleSelectSuggestion(item)}
                  className="w-full text-left px-3.5 py-3 min-h-[44px] hover:bg-stone-50 active:bg-stone-100 flex items-start gap-2.5 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-900 truncate">
                      {primary}
                    </div>
                    {secondary && (
                      <div className="text-xs text-stone-500 truncate">
                        {secondary}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
