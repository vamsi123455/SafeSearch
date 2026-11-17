import React, {useEffect, useMemo, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {Crosshair, Layers} from 'lucide-react';
import {decodePolyline, haversineDistanceMeters} from '../../lib/geofence';
import {JourneyStatus, LatLngPoint} from '../../types/safereach';

type SafeReachMapType = 'hybrid' | 'satellite' | 'roadmap';

interface SafeReachMapProps {
  center: LatLngPoint;
  travelerPosition: LatLngPoint | null;
  travelerLabel: string;
  travelerStatus: JourneyStatus;
  travelerUpdatedLabel?: string;
  destinationPosition: LatLngPoint | null;
  destinationLabel?: string;
  geofenceRadiusMeters?: number;
  expectedEncodedPolyline?: string;
  actualEncodedPolyline?: string;
  allowTapToPickDestination?: boolean;
  onMapPickDestination?: (point: LatLngPoint) => void;
  focusTrigger?: number;
  followTraveler?: boolean;
  defaultMapType?: SafeReachMapType;
}

const DEFAULT_MAP_CENTER: LatLngPoint = {lat: 13.6288, lng: 79.4192};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getStatusPinPalette(status: JourneyStatus): {
  background: string;
  pulseClass: string;
} {
  switch (status) {
    case 'reached_safely':
      return {
        background: '#047857',
        pulseClass: 'bg-emerald-400',
      };
    case 'sos_alert':
      return {
        background: '#BE123C',
        pulseClass: 'bg-rose-500',
      };
    case 'route_deviation':
    case 'signal_stale':
      return {
        background: '#B45309',
        pulseClass: 'bg-amber-400',
      };
    case 'travelling':
      return {
        background: '#0F766E',
        pulseClass: 'bg-teal-400',
      };
    default:
      return {
        background: '#57534E',
        pulseClass: 'bg-stone-400',
      };
  }
}

function useSmoothPosition(
  target: LatLngPoint | null,
  durationMs = 850
): LatLngPoint | null {
  const [rendered, setRendered] = useState<LatLngPoint | null>(target);
  const currentRef = useRef<LatLngPoint | null>(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!target) {
      currentRef.current = null;
      setRendered(null);
      return;
    }

    const from = currentRef.current;
    if (
      !from ||
      (from.lat === target.lat && from.lng === target.lng) ||
      haversineDistanceMeters(from, target) > 5000
    ) {
      currentRef.current = target;
      setRendered(target);
      return;
    }

    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const next: LatLngPoint = {
        lat: from.lat + (target.lat - from.lat) * t,
        lng: from.lng + (target.lng - from.lng) * t,
      };
      currentRef.current = next;
      setRendered(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target?.lat, target?.lng, durationMs]);

  return rendered;
}

export function SafeReachMap({
  center,
  travelerPosition,
  travelerLabel,
  travelerStatus,
  travelerUpdatedLabel,
  destinationPosition,
  destinationLabel,
  geofenceRadiusMeters = 300,
  expectedEncodedPolyline = '',
  actualEncodedPolyline = '',
  allowTapToPickDestination = false,
  onMapPickDestination,
  focusTrigger = 0,
  followTraveler = true,
  defaultMapType = 'hybrid',
}: SafeReachMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  const streetLayerRef = useRef<L.TileLayer | null>(null);
  const expectedLineRef = useRef<L.Polyline | null>(null);
  const actualLineRef = useRef<L.Polyline | null>(null);
  const geofenceCircleRef = useRef<L.Circle | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const travelerMarkerRef = useRef<L.Marker | null>(null);

  const allowTapRef = useRef(allowTapToPickDestination);
  const onPickRef = useRef(onMapPickDestination);
  allowTapRef.current = allowTapToPickDestination;
  onPickRef.current = onMapPickDestination;

  const [mapType, setMapType] = useState<SafeReachMapType>(defaultMapType);
  const [isFollowing, setIsFollowing] = useState(followTraveler);
  const [internalFocusTrigger, setInternalFocusTrigger] = useState(0);

  useEffect(() => {
    setIsFollowing(followTraveler);
  }, [followTraveler, focusTrigger]);

  const smoothTravelerPosition = useSmoothPosition(travelerPosition, 850);

  const expectedPath = useMemo(
    () => decodePolyline(expectedEncodedPolyline),
    [expectedEncodedPolyline]
  );
  const actualPath = useMemo(
    () => decodePolyline(actualEncodedPolyline),
    [actualEncodedPolyline]
  );

  // Initialize Leaflet map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const initialCenter = center || DEFAULT_MAP_CENTER;
    const map = L.map(el, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: 16,
      zoomControl: true,
      attributionControl: true,
    });

    const satLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Imagery &copy; Esri',
      }
    );

    const labelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        opacity: 0.9,
      }
    );

    const streetLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }
    );

    satLayerRef.current = satLayer;
    labelsLayerRef.current = labelsLayer;
    streetLayerRef.current = streetLayer;

    map.on('dragstart', () => {
      setIsFollowing(false);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (allowTapRef.current && onPickRef.current) {
        onPickRef.current({lat: e.latlng.lat, lng: e.latlng.lng});
      }
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      satLayerRef.current = null;
      labelsLayerRef.current = null;
      streetLayerRef.current = null;
      expectedLineRef.current = null;
      actualLineRef.current = null;
      geofenceCircleRef.current = null;
      destMarkerRef.current = null;
      travelerMarkerRef.current = null;
    };
  }, []);

  // Switch active tile layers when mapType changes
  useEffect(() => {
    const map = mapRef.current;
    const sat = satLayerRef.current;
    const labels = labelsLayerRef.current;
    const street = streetLayerRef.current;
    if (!map || !sat || !labels || !street) return;

    if (map.hasLayer(sat)) map.removeLayer(sat);
    if (map.hasLayer(labels)) map.removeLayer(labels);
    if (map.hasLayer(street)) map.removeLayer(street);

    if (mapType === 'hybrid') {
      sat.addTo(map);
      labels.addTo(map);
    } else if (mapType === 'satellite') {
      sat.addTo(map);
    } else {
      street.addTo(map);
    }
  }, [mapType]);

  // Planned route polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (expectedLineRef.current) {
      expectedLineRef.current.remove();
      expectedLineRef.current = null;
    }

    if (expectedPath.length > 1) {
      expectedLineRef.current = L.polyline(
        expectedPath.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color: '#5EEAD4',
          opacity: 0.8,
          weight: 5,
        }
      ).addTo(map);
    }
  }, [expectedPath]);

  // Actual live trail polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (actualLineRef.current) {
      actualLineRef.current.remove();
      actualLineRef.current = null;
    }

    if (actualPath.length > 1) {
      const color =
        travelerStatus === 'sos_alert'
          ? '#FB7185'
          : travelerStatus === 'route_deviation'
          ? '#FBBF24'
          : '#34D399';
      actualLineRef.current = L.polyline(
        actualPath.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color,
          opacity: 0.98,
          weight: 5,
        }
      ).addTo(map);
    }
  }, [actualPath, travelerStatus]);

  // Destination marker & geofence circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (geofenceCircleRef.current) {
      geofenceCircleRef.current.remove();
      geofenceCircleRef.current = null;
    }
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }

    if (destinationPosition) {
      const stroke =
        travelerStatus === 'reached_safely' ? '#10B981' : '#2DD4BF';
      const fill = travelerStatus === 'reached_safely' ? '#10B981' : '#14B8A6';

      geofenceCircleRef.current = L.circle(
        [destinationPosition.lat, destinationPosition.lng],
        {
          radius: geofenceRadiusMeters,
          color: stroke,
          opacity: 0.9,
          weight: 2,
          fillColor: fill,
          fillOpacity: 0.18,
        }
      ).addTo(map);

      const destIcon = L.divIcon({
        className: 'safereach-dest-icon',
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:#1C1917;border:2px solid #FFFFFF;color:#FFFFFF;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.35);">D</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      destMarkerRef.current = L.marker(
        [destinationPosition.lat, destinationPosition.lng],
        {
          icon: destIcon,
          title: destinationLabel || 'Destination Geofence',
        }
      )
        .bindPopup(
          `<div style="font-size:12px;font-weight:600;color:#1C1917;">${escapeHtml(
            destinationLabel || 'Destination Geofence'
          )}</div><div style="font-size:11px;color:#57534E;">Geofence: ${geofenceRadiusMeters}m</div>`
        )
        .addTo(map);
    }
  }, [
    destinationPosition?.lat,
    destinationPosition?.lng,
    destinationLabel,
    geofenceRadiusMeters,
    travelerStatus,
  ]);

  // Smooth live traveler marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!smoothTravelerPosition) {
      if (travelerMarkerRef.current) {
        travelerMarkerRef.current.remove();
        travelerMarkerRef.current = null;
      }
      return;
    }

    const palette = getStatusPinPalette(travelerStatus);
    const isLiveMoving =
      travelerStatus === 'travelling' ||
      travelerStatus === 'route_deviation' ||
      travelerStatus === 'sos_alert';

    const pulseHtml = isLiveMoving
      ? `<span class="absolute w-11 h-11 rounded-full ${palette.pulseClass} opacity-40 animate-ping pointer-events-none"></span>`
      : '';

    const travelerIcon = L.divIcon({
      className: 'safereach-traveler-icon',
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:44px;height:44px;">${pulseHtml}<div style="position:relative;width:36px;height:36px;border-radius:9999px;background:${palette.background};border:2px solid #FFFFFF;box-shadow:0 6px 14px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg></div></div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    const popupContent = `<div style="min-width:160px;"><div style="font-weight:600;font-size:13px;color:#1C1917;">${escapeHtml(
      travelerLabel
    )}</div><div style="font-family:monospace;font-size:11px;color:#57534E;margin-top:2px;">${smoothTravelerPosition.lat.toFixed(
      5
    )}, ${smoothTravelerPosition.lng.toFixed(5)}</div>${
      travelerUpdatedLabel
        ? `<div style="font-size:11px;color:#78716C;margin-top:3px;">Updated ${escapeHtml(
            travelerUpdatedLabel
          )}</div>`
        : ''
    }</div>`;

    if (!travelerMarkerRef.current) {
      travelerMarkerRef.current = L.marker(
        [smoothTravelerPosition.lat, smoothTravelerPosition.lng],
        {
          icon: travelerIcon,
          title: travelerLabel,
        }
      )
        .bindPopup(popupContent)
        .addTo(map);
    } else {
      travelerMarkerRef.current.setLatLng([
        smoothTravelerPosition.lat,
        smoothTravelerPosition.lng,
      ]);
      travelerMarkerRef.current.setIcon(travelerIcon);
      travelerMarkerRef.current.setPopupContent(popupContent);
    }
  }, [
    smoothTravelerPosition?.lat,
    smoothTravelerPosition?.lng,
    travelerLabel,
    travelerStatus,
    travelerUpdatedLabel,
  ]);

  // Fit bounds on focusTrigger or destination change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (travelerPosition && destinationPosition) {
      const bounds = L.latLngBounds(
        [travelerPosition.lat, travelerPosition.lng],
        [destinationPosition.lat, destinationPosition.lng]
      );
      map.fitBounds(bounds, {padding: [56, 56], maxZoom: 17});
    } else if (travelerPosition) {
      map.setView(
        [travelerPosition.lat, travelerPosition.lng],
        Math.max(map.getZoom(), 16)
      );
    } else if (destinationPosition) {
      map.setView(
        [destinationPosition.lat, destinationPosition.lng],
        Math.max(map.getZoom(), 16)
      );
    }
  }, [
    focusTrigger,
    internalFocusTrigger,
    destinationPosition?.lat,
    destinationPosition?.lng,
  ]);

  // Smoothly pan camera second-to-second when Follow Live is active
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isFollowing || !travelerPosition) return;
    map.panTo([travelerPosition.lat, travelerPosition.lng], {animate: true});
    if (map.getZoom() < 15) {
      map.setZoom(16);
    }
  }, [isFollowing, travelerPosition?.lat, travelerPosition?.lng]);

  return (
    <div className="relative w-full h-full min-h-[340px] rounded-2xl overflow-hidden border border-stone-200 bg-stone-900">
      <div
        ref={containerRef}
        className="w-full h-full min-h-[340px]"
        aria-label="SafeReach Live Map"
      />

      {/* Top-left prompt when picking destination */}
      {allowTapToPickDestination && (
        <div className="pointer-events-none absolute top-3 left-12 z-[400] bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm max-w-[240px]">
          Tap anywhere on map or search above to set destination
        </div>
      )}

      {/* Satellite / Map View & Follow Live Controls */}
      <div className="absolute bottom-4 left-3 z-[400] flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Map layer view"
          className="flex items-center gap-1 p-1 bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl shadow-sm"
        >
          <Layers className="w-3.5 h-3.5 text-stone-500 ml-1.5 mr-0.5 shrink-0" />
          <button
            type="button"
            onClick={() => setMapType('hybrid')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mapType === 'hybrid'
                ? 'bg-teal-700 text-white'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => setMapType('satellite')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mapType === 'satellite'
                ? 'bg-teal-700 text-white'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            Pure Sat
          </button>
          <button
            type="button"
            onClick={() => setMapType('roadmap')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mapType === 'roadmap'
                ? 'bg-teal-700 text-white'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            Street
          </button>
        </div>

        {travelerPosition && (
          <button
            type="button"
            onClick={() => {
              setIsFollowing(true);
              setInternalFocusTrigger((n) => n + 1);
            }}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer ${
              isFollowing
                ? 'bg-teal-700 border-teal-800 text-white'
                : 'bg-white/95 border-stone-200 text-stone-800 hover:bg-stone-100'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{isFollowing ? 'Following Live' : 'Center on User'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
