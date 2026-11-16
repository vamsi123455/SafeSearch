import React, {useEffect, useMemo, useState} from 'react';
import {
  AdvancedMarker,
  Circle,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  Polyline,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import {MapPin, Navigation} from 'lucide-react';
import {decodePolyline} from '../../lib/geofence';
import {JourneyStatus, LatLngPoint} from '../../types/safereach';

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
}

const DEFAULT_MAP_CENTER: LatLngPoint = {lat: 13.6288, lng: 79.4192};

const HAS_MAPS_API_KEY = Boolean(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    (typeof process !== 'undefined' && process.env?.GOOGLE_MAPS_API_KEY)
);

function getStatusPinPalette(status: JourneyStatus): {
  background: string;
  borderColor: string;
  glyphColor: string;
} {
  switch (status) {
    case 'reached_safely':
      return {background: '#047857', borderColor: '#064E3B', glyphColor: '#FFFFFF'};
    case 'sos_alert':
      return {background: '#BE123C', borderColor: '#881337', glyphColor: '#FFFFFF'};
    case 'route_deviation':
    case 'signal_stale':
      return {background: '#B45309', borderColor: '#78350F', glyphColor: '#FFFFFF'};
    case 'travelling':
      return {background: '#0F766E', borderColor: '#134E4A', glyphColor: '#FFFFFF'};
    default:
      return {background: '#57534E', borderColor: '#292524', glyphColor: '#FFFFFF'};
  }
}

function MapViewportController({
  travelerPosition,
  destinationPosition,
  focusTrigger,
}: {
  travelerPosition: LatLngPoint | null;
  destinationPosition: LatLngPoint | null;
  focusTrigger?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (travelerPosition && destinationPosition) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(travelerPosition);
      bounds.extend(destinationPosition);
      map.fitBounds(bounds, 64);
    } else if (travelerPosition) {
      map.panTo(travelerPosition);
      if ((map.getZoom() ?? 0) < 14) {
        map.setZoom(15);
      }
    } else if (destinationPosition) {
      map.panTo(destinationPosition);
      if ((map.getZoom() ?? 0) < 14) {
        map.setZoom(15);
      }
    }
  }, [map, focusTrigger, destinationPosition?.lat, destinationPosition?.lng]);

  return null;
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
}: SafeReachMapProps) {
  const apiStatus = useApiLoadingStatus();
  const [travelerMarkerRef, travelerMarker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(false);

  const expectedPath = useMemo(
    () => decodePolyline(expectedEncodedPolyline),
    [expectedEncodedPolyline]
  );
  const actualPath = useMemo(
    () => decodePolyline(actualEncodedPolyline),
    [actualEncodedPolyline]
  );

  const pinPalette = getStatusPinPalette(travelerStatus);
  const circleStroke =
    travelerStatus === 'reached_safely' ? '#047857' : '#0F766E';
  const circleFill =
    travelerStatus === 'reached_safely' ? '#10B981' : '#14B8A6';

  if (
    !HAS_MAPS_API_KEY ||
    apiStatus === APILoadingStatus.FAILED ||
    apiStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="w-full h-full min-h-[340px] bg-stone-100 border border-stone-200 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
        <MapPin className="w-8 h-8 text-stone-400 mb-2" />
        <p className="text-sm font-medium text-stone-800">
          Map view temporarily unavailable
        </p>
        <p className="text-xs text-stone-500 mt-1 max-w-xs">
          Live GPS coordinates and geofence arrival tracking continue to sync in
          the background.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[340px] rounded-2xl overflow-hidden border border-stone-200 bg-stone-100">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={center || DEFAULT_MAP_CENTER}
        defaultZoom={15}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={true}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{width: '100%', height: '100%'}}
        onClick={(e) => {
          if (allowTapToPickDestination && onMapPickDestination && e.detail.latLng) {
            onMapPickDestination({
              lat: e.detail.latLng.lat,
              lng: e.detail.latLng.lng,
            });
          }
        }}
      >
        <MapViewportController
          travelerPosition={travelerPosition}
          destinationPosition={destinationPosition}
          focusTrigger={focusTrigger}
        />

        {expectedPath.length > 1 && (
          <Polyline
            path={expectedPath}
            strokeColor="#0F766E"
            strokeOpacity={0.45}
            strokeWeight={5}
            geodesic={true}
          />
        )}

        {actualPath.length > 1 && (
          <Polyline
            path={actualPath}
            strokeColor={
              travelerStatus === 'sos_alert'
                ? '#BE123C'
                : travelerStatus === 'route_deviation'
                ? '#D97706'
                : '#0F766E'
            }
            strokeOpacity={0.95}
            strokeWeight={5}
            geodesic={true}
          />
        )}

        {destinationPosition && (
          <>
            <Circle
              center={destinationPosition}
              radius={geofenceRadiusMeters}
              strokeColor={circleStroke}
              strokeOpacity={0.85}
              strokeWeight={2}
              fillColor={circleFill}
              fillOpacity={0.14}
            />
            <AdvancedMarker
              position={destinationPosition}
              title={destinationLabel || 'Destination Geofence'}
            >
              <Pin
                background="#1C1917"
                borderColor="#0C0A09"
                glyphColor="#FFFFFF"
                glyphText="D"
              />
            </AdvancedMarker>
          </>
        )}

        {travelerPosition && (
          <AdvancedMarker
            ref={travelerMarkerRef}
            position={travelerPosition}
            title={travelerLabel}
            onClick={() => setInfoOpen((prev) => !prev)}
          >
            <Pin
              background={pinPalette.background}
              borderColor={pinPalette.borderColor}
              glyphColor={pinPalette.glyphColor}
              scale={1.15}
            >
              <Navigation className="w-4 h-4 text-white" />
            </Pin>
          </AdvancedMarker>
        )}

        {infoOpen && travelerMarker && travelerPosition && (
          <InfoWindow
            anchor={travelerMarker}
            onCloseClick={() => setInfoOpen(false)}
          >
            <div className="p-1 text-stone-900 max-w-[200px]">
              <div className="font-semibold text-sm">{travelerLabel}</div>
              <div className="text-xs text-stone-600 mt-0.5">
                {travelerPosition.lat.toFixed(5)}, {travelerPosition.lng.toFixed(5)}
              </div>
              {travelerUpdatedLabel && (
                <div className="text-xs text-stone-500 mt-1">
                  Updated {travelerUpdatedLabel}
                </div>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {allowTapToPickDestination && (
        <div className="pointer-events-none absolute top-3 left-3 bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm">
          Tap anywhere on map or search above to set destination
        </div>
      )}
    </div>
  );
}
