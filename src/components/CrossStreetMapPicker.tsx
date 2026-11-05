/// <reference types="google.maps" />
// Source: Google Maps Platform Code Assist
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  Pin,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin, X } from 'lucide-react';

const GMP_API_KEY: string =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

export interface CrossStreetMapPickerProps {
  value: string;
  lat: number | null;
  lng: number | null;
  onChange: (next: {
    locationText: string;
    lat: number | null;
    lng: number | null;
  }) => void;
}

function dispatchQuotaIfNeeded(err: unknown) {
  const msg = String(err instanceof Error ? err.message : err);
  if (
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('429') ||
    msg.includes('QuotaExceededError') ||
    msg.includes('OverQuotaMapError')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

function CrossStreetAutocompleteInner({
  value,
  lat,
  lng,
  onChange,
}: CrossStreetMapPickerProps) {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const fetchPredictions = useCallback(
    (queryText: string) => {
      if (!placesLib) return;
      const trimmed = queryText.trim();
      if (trimmed.length < 2) {
        setSuggestions([]);
        return;
      }

      const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new AutocompleteSessionToken();
      }

      const request: google.maps.places.AutocompleteRequest = {
        input: trimmed,
        sessionToken: sessionTokenRef.current,
      };

      AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
        .then(
          (res: {
            suggestions: google.maps.places.AutocompleteSuggestion[];
          }) => {
            setSuggestions(res?.suggestions || []);
          }
        )
        .catch((err: unknown) => {
          dispatchQuotaIfNeeded(err);
          setSuggestions([]);
        });
    },
    [placesLib]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextText = e.target.value;
    onChange({
      locationText: nextText,
      lat: nextText.trim() === '' ? null : lat,
      lng: nextText.trim() === '' ? null : lng,
    });
    setIsOpen(true);

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      fetchPredictions(nextText);
    }, 220);
  };

  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!placesLib || !suggestion.placePrediction) return;
    const labelText = suggestion.placePrediction.text?.text || value;
    setIsOpen(false);
    setSuggestions([]);

    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      const loc = place.location;
      const nextLat = loc ? loc.lat() : null;
      const nextLng = loc ? loc.lng() : null;
      onChange({
        locationText: labelText,
        lat: nextLat,
        lng: nextLng,
      });
    } catch (err: unknown) {
      dispatchQuotaIfNeeded(err);
      onChange({
        locationText: labelText,
        lat: null,
        lng: null,
      });
    } finally {
      // Reset session token after Place.fetchFields completes
      sessionTokenRef.current = null;
    }
  };

  const hasCoords =
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng);

  const mapsSearchUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : value.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          value.trim()
        )}`
      : '';

  return (
    <div className="space-y-2 text-left relative" data-no-swipe="true">
      <div className="relative flex items-center">
        <MapPin className="w-3.5 h-3.5 text-red-600 absolute left-3 pointer-events-none shrink-0" />
        <input
          type="text"
          enterKeyHint="done"
          value={value}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onChange={handleInputChange}
          placeholder="Last seen near (cross-street, park, or neighborhood)"
          className="w-full pl-8 pr-7 py-1.5 text-xs font-semibold text-red-900 bg-red-50 border border-red-200 rounded-xl focus:outline-none focus:border-red-600"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setSuggestions([]);
              setIsOpen(false);
              onChange({ locationText: '', lat: null, lng: null });
            }}
            aria-label="Clear cross street"
            className="absolute right-2 p-0.5 text-red-400 hover:text-red-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="no-print absolute left-0 right-0 top-9 z-30 bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
          {suggestions.map((suggestion, index) => {
            const text = suggestion.placePrediction?.text?.text || '';
            if (!text) return null;
            return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => void handleSelectSuggestion(suggestion)}
                  className="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span className="truncate">{text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasCoords && (
        <div className="rounded-xl overflow-hidden border border-red-200 bg-slate-100">
          <div style={{ width: '100%', height: '132px' }}>
            <GoogleMap
              mapId="DEMO_MAP_ID"
              center={{ lat: lat!, lng: lng! }}
              zoom={15}
              gestureHandling="cooperative"
              disableDefaultUI={true}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <AdvancedMarker position={{ lat: lat!, lng: lng! }}>
                <Pin
                  background="#dc2626"
                  borderColor="#991b1b"
                  glyphColor="#ffffff"
                />
              </AdvancedMarker>
            </GoogleMap>
          </div>
          {mapsSearchUrl && (
            <div className="px-2.5 py-1.5 bg-red-50/90 border-t border-red-200 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-red-900 truncate">
                {value}
              </span>
              <a
                href={mapsSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="no-print text-[11px] font-semibold text-red-700 hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <span>Open Map</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}

      {!hasCoords && value.trim() && mapsSearchUrl && (
        <div className="flex justify-center">
          <a
            href={mapsSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="no-print text-[11px] font-semibold text-red-700 hover:underline inline-flex items-center gap-1"
          >
            <MapPin className="w-3 h-3" />
            <span>View &ldquo;{value.trim()}&rdquo; on Google Maps</span>
          </a>
        </div>
      )}
    </div>
  );
}

export function CrossStreetMapPicker(props: CrossStreetMapPickerProps) {
  if (!GMP_API_KEY) {
    const mapsSearchUrl = props.value.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          props.value.trim()
        )}`
      : '';
    return (
      <div className="space-y-1.5">
        <input
          type="text"
          enterKeyHint="done"
          value={props.value}
          onChange={(e) =>
            props.onChange({
              locationText: e.target.value,
              lat: props.lat,
              lng: props.lng,
            })
          }
          placeholder="Last seen near (cross-street, park, or neighborhood)"
          className="w-full px-3 py-1.5 text-center text-xs font-semibold text-red-900 bg-red-50 border border-red-200 rounded-xl focus:outline-none focus:border-red-600"
        />
        {mapsSearchUrl && (
          <div className="flex justify-center">
            <a
              href={mapsSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="no-print text-[11px] font-semibold text-red-700 hover:underline inline-flex items-center gap-1"
            >
              <MapPin className="w-3 h-3" />
              <span>View on Google Maps</span>
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <APIProvider apiKey={GMP_API_KEY} language="en" region="US">
      <CrossStreetAutocompleteInner {...props} />
    </APIProvider>
  );
}
